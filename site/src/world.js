/* =========================================================================
   NEON DISTRICT — city, wet ground, sky and planar mirror
   ========================================================================= */
(function () {
  'use strict';
  const ND = (window.ND = window.ND || {});
  const TAU = Math.PI * 2;
  const V3 = THREE.Vector3;
  const M4 = THREE.Matrix4;

  function materialSignature(m) {
    if (!m) return 'none';
    const mapKey = (map) => {
      if (!map) return '';
      const src = map.source && map.source.uuid ? map.source.uuid : map.uuid;
      return [src, map.repeat.x, map.repeat.y, map.offset.x, map.offset.y, map.rotation, map.colorSpace, map.channel, map.flipY].join(',');
    };
    const common = [m.type, m.side, m.vertexColors, m.toneMapped, m.transparent, m.opacity, m.alphaTest, m.depthTest, m.depthWrite, m.blending, m.flatShading].join('|');
    if (m.isMeshStandardMaterial) {
      return common + '|' + [
        m.color.getHexString(), m.emissive.getHexString(), m.emissiveIntensity,
        m.roughness, m.metalness, m.envMapIntensity, m.aoMapIntensity,
        m.normalScale.x, m.normalScale.y, m.bumpScale,
        mapKey(m.map), mapKey(m.emissiveMap), mapKey(m.normalMap), mapKey(m.roughnessMap),
        mapKey(m.metalnessMap), mapKey(m.aoMap), mapKey(m.alphaMap), mapKey(m.bumpMap)
      ].join('|');
    }
    if (m.isMeshBasicMaterial) {
      return common + '|' + [m.color.getHexString(), mapKey(m.map), mapKey(m.alphaMap), m.wireframe].join('|');
    }
    if (m.isMeshLambertMaterial) {
      return common + '|' + [m.color.getHexString(), m.emissive.getHexString(), m.emissiveIntensity, mapKey(m.map), mapKey(m.emissiveMap), mapKey(m.alphaMap)].join('|');
    }
    return m.uuid;
  }


  const GROUND_VERT = `
    #include <common>
    #include <shadowmap_pars_vertex>
    uniform mat4 uTextureMatrix;
    varying vec3 vWorld;
    varying vec3 vView;
    varying vec4 vReflect;
    varying vec2 vGroundUv;
    void main() {
      vec3 transformedNormal = normalMatrix * normal;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vec4 world = worldPosition;
      vWorld = world.xyz;
      vReflect = uTextureMatrix * world;
      vView = normalize(cameraPosition - world.xyz);
      vGroundUv = uv;
      gl_Position = projectionMatrix * viewMatrix * world;
      #include <shadowmap_vertex>
    }
  `;

  const GROUND_FRAG = `
    #include <common>
    #include <packing>
    uniform bool receiveShadow;
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    uniform sampler2D tReflection;
    uniform sampler2D tWetMap;
    uniform float uTime;
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    uniform vec3 uLightPos[9];
    uniform vec3 uLightColor[9];
    uniform float uKind;
    varying vec3 vWorld;
    varying vec3 vView;
    varying vec4 vReflect;
    varying vec2 vGroundUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float fbm(vec2 p, int oct) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) {
        if (i >= oct) break;
        v += a * vnoise(p);
        p = p * 2.03 + 17.17;
        a *= 0.5;
      }
      return v;
    }
    float rippleHeight(vec2 p, float t) {
      // Micro-normal noise only: no expanding rain rings on the pavement.
      return (vnoise(p * 17.0 + vec2(t * 2.7, -t * 1.9)) - 0.5) * 0.0175;
    }

    void main() {
      vec2 p = vWorld.xz;
      vec3 V = normalize(vView);
      float kind = uKind;

      float large = fbm(p * 0.185 + vec2(3.1, 7.7), 4);
      float fine = fbm(p * 1.45 + 11.0, 3);
      float puddle = smoothstep(0.37, 0.53, large + fine * 0.035);
      puddle = max(puddle, (1.0 - smoothstep(0.0, 1.5, abs(abs(p.x) - 7.6))) * smoothstep(0.28, 0.62, large) * 0.85);
      puddle *= 0.72 + 0.28 * smoothstep(0.0, 4.0, abs(p.x));
      vec2 wetUv = vec2((p.x + 23.0) / 46.0, (p.y + 170.0) / 430.0);
      float wetMask = texture2D(tWetMap, wetUv).r;
      puddle *= mix(0.20, 1.0, wetMask);

      vec2 tileUv = kind > 0.5 ? p * vec2(2.6, 2.1) : p / 1.18;
      vec2 tf = fract(tileUv);
      float grout = smoothstep(0.045, 0.0, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)));
      float tile = hash21(floor(tileUv));
      vec3 stone = mix(vec3(0.028, 0.031, 0.040), vec3(0.065, 0.064, 0.075), tile);
      stone *= 0.72 + 0.28 * (0.6 + 0.4 * fine);
      stone = mix(stone, vec3(0.006, 0.007, 0.010), grout * 0.78);

      // crosswalk at the old intersection
      float crossZone = step(-28.0, p.y) * step(p.y, -24.6) * step(abs(p.x), 7.8);
      float stripe = step(0.5, fract(p.x * 0.92));
      stone = mix(stone, vec3(0.27, 0.29, 0.30), crossZone * stripe * (0.55 + 0.2 * fine));

      // long drainage channels
      float channel = smoothstep(0.055, 0.0, abs(abs(p.x) - 8.9));
      stone = mix(stone, vec3(0.012, 0.014, 0.018), channel * 0.7);

      float h0 = rippleHeight(p, uTime);
      float hx = rippleHeight(p + vec2(0.055, 0.0), uTime);
      float hz = rippleHeight(p + vec2(0.0, 0.055), uTime);
      vec2 grad = vec2(hx - h0, hz - h0) / 0.055;
      vec3 N = normalize(vec3(-grad.x * 0.006, 1.0, -grad.y * 0.006));
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = 0.035 + 0.965 * pow(1.0 - ndv, 5.0);

      vec2 ruv = vReflect.xy / max(vReflect.w, 0.0001);
      ruv += grad * 0.0018 + (vec2(vnoise(p * 9.0), vnoise(p * 8.0 + 9.0)) - 0.5) * 0.0004;
      float spread = 0.0065 + (1.0 - puddle) * 0.013;
      vec3 refl = texture2D(tReflection, ruv).rgb * 0.16;
      float reflWeight = 0.16;
      for (int i = 1; i <= 6; i++) {
        float fi = float(i);
        float wgt = 1.0 / (fi * 1.15 + 1.0);
        vec2 ofs = vec2(0.00065 * fi, spread * fi * 0.52);
        refl += texture2D(tReflection, ruv + ofs).rgb * wgt;
        refl += texture2D(tReflection, ruv - ofs).rgb * wgt;
        reflWeight += wgt * 2.0;
      }
      refl /= reflWeight;

      float reflAmount = mix(0.30, 0.98, puddle) * (0.60 + 0.40 * fresnel) * (1.0 - grout * 0.42);
      reflAmount *= mix(0.45, 1.0, wetMask);
      float gutterFlow = smoothstep(0.075, 0.0, abs(abs(p.x) - 8.9));
      float flowPulse = sin(p.y * 3.8 - uTime * 2.1 + vnoise(p * 4.0) * 3.0) * 0.5 + 0.5;
      reflAmount = clamp(reflAmount + gutterFlow * (0.16 + 0.22 * flowPulse), 0.0, 0.98);
      vec3 col = stone * (0.34 + 0.66 * (1.0 - puddle));
      col += vec3(0.035, 0.075, 0.11) * gutterFlow * (0.25 + 0.75 * flowPulse);

      // street light spill, physically-ish inverse square
      vec3 spill = vec3(0.0);
      for (int i = 0; i < 9; i++) {
        vec3 toL = uLightPos[i] - vWorld;
        float dist2 = dot(toL.xz, toL.xz);
        float att = 1.0 / (1.0 + dist2 * 0.11);
        vec3 L = normalize(toL);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 72.0) * (0.22 + 0.78 * puddle);
        spill += uLightColor[i] * att * (0.085 + spec * 0.9);
      }
      col += spill * (0.55 + puddle * 0.9);
      col = mix(col, refl, clamp(reflAmount, 0.0, 0.96));

      // thin wet rim highlights
      col += vec3(0.075, 0.095, 0.14) * pow(fresnel, 5.0) * 0.35;
      // dying rain sparkle
      float sparkle = pow(max(0.0, vnoise(p * 44.0 + uTime * 1.4) - 0.88), 8.0) * 1.1;
      col += vec3(0.42, 0.63, 0.85) * sparkle * (0.10 + 0.90 * puddle) * 0.55;

      // baked, world-space occlusion at the building line and plaza end
      float wallAO = smoothstep(8.4, 12.7, abs(p.x));
      float endAO = 1.0 - smoothstep(-78.0, -57.0, p.y);
      float curbAO = smoothstep(0.45, 0.0, abs(abs(p.x) - 9.72));
      col *= 1.0 - clamp(wallAO * 0.22 + endAO * 0.15 + curbAO * 0.08, 0.0, 0.34);
      #ifdef USE_SHADOWMAP
        float shadowMask = getShadowMask();
        col *= mix(0.62, 1.0, shadowMask);
      #endif

      float depth = length(cameraPosition - vWorld);
      float fogAmt = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth * 1.35);
      col = mix(col, uFogColor, clamp(fogAmt, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const WATER_FRAG = `
    uniform sampler2D tReflection;
    uniform float uTime;
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    uniform vec3 uLightPos[9];
    uniform vec3 uLightColor[9];
    varying vec3 vWorld;
    varying vec3 vView;
    varying vec4 vReflect;
    varying vec2 vGroundUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float waveHeight(vec2 p, float t) {
      // Broad wind waves only; no rain-drop rings in the plaza water.
      float h = 0.0;
      h += sin(p.x * 2.7 + t * 1.45) * 0.040;
      h += sin(p.y * 3.9 - t * 1.9 + p.x * 0.7) * 0.030;
      h += sin((p.x + p.y) * 6.2 + t * 2.7) * 0.012;
      return h;
    }

    void main() {
      vec2 p = vWorld.xz;
      vec3 V = normalize(vView);
      float h0 = waveHeight(p, uTime);
      float hx = waveHeight(p + vec2(0.035, 0.0), uTime);
      float hz = waveHeight(p + vec2(0.0, 0.035), uTime);
      vec2 grad = vec2(hx - h0, hz - h0) / 0.035;
      vec3 N = normalize(vec3(-grad.x * 0.75, 1.0, -grad.y * 0.75));
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 4.2);

      vec2 ruv = vReflect.xy / max(vReflect.w, 0.0001);
      ruv += grad * 0.020;
      vec3 refl = texture2D(tReflection, ruv).rgb * 0.52;
      refl += texture2D(tReflection, ruv + vec2(0.0022, 0.0)).rgb * 0.12;
      refl += texture2D(tReflection, ruv - vec2(0.0022, 0.0)).rgb * 0.12;
      refl += texture2D(tReflection, ruv + vec2(0.0, 0.0022)).rgb * 0.12;
      refl += texture2D(tReflection, ruv - vec2(0.0, 0.0022)).rgb * 0.12;
      refl *= 1.35;

      vec3 deep = vec3(0.003, 0.014, 0.021);
      vec3 col = deep;
      for (int i = 0; i < 9; i++) {
        vec3 toL = uLightPos[i] - vWorld;
        float att = 1.0 / (1.0 + dot(toL.xz, toL.xz) * 0.12);
        vec3 L = normalize(toL);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 90.0);
        col += uLightColor[i] * att * (0.025 + spec * 0.42);
      }
      col = mix(col, refl, clamp(0.63 + fresnel * 0.33, 0.0, 0.96));
      col += refl * vec3(0.035, 0.065, 0.09);

      // foam and edge glow
      vec2 uv = vGroundUv;
      float edge = smoothstep(0.0, 0.035, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
      float foam = (1.0 - edge) * (0.35 + 0.65 * vnoise(p * 12.0 + uTime * 0.5));
      col += vec3(0.35, 0.62, 0.72) * foam * 0.18;
      col += vec3(0.02, 0.10, 0.14) * pow(fresnel, 3.0) * 0.18;

      float depth = length(cameraPosition - vWorld);
      float fogAmt = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth * 1.35);
      col = mix(col, uFogColor, clamp(fogAmt, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vDir = normalize(world.xyz - cameraPosition);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;

  const SKY_FRAG = `
    uniform float uTime;
    uniform float uLightning;
    varying vec3 vDir;
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p = p * 2.06 + 13.7;
        a *= 0.5;
      }
      return v;
    }
    void main() {
      vec3 d = normalize(vDir);
      float az = atan(d.z, d.x) / 6.2831853 + 0.5;
      float el = acos(clamp(d.y, -1.0, 1.0)) / 3.1415926;
      vec2 uv = vec2(az, el);
      vec2 drift = vec2(uTime * 0.0035, uTime * 0.0012);
      float c1 = fbm(vec2(uv.x * 5.0, uv.y * 10.0) + drift);
      float c2 = fbm(vec2(uv.x * 11.0 + 7.0, uv.y * 20.0) - drift * 1.7);
      float cloud = smoothstep(0.30, 0.78, c1 * 0.72 + c2 * 0.38);

      vec3 zenith = vec3(0.005, 0.008, 0.025);
      vec3 horizon = vec3(0.12, 0.035, 0.14);
      float hy = pow(clamp(1.0 - d.y, 0.0, 1.0), 3.2);
      vec3 col = mix(zenith, horizon, hy);
      // city light pollution glowing from the end of the canyon
      float city = pow(max(0.0, -d.z), 6.5) * exp(-abs(d.y) * 4.4);
      col += vec3(0.24, 0.045, 0.19) * city;
      col += vec3(0.32, 0.12, 0.03) * pow(max(0.0, -d.z), 12.0) * exp(-abs(d.y) * 8.0) * 0.7;

      // bruised rain clouds
      vec3 cloudDark = vec3(0.018, 0.019, 0.040);
      vec3 cloudLit = vec3(0.13, 0.055, 0.16);
      vec3 cloudCol = mix(cloudDark, cloudLit, smoothstep(0.25, 0.95, c1) * (0.5 + 0.5 * hy));
      col = mix(col, cloudCol, cloud * 0.92);
      float rim = smoothstep(0.38, 0.64, c1) * smoothstep(0.72, 0.98, c2);
      col += vec3(0.32, 0.11, 0.35) * rim * 0.16;

      // distant lightning bloom inside the clouds
      col += vec3(0.44, 0.58, 1.0) * uLightning * (0.28 + cloud * 0.85);

      // cold moon, whetted by storm
      vec3 moonDir = normalize(vec3(-0.42, 0.55, -0.72));
      float moonDot = max(dot(d, moonDir), 0.0);
      col += vec3(0.46, 0.58, 0.72) * pow(moonDot, 220.0) * 0.75;
      col += vec3(0.11, 0.15, 0.25) * pow(moonDot, 18.0) * 0.3;

      // fine rain veil
      float veil = fbm(vec2(uv.x * 65.0 + uTime * 0.3, uv.y * 5.0));
      col += vec3(0.06, 0.08, 0.12) * veil * 0.18;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const SCREEN_VERT = `
    varying vec2 vUv;
    varying float vDepth;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;

  const SCREEN_FRAG = `
    uniform sampler2D uMap;
    uniform float uTime;
    uniform float uSeed;
    uniform float uIntensity;
    uniform float uRepeat;
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    varying vec2 vUv;
    varying float vDepth;
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }
    void main() {
      float glitch = step(0.992, sin(uTime * 1.43 + uSeed * 11.0) * sin(uTime * 0.29 + uSeed * 3.1));
      float band = step(0.93, hash21(vec2(floor(vUv.y * 70.0), floor(uTime * 8.0))));
      vec2 uv = vUv;
      uv.x = fract(uv.x * uRepeat);
      uv.x += (hash21(vec2(floor(vUv.y * 85.0), floor(uTime * 14.0))) - 0.5) * 0.012 * glitch * band;
      float scan = 0.93 + 0.07 * sin(vUv.y * 900.0 - uTime * 18.0 + uSeed * 5.0);
      float shift = 0.0016 + glitch * 0.0025;
      vec3 col;
      col.r = texture2D(uMap, uv + vec2(shift, 0.0)).r;
      col.g = texture2D(uMap, uv).g;
      col.b = texture2D(uMap, uv - vec2(shift, 0.0)).b;
      col *= scan * uIntensity;
      col *= 0.94 + 0.06 * sin(uTime * 2.7 + uSeed * 7.0);
      // glass sheen
      float sheen = smoothstep(0.2, 0.9, vUv.x) * (1.0 - smoothstep(0.2, 0.9, vUv.x));
      col += vec3(0.08, 0.11, 0.16) * sheen * 0.15;
      float fogAmt = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
      col = mix(col, uFogColor, clamp(fogAmt, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function disposeObject(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => { if (m.uniforms) Object.values(m.uniforms).forEach(u => { if (u.value && u.value.dispose) u.value.dispose(); }); m.dispose(); });
      }
    });
  }

  function addFacadeWindowVariation(mat) {
    // One shared shader program for every facade: per-window variation comes
    // from the UV cell itself, not a per-material uniform. This is important
    // now that the street has twice as many buildings.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 cell = floor(vEmissiveMapUv * vec2(7.0, 17.0));
        float winSeed = fract(sin(dot(cell, vec2(12.9898, 78.233)) + 19.7) * 43758.5453);
        float winLit = smoothstep(0.10, 0.90, winSeed);
        totalEmissiveRadiance *= mix(0.28, 1.28, winLit);
        float winLuma = dot(totalEmissiveRadiance, vec3(0.333));
        totalEmissiveRadiance *= mix(0.62, 1.0, smoothstep(0.008, 0.055, winLuma));`
      );
    };
    mat.customProgramCacheKey = () => 'facade-window-variation';
  }

  class World {
    constructor(scene, renderer, opts) {
      this.scene = scene;
      this.renderer = renderer;
      this.opts = opts || {};
      this.quality = this.opts.quality || {};
      this.time = 0;
      this.flash = 0;
      this.nextLightning = 7.5;
      this.lightningActive = false;
      this.lightningElapsed = 0;
      this.lightningCameraPos = new V3();
      this.cameraYaw = 0;
      this._reflCamPos = new V3();
      this._reflNormal = new V3(0, 1, 0);
      this._reflView = new V3();
      this._reflLook = new V3();
      this._reflTarget = new V3();
      this._reflRot = new M4();
      this.onLightning = null;
      this.onLifeEvent = null;
      this.random = ND.util.mulberry32(92731);
      this.fogColor = new THREE.Color(0x12081d);
      this.fogDensity = 0.0074;
      this.screens = [];
      this.pedestrians = [];
      this.fogCards = [];
      this.neonMats = [];
      this.acMatrices = [];
      this.acLedMatrices = [];
      this.acLedColors = [];
      this.balconyMatrices = [];
      this.railMatrices = [];
      this.pipeMatrices = [];
      this.ledgeMatrices = [];
      this.laundryMatrices = [];
      this.laundryColors = [];
      this.facadeSillMatrices = [];
      this.facadeMullionMatrices = [];
      this.windowFrameMatrices = [];
      this.windowSilhouetteMatrices = [];
      this.curtainMatrices = [];
      this.curtainColors = [];
      this.neonBatches = { magenta: [], cyan: [], amber: [], violet: [] };
      this.neonSpills = [];
      this.reflectionHidden = [];
      this.dynamicGlow = [];
      this.colliders = [];
      this.lifeSigns = [];
      this.lifeSways = [];
      this.vendingMats = [];
      this.dripSpots = [];
      this.groundLights = [
        { p: new V3(-10.7, 8.2, 15.0), c: new THREE.Color(0xff2d8f).multiplyScalar(2.0) },
        { p: new V3(10.8, 11.0, 1.5), c: new THREE.Color(0x23d7ff).multiplyScalar(1.8) },
        { p: new V3(0.0, 18.0, -76.0), c: new THREE.Color(0xff7a3b).multiplyScalar(2.3) },
        { p: new V3(-10.6, 7.5, -34.0), c: new THREE.Color(0x8a5bff).multiplyScalar(1.7) },
        { p: new V3(10.5, 8.6, -48.0), c: new THREE.Color(0xff4b9e).multiplyScalar(1.7) },
        { p: new V3(0.0, 5.4, 27.0), c: new THREE.Color(0xffb15b).multiplyScalar(1.3) },
        { p: new V3(-10.0, 4.2, 122.0), c: new THREE.Color(0xff9a4d).multiplyScalar(1.5) },
        { p: new V3(11.2, 8.0, 152.0), c: new THREE.Color(0xff2d8e).multiplyScalar(1.7) },
        { p: new V3(0.0, 10.0, 178.0), c: new THREE.Color(0x5ff4ff).multiplyScalar(1.8) }
      ];

      this.scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity);
      this.buildMaterials();
      this.buildSky();
      this.buildLightning();
      this.buildEnvironment();
      this.buildLights();
      this.buildCity();
      this.buildGround();
      this.buildWater();
      this.buildStreetDetails();
      this.buildNeonSpills();
      this.applyStaticShadows();
      this.buildAtmosphere();
      this.buildAirDust();
      this.buildRain();
      this.buildCharacters();
      this.buildVehicles();
      this.buildHologram();
      this.buildLife();
      for (const p of this.pedestrians) {
        const u = p.userData;
        this.mergeGroupStatic(p, [u.head, u.hem, u.tail, u.umbrella, ...u.legs, ...u.knees, ...u.arms]);
      }
      for (const f of this.flyers) this.mergeGroupStatic(f, []);
      if (this.cat) this.mergeGroupStatic(this.cat, [this.catTail]);
      this.batchGlowSprites();
      this.mergeStaticGeometry();
      this.buildReflection();
      this.applyEnvironmentIntensity();
    }

    applyEnvironmentIntensity() {
      this.scene.traverse(o => {
        if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
          o.material.envMapIntensity = 0.6;
        }
      });
    }

    buildMaterials() {
      this.facadeCanvases = [];
      const palettes = [
        ['#ffb066', '#ffd28f', '#66e6ff', '#ff5dbb'],
        ['#ffd08a', '#ff9b54', '#5ee7ff', '#ff6aae'],
        ['#6de7ff', '#a5f2ff', '#ffc47a', '#ff66b2'],
        ['#ff4fbb', '#ff87ca', '#6ce8ff', '#ffcf8a'],
        ['#ffcf8a', '#ff7a53', '#8ea9ff', '#6ff0ff']
      ];
      for (let i = 0; i < 7; i++) {
        this.facadeCanvases.push(ND.Tex.facade(1201 + i * 97, palettes[i % palettes.length]));
      }
      const windowVert = `
        varying vec2 vUv;
        varying vec3 vViewDir;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vUv = uv;
          vViewDir = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `;
      const windowFrag = `
        uniform sampler2D uMap;
        uniform vec3 uTint;
        varying vec2 vUv;
        varying vec3 vViewDir;
        void main() {
          // small parallax offset: the interior shifts against the frame as the camera moves
          vec2 uv = vUv + vec2(vViewDir.x, vViewDir.y) * 0.055;
          uv = clamp(uv, 0.002, 0.998);
          vec3 col = texture2D(uMap, uv).rgb * uTint;
          float edge = smoothstep(0.0, 0.035, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
          col *= 0.58 + 0.42 * edge;
          gl_FragColor = vec4(col, 1.0);
        }
      `;
      this.heroWindowMats = [0,1,2,3].map(i => {
        const tex = ND.Tex.canvasToTexture(ND.Tex.interior(31 + i * 17, i % 2 === 0));
        return new THREE.ShaderMaterial({
          uniforms: { uMap: { value: tex }, uTint: { value: new THREE.Color(0.68, 0.66, 0.70) } },
          vertexShader: windowVert,
          fragmentShader: windowFrag
        });
      });
      this.facadeBumpBase = ND.Tex.canvasToTexture(ND.Tex.facadeBump(), false);
      this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x14131b, roughness: 0.82, metalness: 0.12 });
      this.roofMat = new THREE.MeshStandardMaterial({ color: 0x0b0c12, roughness: 0.72, metalness: 0.25 });
      this.metalMat = new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.38, metalness: 0.72 });
      this.rustMat = new THREE.MeshStandardMaterial({ color: 0x2a1712, roughness: 0.55, metalness: 0.6 });
      this.billboardFrameMat = new THREE.MeshStandardMaterial({ color: 0x08090e, roughness: 0.35, metalness: 0.85 });
      const silhouetteCanvas = ND.util.makeCanvas(128, 256);
      const sc = silhouetteCanvas.getContext('2d');
      sc.clearRect(0, 0, 128, 256);
      sc.fillStyle = 'rgba(3,4,8,.72)';
      sc.beginPath(); sc.arc(64, 76, 24, 0, TAU); sc.fill();
      sc.beginPath(); sc.moveTo(30, 220); sc.lineTo(36, 108); sc.quadraticCurveTo(64, 82, 92, 108); sc.lineTo(98, 220); sc.closePath(); sc.fill();
      sc.fillStyle = 'rgba(3,4,8,.45)'; sc.fillRect(0, 210, 128, 10);
      this.windowSilhouetteMat = new THREE.MeshBasicMaterial({
        map: ND.Tex.canvasToTexture(silhouetteCanvas, true), transparent: true, opacity: 0.78,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false
      });
      this.wetStreakMat = new THREE.MeshBasicMaterial({
        map: ND.Tex.canvasToTexture(ND.Tex.rainStreak(), true),
        color: 0x7898b5, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide
      });
    }

    buildSky() {
      const geo = new THREE.SphereGeometry(290, 40, 24);
      this.skyUniforms = {
        uTime: { value: 0 },
        uLightning: { value: 0 }
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false
      });
      this.sky = new THREE.Mesh(geo, mat);
      this.sky.frustumCulled = false;
      this.sky.renderOrder = -100;
      this.scene.add(this.sky);
    }

    buildLightning() {
      const rnd = ND.util.mulberry32(77113);
      const c = ND.util.makeCanvas(512, 1024);
      const x = c.getContext('2d');
      x.clearRect(0, 0, 512, 1024);
      const drawBolt = (fromX, fromY, toX, toY, width, alpha) => {
        x.save();
        x.strokeStyle = 'rgba(210,240,255,' + alpha + ')';
        x.lineWidth = width;
        x.shadowColor = 'rgba(120,210,255,.95)';
        x.shadowBlur = width * 4.2;
        x.beginPath();
        x.moveTo(fromX, fromY);
        const steps = 11;
        let px = fromX, py = fromY;
        for (let i = 1; i <= steps; i++) {
          const k = i / steps;
          px = fromX + (toX - fromX) * k + (rnd() - 0.5) * 34 * Math.sin(k * Math.PI);
          py = fromY + (toY - fromY) * k;
          x.lineTo(px, py);
        }
        x.stroke();
        x.restore();
      };
      // main channel and branches
      drawBolt(260, 20, 235, 990, 12, 0.95);
      drawBolt(260, 20, 235, 990, 4, 1.0);
      const branch = (bx, by, ex, ey) => {
        x.save();
        x.strokeStyle = 'rgba(180,230,255,.8)';
        x.lineWidth = 3;
        x.shadowColor = 'rgba(110,200,255,.9)';
        x.shadowBlur = 16;
        x.beginPath(); x.moveTo(bx, by);
        let px = bx, py = by;
        for (let i = 1; i <= 5; i++) {
          const k = i / 5;
          px = bx + (ex - bx) * k + (rnd() - 0.5) * 22;
          py = by + (ey - by) * k;
          x.lineTo(px, py);
        }
        x.stroke();
        x.restore();
      };
      branch(252, 210, 120, 420);
      branch(244, 430, 382, 610);
      branch(238, 660, 105, 820);
      const tex = ND.Tex.canvasToTexture(c, true);
      const glowTex = ND.Tex.canvasToTexture(ND.Tex.glow(128), true);
      this.lightningGroup = new THREE.Group();
      this.lightningGroup.visible = false;
      this.lightningCore = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
        depthTest: true, toneMapped: false, fog: false
      }));
      this.lightningGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0x7fb8ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
        depthTest: true, toneMapped: false, fog: false
      }));
      this.lightningGroup.add(this.lightningGlow);
      this.lightningGroup.add(this.lightningCore);
      this.scene.add(this.lightningGroup);
    }

    buildEnvironment() {
      const tex = ND.Tex.canvasToTexture(ND.Tex.environment(), true);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = tex;
      // tame the IBL slightly so the emissive signage still leads
      this.scene.traverse(o => {
        if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
          o.material.envMapIntensity = 0.55;
        }
      });
    }

    buildLights() {
      this.scene.add(new THREE.HemisphereLight(0x5b6fa8, 0x2b0a22, 1.22));
      this.keyLight = new THREE.DirectionalLight(0x9aabff, 0.9);
      this.keyLight.position.set(44, 120, 118);
      this.keyLight.target.position.set(0, 0, 48);
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(this.quality.shadowSize || 4096, this.quality.shadowSize || 4096);
      this.keyLight.shadow.camera.left = -86;
      this.keyLight.shadow.camera.right = 86;
      this.keyLight.shadow.camera.top = 160;
      this.keyLight.shadow.camera.bottom = -160;
      this.keyLight.shadow.camera.near = 1;
      this.keyLight.shadow.camera.far = 360;
      this.keyLight.shadow.bias = -0.00012;
      this.keyLight.shadow.normalBias = 0.035;
      this.scene.add(this.keyLight);
      this.scene.add(this.keyLight.target);
      const points = [
        { pos: [-11, 10, 16], color: 0xff2d8f, intensity: 190, distance: 45 },
        { pos: [11, 12, 0], color: 0x2adfff, intensity: 220, distance: 48 },
        { pos: [0, 24, -75], color: 0xff823c, intensity: 500, distance: 80 },
        { pos: [-11, 8, -35], color: 0x8a5bff, intensity: 170, distance: 40 },
        { pos: [11, 9, -50], color: 0xff4b9e, intensity: 170, distance: 42 },
        { pos: [0, 6, 27], color: 0xffb15b, intensity: 90, distance: 28 },
        { pos: [-10.0, 4.2, 122.0], color: 0xff9a4d, intensity: 100, distance: 24 },
        { pos: [11.2, 8.0, 152.0], color: 0xff2d8e, intensity: 130, distance: 28 },
        { pos: [-11.5, 8.0, 14.0], color: 0xff2d8f, intensity: 50, distance: 10 },
        { pos: [11.5, 8.0, -2.0], color: 0x2adfff, intensity: 50, distance: 10 },
        { pos: [-11.5, 6.8, -22.0], color: 0xffb15b, intensity: 42, distance: 9 },
        { pos: [11.5, 7.2, -38.0], color: 0x8a5bff, intensity: 42, distance: 9 }
      ];
      this.pointLights = [];
      for (const p of points) {
        const l = new THREE.PointLight(p.color, p.intensity, p.distance, 2);
        l.position.set(p.pos[0], p.pos[1], p.pos[2]);
        this.scene.add(l);
        this.pointLights.push(l);
      }
    }

    addNeonSpill(kind, x, y, z, width, height, color, intensity) {
      const c = (color && color.isColor ? color.clone() : new THREE.Color(color || 0xffffff)).multiplyScalar(intensity || 0.3);
      const px = kind === 'wall' ? x : x - width / 2;
      const pz = kind === 'wall' ? z - width / 2 : z - height / 2;
      if (kind === 'wall') {
        this.neonSpills.push({
          x: [x, x, x, x], y: [y - height / 2, y - height / 2, y + height / 2, y + height / 2],
          z: [z - width / 2, z + width / 2, z + width / 2, z - width / 2], c
        });
      } else {
        this.neonSpills.push({
          x: [x - width / 2, x + width / 2, x + width / 2, x - width / 2],
          y: [y, y, y, y],
          z: [z - height / 2, z - height / 2, z + height / 2, z + height / 2], c
        });
      }
    }

    buildNeonSpills() {
      if (!this.neonSpills.length) return;
      const pos = [], uvs = [], cols = [], idx = [];
      let vi = 0;
      for (const s of this.neonSpills) {
        for (let i = 0; i < 4; i++) {
          pos.push(s.x[i], s.y[i], s.z[i]);
          uvs.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1);
          cols.push(s.c.r, s.c.g, s.c.b);
        }
        idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        vi += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.setIndex(idx);
      const tex = ND.Tex.canvasToTexture(ND.Tex.glow(128), true);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, vertexColors: true, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        toneMapped: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      this.neonSpillMesh = mesh;
    }

    addCollider(c) {
      this.colliders.push(c);
      return c;
    }

    resolveCollision(px, pz, radius) {
      let x = px, z = pz;
      for (let pass = 0; pass < 2; pass++) {
        for (const c of this.colliders) {
          const ox = c.obj ? c.obj.position.x : c.x;
          const oz = c.obj ? c.obj.position.z : c.z;
          if (c.obj && c.obj.visible === false) continue;
          if (c.type === 'circle') {
            const dx = x - ox, dz = z - oz;
            const rr = radius + (c.r || 0.3);
            const d2 = dx * dx + dz * dz;
            if (d2 < rr * rr) {
              const d = Math.sqrt(d2) || 0.0001;
              x = ox + (dx / d) * rr;
              z = oz + (dz / d) * rr;
            }
          } else {
            const hx = (c.hx || 0.2) + radius;
            const hz = (c.hz || 0.2) + radius;
            const dx = x - ox, dz = z - oz;
            if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
              const pxOut = hx - Math.abs(dx);
              const pzOut = hz - Math.abs(dz);
              if (pxOut < pzOut) x = ox + Math.sign(dx || 1) * hx;
              else z = oz + Math.sign(dz || 1) * hz;
            }
          }
        }
      }
      return { x, z };
    }

    applyStaticShadows() {
      // The city is static, so pay for the shadow map exactly once. Characters
      // and flying traffic are deliberately excluded and use contact decals.
      this.scene.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some(m => m && m.isMeshStandardMaterial)) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.renderer.shadowMap.needsUpdate = true;
    }

    // Build one row of tenement blocks along the street.
    buildSide(side) {
      const rnd = this.random;
      const facadeX = 13.8;
      let cursor = 193;
      const buildings = [];
      while (cursor > -79) {
        const district = cursor > 68 ? 'rear' : (cursor < 52 ? 'front' : 'mid');
        let len, gap, depth, h;
        if (district === 'rear') {
          // Kowloon stack: narrow lots, low-rise mass, very dense gaps.
          len = 6.5 + rnd() * 7.5;
          gap = 0.12 + rnd() * 0.65;
          depth = 8 + rnd() * 7;
          h = 16 + Math.pow(rnd(), 1.35) * 44;
        } else if (district === 'front') {
          // Corporate frontage: wider lots, taller slabs, breathing room.
          len = 11 + rnd() * 11;
          gap = 0.5 + rnd() * 1.8;
          depth = 13 + rnd() * 10;
          h = 26 + Math.pow(rnd(), 1.5) * 62;
          if (cursor < 18 && cursor > -60) h = Math.max(h, 30 + rnd() * 28);
        } else {
          len = 8 + rnd() * 10;
          gap = 0.25 + rnd() * 1.2;
          depth = 10 + rnd() * 10;
          h = 22 + Math.pow(rnd(), 1.55) * 54;
        }
        if (cursor - len < -79) len = Math.max(4, cursor + 79);
        const z = cursor - len / 2;
        const b = { side, z, len, depth, h, facadeX, district, hero: z > 14 && z < 46 };
        this.addBuilding(b, rnd, buildings.length);
        buildings.push(b);
        cursor -= len + gap;
      }
      return buildings;
    }

    addBuilding(b, rnd, index) {
      const { side, z, len, depth, h, district } = b;
      const rear = district === 'rear';
      const front = district === 'front';
      const group = new THREE.Group();
      const bodyColor = rear
        ? new THREE.Color().setHSL(0.045 + rnd() * 0.055, 0.17 + rnd() * 0.1, 0.035 + rnd() * 0.018)
        : new THREE.Color().setHSL(0.63 + rnd() * 0.05, 0.07 + rnd() * 0.07, 0.035 + rnd() * 0.02);
      const bodyMat = this.bodyMat.clone();
      bodyMat.color.copy(bodyColor);
      const body = new THREE.Mesh(new THREE.BoxGeometry(depth, h, len), bodyMat);
      body.position.set(side * (b.facadeX + depth / 2), h / 2, z);
      group.add(body);

      const canvas = this.facadeCanvases[(index + (rear ? 2 : 0)) % this.facadeCanvases.length];
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(1.0, len / 13.5), Math.max(1.0, h / 30.0));
      tex.offset.set(rnd() * 0.8, rnd() * 0.8);
      tex.anisotropy = 8;
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: rear ? 0.94 + rnd() * 0.2 : 0.72 + rnd() * 0.18,
        color: rear
          ? new THREE.Color().setHSL(0.055 + rnd() * 0.04, 0.18, 0.5 + rnd() * 0.12)
          : new THREE.Color().setHSL(0.62 + rnd() * 0.1, 0.11, 0.58 + rnd() * 0.12),
        roughness: rear ? 0.46 + rnd() * 0.16 : 0.27 + rnd() * 0.14,
        metalness: rear ? 0.18 + rnd() * 0.12 : 0.36 + rnd() * 0.18
      });
      addFacadeWindowVariation(mat);
      const bump = this.facadeBumpBase.clone();
      bump.needsUpdate = true;
      bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
      bump.repeat.copy(tex.repeat);
      bump.offset.copy(tex.offset);
      bump.anisotropy = 4;
      mat.bumpMap = bump;
      mat.bumpScale = 0.018;
      const facade = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
      facade.position.set(side * (b.facadeX - 0.02), h / 2, z);
      facade.rotation.y = -side * Math.PI / 2;
      group.add(facade);
      if (rnd() > 0.48 && h > 9) {
        const streakCount = 1 + Math.floor(rnd() * 2);
        for (let i = 0; i < streakCount; i++) {
          const wetH = Math.max(2.5, h * (0.22 + rnd() * 0.48));
          const wet = new THREE.Mesh(new THREE.PlaneGeometry(0.18 + rnd() * 0.22, wetH), this.wetStreakMat);
          wet.position.set(side * (b.facadeX - 0.055), 3 + rnd() * Math.max(1, h - wetH - 4), z + (rnd() - 0.5) * len * 0.86);
          wet.rotation.y = -side * Math.PI / 2;
          group.add(wet);
        }
      }

      // Real facade relief for mid-ground buildings: thin floor sills and
      // window mullions break the single-plane texture silhouette.
      const cols = Math.max(2, Math.round(len / 1.93));
      const colStep = len / cols;
      for (let c = 1; c < cols; c++) {
        const dummy = new THREE.Object3D();
        dummy.position.set(side * (b.facadeX - 0.13), h / 2 + 0.8, z - len / 2 + c * colStep);
        dummy.scale.set(0.055, h - 2.2, 0.06);
        dummy.updateMatrix();
        this.facadeMullionMatrices.push(dummy.matrix.clone());
      }
      const floors = Math.max(2, Math.floor((h - 4) / 5.4));
      for (let f = 0; f < floors; f++) {
        const dummy = new THREE.Object3D();
        dummy.position.set(side * (b.facadeX - 0.16), 3.2 + f * 5.4, z);
        dummy.scale.set(0.24, 0.11, len * 0.94);
        dummy.updateMatrix();
        this.facadeSillMatrices.push(dummy.matrix.clone());
      }

      // Individual window reveals and occasional curtains make the
      // near-field facade read as a wall with apertures, not a decal.
      const curtainPalette = [0x6f5a52, 0x7a6a58, 0x3e5558, 0x713f50, 0x8a7a68];
      for (let f = 0; f < floors; f++) {
        const wy = 3.2 + f * 5.4 + 2.45;
        if (wy + 0.9 > h - 0.25) continue;
        for (let c = 0; c < cols; c++) {
          const wz = z - len / 2 + (c + 0.5) * colStep;
          if ((c + f) % 2 === 0) {
            const bars = [
              [0, 0.86, 0.07, 0.07, 1.32],
              [0, -0.86, 0.07, 0.07, 1.32],
              [-0.64, 0, 0.07, 1.58, 0.07],
              [0.64, 0, 0.07, 1.58, 0.07]
            ];
            for (const [dz, dy, sx, sy, sz] of bars) {
              const bar = new THREE.Object3D();
              bar.position.set(side * (b.facadeX - 0.105), wy + dy, wz + dz);
              bar.scale.set(sx, sy, sz);
              bar.updateMatrix();
              this.windowFrameMatrices.push(bar.matrix.clone());
            }
          }
          if ((c * 11 + f * 7) % 9 === 0) {
            for (const dz of [-0.46, 0.46]) {
              const curtain = new THREE.Object3D();
              curtain.position.set(side * (b.facadeX - 0.07), wy, wz + dz);
              curtain.rotation.y = -side * Math.PI / 2;
              curtain.scale.set(0.25, 1.28, 1);
              curtain.updateMatrix();
              this.curtainMatrices.push(curtain.matrix.clone());
              this.curtainColors.push(new THREE.Color(curtainPalette[(c + f) % curtainPalette.length]));
            }
          }
          if (f > 0 && (c * 7 + f * 5) % 13 === 0) {
            const fig = new THREE.Object3D();
            fig.position.set(side * (b.facadeX - 0.075), wy, wz);
            fig.rotation.y = -side * Math.PI / 2;
            fig.scale.set(0.86, 1.24, 1);
            fig.updateMatrix();
            this.windowSilhouetteMatrices.push(fig.matrix.clone());
          }
        }
      }

      // side facade facing the nearest alley / cross street
      if (rnd() > 0.45) {
        const stex = tex.clone();
        stex.needsUpdate = true;
        stex.repeat.set(Math.max(1, depth / 13.5), Math.max(1, h / 30.0));
        const smat = mat.clone();
        smat.map = stex; smat.emissiveMap = stex;
        addFacadeWindowVariation(smat);
        const sbump = bump.clone();
        sbump.needsUpdate = true;
        sbump.wrapS = sbump.wrapT = THREE.RepeatWrapping;
        sbump.repeat.copy(stex.repeat);
        sbump.offset.copy(stex.offset);
        sbump.anisotropy = 4;
        smat.bumpMap = sbump;
        smat.bumpScale = 0.018;
        const sidePlane = new THREE.Mesh(new THREE.PlaneGeometry(depth, h), smat);
        sidePlane.position.set(side * (b.facadeX + depth / 2), h / 2, z + len / 2 + 0.01);
        group.add(sidePlane);
      }

      // roof parapet and mechanical penthouse
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.3, 0.35, len + 0.3), this.roofMat);
      parapet.position.set(side * (b.facadeX + depth / 2), h + 0.17, z);
      group.add(parapet);
      if (rnd() > 0.35) {
        const pw = 2 + rnd() * 4, pd = 2 + rnd() * 5, ph = 1.3 + rnd() * 4;
        const penthouse = new THREE.Mesh(new THREE.BoxGeometry(pd, ph, pw), this.bodyMat);
        penthouse.position.set(side * (b.facadeX + depth * (0.35 + rnd() * 0.4)), h + ph / 2, z + (rnd() - 0.5) * (len - pw - 2));
        group.add(penthouse);
      }
      if (rnd() > 0.3) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.10, 5 + rnd() * 12, 6), this.metalMat);
        mast.position.set(side * (b.facadeX + depth * (0.2 + rnd() * 0.6)), h + mast.geometry.parameters.height / 2, z + (rnd() - 0.5) * len * 0.6);
        group.add(mast);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2e44, toneMapped: false }));
        beacon.position.set(mast.position.x, h + mast.geometry.parameters.height, mast.position.z);
        beacon.userData.blink = rnd() * TAU;
        group.add(beacon);
        this.dynamicGlow.push(beacon);
      }

      // horizontal architectural bands
      const bands = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < bands; i++) {
        const by = 3 + rnd() * (h - 5);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, len * (0.35 + rnd() * 0.55)), this.metalMat);
        strip.position.set(side * (b.facadeX - 0.15), by, z + (rnd() - 0.5) * len * 0.2);
        group.add(strip);
      }

      // choose a neon edge color for some facades
      if (rnd() > 0.33) {
        const colors = [
          ['magenta', 0xff2f9c], ['cyan', 0x21ddff], ['amber', 0xffa33d], ['violet', 0x9d66ff]
        ];
        const c = colors[Math.floor(rnd() * colors.length)];
        const edgeZ = z + (rnd() > 0.5 ? len * 0.48 : -len * 0.48);
        const stripH = 3 + rnd() * Math.max(4, h * 0.7);
        const stripY = 2 + rnd() * Math.max(1, h - stripH - 3);
        const dummy = new THREE.Object3D();
        dummy.position.set(side * (b.facadeX - 0.13), stripY + stripH / 2, edgeZ);
        dummy.scale.set(0.075, stripH, 0.075);
        dummy.updateMatrix();
        this.neonBatches[c[0]].push(dummy.matrix.clone());
        // occasional horizontal spill
        if (rnd() > 0.55) {
          const dummy2 = new THREE.Object3D();
          dummy2.position.set(side * (b.facadeX - 0.13), stripY, edgeZ - side * len * 0.2);
          dummy2.scale.set(0.065, 0.065, len * (0.25 + rnd() * 0.35));
          dummy2.updateMatrix();
          this.neonBatches[c[0]].push(dummy2.matrix.clone());
        }
      }

      // roofline edge light — creates a luminous canyon silhouette
      {
        const roofColors = ['magenta', 'cyan', 'amber', 'violet'];
        const rc = roofColors[Math.floor(rnd() * roofColors.length)];
        const dummy = new THREE.Object3D();
        dummy.position.set(side * (b.facadeX - 0.12), h - 0.22, z);
        dummy.scale.set(0.065, 0.065, len * 0.97);
        dummy.updateMatrix();
        this.neonBatches[rc].push(dummy.matrix.clone());
        if (rnd() > 0.5) {
          const c2 = new THREE.Object3D();
          c2.position.set(side * (b.facadeX - 0.12), h - 0.22, z + (rnd() > 0.5 ? len / 2 : -len / 2));
          c2.scale.set(0.065, 1.2 + rnd() * 3.5, 0.065);
          c2.updateMatrix();
          this.neonBatches[rc].push(c2.matrix.clone());
        }
      }

      // projecting floor ledges give the flat facades a real silhouette
      const ledges = rear ? 4 + Math.floor(rnd() * 4) : (front ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3));
      for (let i = 0; i < ledges; i++) {
        const ly = 7 + rnd() * Math.max(2, h - 12);
        const dummy = new THREE.Object3D();
        dummy.position.set(side * (b.facadeX - 0.42), ly, z + (rnd() - 0.5) * len * 0.1);
        dummy.scale.set(0.95, 0.16, len * (0.55 + rnd() * 0.32));
        dummy.updateMatrix();
        this.ledgeMatrices.push(dummy.matrix.clone());
      }

      // air conditioners, balconies, pipes
      const acCount = Math.floor(len * (rear ? (2.1 + rnd() * 2.3) : (front ? (0.06 + rnd() * 0.22) : (0.8 + rnd() * 1.3))));
      for (let i = 0; i < acCount; i++) {
        const dummy = new THREE.Object3D();
        const ay = 3 + rnd() * (h - 6);
        const az = z + (rnd() - 0.5) * (len - 1.5);
        dummy.position.set(side * (b.facadeX - 0.52), ay, az);
        dummy.scale.set(0.85 + rnd() * 0.55, 0.58 + rnd() * 0.3, 0.7 + rnd() * 0.6);
        dummy.updateMatrix();
        this.acMatrices.push(dummy.matrix.clone());
        if (rnd() > 0.32) {
          const led = new THREE.Object3D();
          led.position.set(side * (b.facadeX - 1.01), ay + 0.22, az + (rnd() - 0.5) * 0.8);
          led.scale.setScalar(0.035);
          led.updateMatrix();
          this.acLedMatrices.push(led.matrix.clone());
          const c = rnd();
          this.acLedColors.push(c > 0.55 ? new THREE.Color(0.4, 0.95, 1.0) : (c > 0.25 ? new THREE.Color(1.0, 0.55, 0.25) : new THREE.Color(1.0, 0.22, 0.55)));
        }
      }
      const balconyCount = rear ? 3 + Math.floor(rnd() * 4) : (front ? (rnd() > 0.72 ? 1 : 0) : (rnd() > 0.48 ? 1 + Math.floor(rnd() * 4) : 0));
      for (let i = 0; i < balconyCount; i++) {
        const by = 4 + Math.floor(rnd() * Math.max(1, h / 4)) * 4;
        if (by > h - 3) continue;
        const bw = 1.8 + rnd() * 2.6;
        const dummy = new THREE.Object3D();
        dummy.position.set(side * (b.facadeX - 0.45), by, z + (rnd() - 0.5) * (len - bw));
        dummy.scale.set(0.9, 0.12, bw);
        dummy.updateMatrix();
        this.balconyMatrices.push(dummy.matrix.clone());
        const rail = new THREE.Object3D();
        rail.position.set(side * (b.facadeX - 0.86), by + 0.43, z + (rnd() - 0.5) * 0.2);
        rail.scale.set(0.06, 0.8, bw);
        rail.updateMatrix();
        this.railMatrices.push(rail.matrix.clone());
      }
      const pipeCount = rear ? 2 + Math.floor(rnd() * 3) : (front ? (rnd() > 0.55 ? 1 : 0) : (rnd() > 0.5 ? 1 + Math.floor(rnd() * 3) : 0));
      for (let i = 0; i < pipeCount; i++) {
        const dummy = new THREE.Object3D();
        const py = 2 + rnd() * 8;
        dummy.position.set(side * (b.facadeX - 0.23), py + (h - py) / 2, z + (rnd() - 0.5) * len);
        dummy.scale.set(0.07, h - py, 0.07);
        dummy.updateMatrix();
        this.pipeMatrices.push(dummy.matrix.clone());
      }

      if (front) {
        // Corporate frontage: tall glass fins, a clean crown and a crown band.
        const finCount = 3 + Math.floor(rnd() * 4);
        for (let i = 0; i < finCount; i++) {
          const dummy = new THREE.Object3D();
          dummy.position.set(side * (b.facadeX - 0.34), h / 2 + 1.0, z - len / 2 + ((i + 1) / (finCount + 1)) * len);
          dummy.scale.set(0.14, h - 4.0, 0.2);
          dummy.updateMatrix();
          this.facadeMullionMatrices.push(dummy.matrix.clone());
        }
        const crownMat = new THREE.MeshStandardMaterial({
          color: 0x071622, roughness: 0.14, metalness: 0.88,
          emissive: new THREE.Color(0x082534), emissiveIntensity: 0.45
        });
        const crown = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.4, len * 0.58), crownMat);
        crown.position.set(side * (b.facadeX - 0.58), h - 2.4, z);
        group.add(crown);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, len * 0.54), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4be6ff).multiplyScalar(1.55), toneMapped: false }));
        band.position.set(side * (b.facadeX - 1.08), h - 3.55, z);
        group.add(band);
      }
      if (rear) {
        // Kowloon stack: an overhanging mid-floor slab, a steel service tower,
        // laundry rails and rooftop shacks break the cloned tower silhouette.
        if (h > 24 && rnd() > 0.24) {
          const overhang = new THREE.Mesh(new THREE.BoxGeometry(1.55, 4.2 + rnd() * 3.0, len * 0.86), bodyMat);
          overhang.position.set(side * (b.facadeX - 0.62), h * (0.55 + rnd() * 0.16), z);
          group.add(overhang);
        }
        if (rnd() > 0.3) {
          const th = Math.min(18, h * 0.58);
          const tz = z + (rnd() > 0.5 ? 1 : -1) * len * 0.3;
          for (const dz of [-0.55, 0.55]) {
            const leg = new THREE.Object3D();
            leg.position.set(side * (b.facadeX - 1.02), th / 2, tz + dz);
            leg.scale.set(0.09, th, 0.09);
            leg.updateMatrix();
            this.facadeMullionMatrices.push(leg.matrix.clone());
          }
          for (let k = 1; k <= 4; k++) {
            const rung = new THREE.Object3D();
            rung.position.set(side * (b.facadeX - 1.02), th * (k / 5), tz);
            rung.scale.set(1.25, 0.06, 1.3);
            rung.updateMatrix();
            this.ledgeMatrices.push(rung.matrix.clone());
          }
        }
        if (h > 12) {
          const clothColors = [0x55636b, 0x8a3f55, 0xa47a3a, 0x3f6b62, 0x8a8878, 0x6b4a72];
          for (let k = 0; k < 2; k++) {
            const cloth = new THREE.Object3D();
            cloth.position.set(side * (b.facadeX - 0.92), 6 + rnd() * Math.max(2, h - 9), z + (rnd() - 0.5) * len * 0.75);
            cloth.rotation.y = -side * Math.PI / 2;
            cloth.scale.set(0.45 + rnd() * 0.5, 0.35 + rnd() * 0.45, 1);
            cloth.updateMatrix();
            this.laundryMatrices.push(cloth.matrix.clone());
            this.laundryColors.push(new THREE.Color(clothColors[Math.floor(rnd() * clothColors.length)]));
          }
          for (let k = 0; k < 2; k++) {
            const line = new THREE.Object3D();
            line.position.set(side * (b.facadeX - 0.84), 5 + rnd() * Math.max(2, h - 8), z + (rnd() - 0.5) * len * 0.8);
            line.scale.set(0.045, 0.045, 1.2 + rnd() * 1.6);
            line.updateMatrix();
            this.railMatrices.push(line.matrix.clone());
          }
        }
        if (rnd() > 0.3) {
          const shack = new THREE.Mesh(new THREE.BoxGeometry(2.2 + rnd() * 1.2, 1.3 + rnd() * 1.1, 2.4 + rnd()), bodyMat);
          shack.position.set(side * (b.facadeX + depth * (0.23 + rnd() * 0.22)), h + shack.geometry.parameters.height / 2, z + (rnd() - 0.5) * len * 0.55);
          group.add(shack);
          const shackLight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(rnd() > 0.5 ? 0xffa34d : 0x5ce8ff).multiplyScalar(1.5), toneMapped: false }));
          shackLight.position.set(shack.position.x - side * 1.15, shack.position.y, shack.position.z);
          group.add(shackLight);
        }
      }

      if (b.hero) this.addHeroFacade(b, group, rnd);
      this.scene.add(group);
    }

    addCentralTower() {
      const group = new THREE.Group();
      const h = 118, w = 34, d = 24;
      const bodyMat = this.bodyMat.clone();
      bodyMat.color = new THREE.Color(0x17121d);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      body.position.set(0, h / 2, -96);
      group.add(body);

      const canvas = this.facadeCanvases[4];
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3.3, 4.4);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.9, color: 0xb4a0b8, roughness: 0.45, metalness: 0.3
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      face.position.set(0, h / 2, -83.97);
      group.add(face);

      // vertical structural fins, tucked behind the video wall
      for (let i = -3; i <= 3; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.35), this.metalMat);
        fin.position.set(i * 5.0, h / 2, -84.15);
        group.add(fin);
      }
      // vertical neon veins and corner beacons
      const veinColors = [0xff2e9d, 0x2addff];
      for (let s = -1; s <= 1; s += 2) {
        const veinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(veinColors[s < 0 ? 0 : 1]).multiplyScalar(2.0), toneMapped: false });
        const vein = new THREE.Mesh(new THREE.BoxGeometry(0.16, h - 6, 0.16), veinMat);
        vein.position.set(s * 16.65, h / 2, -83.75);
        group.add(vein);
        for (let yy = 8; yy < h - 4; yy += 12) {
          const collar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(veinColors[yy % 24 ? 1 : 0]).multiplyScalar(1.4), toneMapped: false }));
          collar.position.set(s * 14.9, yy, -83.6);
          group.add(collar);
        }
      }
      // huge vertical kanji banners flanking the screen
      const bannerNames = ['麒麟', '重工'];
      for (let s = -1; s <= 1; s += 2) {
        const tex = this._bladeTexture(bannerNames[s < 0 ? 0 : 1], 'KIRIN HEAVY INDUSTRIES', s < 0 ? '#ff4aa8' : '#3ce7ff', 70 + s);
        const bmat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.0, 1.0, 1.0), side: THREE.FrontSide });
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 22), bmat);
        banner.position.set(s * 16.0, 27, -83.0);
        group.add(banner);
        const bframe = new THREE.Mesh(new THREE.BoxGeometry(3.9, 22.5, 0.3), this.billboardFrameMat);
        bframe.position.set(s * 16.0, 27, -83.2);
        group.add(bframe);
      }

      // crown / halo ring
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2e9d).multiplyScalar(2.2), toneMapped: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(15.5, 0.22, 8, 80), ringMat);
      ring.position.set(0, 75, -83.0);
      group.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(12.0, 0.14, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4ff4ff).multiplyScalar(1.8), toneMapped: false }));
      ring2.position.set(0, 58, -82.7);
      group.add(ring2);
      this.towerRings = [ring, ring2];

      // needle
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.7, 34, 7), this.metalMat);
      needle.position.set(0, h + 17, -96);
      group.add(needle);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2d3c, toneMapped: false }));
      beacon.position.set(0, h + 34, -96);
      group.add(beacon);
      this.dynamicGlow.push(beacon);

      // giant front-facing hero screen
      this.addFrontScreen(0, 25, -83.2, 27, 30, 'city', 9001, 1.45);
      this.addFrontScreen(0, 8.0, -83.2, 18, 6.0, 'type', 9002, 1.35, true);

      // rooftop gantry lights
      for (let i = -2; i <= 2; i++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff304d).multiplyScalar(2.0), toneMapped: false }));
        lamp.position.set(i * 5, h + 0.8, -83.4);
        group.add(lamp);
      }
      this.scene.add(group);
    }

    addBackdrop() {
      const rnd = ND.util.mulberry32(19191);
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x070810, roughness: 0.9, metalness: 0.05 });
      const lightsPositions = [];
      const lightsColors = [];
      for (let i = 0; i < 48; i++) {
        const x = (rnd() > 0.5 ? 1 : -1) * (25 + rnd() * 150);
        const z = -105 - rnd() * 150;
        const w = 10 + rnd() * 28;
        const d = 10 + rnd() * 28;
        const h = 40 + rnd() * 160;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        group.add(b);
        const count = 40 + Math.floor(rnd() * 80);
        for (let j = 0; j < count; j++) {
          const wx = x + (rnd() - 0.5) * w * 0.8;
          const wy = 10 + rnd() * h * 0.85;
          const wz = z + d / 2 + 0.1;
          lightsPositions.push(wx, wy, wz);
          const warm = rnd() > 0.35;
          const c = warm ? [1.0, 0.62, 0.32] : [0.35, 0.82, 1.0];
          lightsColors.push(c[0], c[1], c[2]);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(lightsPositions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(lightsColors, 3));
      const pmat = new THREE.PointsMaterial({ size: 0.55, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
      group.add(new THREE.Points(geo, pmat));
      this.scene.add(group);
    }

    buildCity() {
      this.buildSide(-1);
      this.buildSide(1);
      this.addCentralTower();
      this.addBackdrop();

      // instanced facade clutter
      const acGeo = new THREE.BoxGeometry(1, 1, 1);
      const acMesh = new THREE.InstancedMesh(acGeo, this.metalMat, this.acMatrices.length);
      this.acMatrices.forEach((m, i) => acMesh.setMatrixAt(i, m));
      acMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(acMesh);
      const balGeo = new THREE.BoxGeometry(1, 1, 1);
      const balMesh = new THREE.InstancedMesh(balGeo, new THREE.MeshStandardMaterial({ color: 0x16161e, roughness: 0.55, metalness: 0.35 }), this.balconyMatrices.length);
      this.balconyMatrices.forEach((m, i) => balMesh.setMatrixAt(i, m));
      balMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(balMesh);
      const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.metalMat, this.railMatrices.length);
      this.railMatrices.forEach((m, i) => railMesh.setMatrixAt(i, m));
      railMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(railMesh);
      if (this.laundryMatrices.length) {
        const clothMesh = new THREE.InstancedMesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide }),
          this.laundryMatrices.length
        );
        this.laundryMatrices.forEach((m, i) => {
          clothMesh.setMatrixAt(i, m);
          clothMesh.setColorAt(i, this.laundryColors[i]);
        });
        clothMesh.instanceMatrix.needsUpdate = true;
        if (clothMesh.instanceColor) clothMesh.instanceColor.needsUpdate = true;
        this.scene.add(clothMesh);
      }
      const pipeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), this.rustMat, this.pipeMatrices.length);
      this.pipeMatrices.forEach((m, i) => pipeMesh.setMatrixAt(i, m));
      pipeMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(pipeMesh);
      const ledgeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1b1922, roughness: 0.52, metalness: 0.38 }), this.ledgeMatrices.length);
      this.ledgeMatrices.forEach((m, i) => ledgeMesh.setMatrixAt(i, m));
      ledgeMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(ledgeMesh);
      if (this.facadeSillMatrices.length) {
        const sillMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x15141c, roughness: 0.46, metalness: 0.48 }), this.facadeSillMatrices.length);
        this.facadeSillMatrices.forEach((m, i) => sillMesh.setMatrixAt(i, m));
        sillMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(sillMesh);
      }
      if (this.facadeMullionMatrices.length) {
        const mullionMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0c0d14, roughness: 0.34, metalness: 0.72 }), this.facadeMullionMatrices.length);
        this.facadeMullionMatrices.forEach((m, i) => mullionMesh.setMatrixAt(i, m));
        mullionMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(mullionMesh);
      }
      if (this.windowFrameMatrices.length) {
        const frameMesh = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x0b0c12, roughness: 0.36, metalness: 0.72 }),
          this.windowFrameMatrices.length
        );
        this.windowFrameMatrices.forEach((m, i) => frameMesh.setMatrixAt(i, m));
        frameMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(frameMesh);
      }
      if (this.curtainMatrices.length) {
        const curtainMesh = new THREE.InstancedMesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.01, side: THREE.DoubleSide }),
          this.curtainMatrices.length
        );
        this.curtainMatrices.forEach((m, i) => {
          curtainMesh.setMatrixAt(i, m);
          curtainMesh.setColorAt(i, this.curtainColors[i]);
        });
        curtainMesh.instanceMatrix.needsUpdate = true;
        if (curtainMesh.instanceColor) curtainMesh.instanceColor.needsUpdate = true;
        this.scene.add(curtainMesh);
      }
      if (this.windowSilhouetteMatrices.length) {
        const silhouetteMesh = new THREE.InstancedMesh(
          new THREE.PlaneGeometry(1, 1),
          this.windowSilhouetteMat,
          this.windowSilhouetteMatrices.length
        );
        this.windowSilhouetteMatrices.forEach((m, i) => silhouetteMesh.setMatrixAt(i, m));
        silhouetteMesh.instanceMatrix.needsUpdate = true;
        silhouetteMesh.renderOrder = 2;
        this.scene.add(silhouetteMesh);
      }
      const ledMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), this.acLedMatrices.length);
      this.acLedMatrices.forEach((m, i) => {
        ledMesh.setMatrixAt(i, m);
        ledMesh.setColorAt(i, this.acLedColors[i].multiplyScalar(2.2));
      });
      ledMesh.instanceMatrix.needsUpdate = true;
      if (ledMesh.instanceColor) ledMesh.instanceColor.needsUpdate = true;
      this.scene.add(ledMesh);

      const colors = { magenta: 0xff2b96, cyan: 0x20dcff, amber: 0xffa038, violet: 0x8c60ff };
      this.neonMats = [];
      for (const key of Object.keys(this.neonBatches)) {
        const list = this.neonBatches[key];
        if (!list.length) continue;
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(colors[key]).multiplyScalar(2.25),
          toneMapped: false
        });
        this.neonMats.push({ mat, base: 2.25, phase: this.random() * TAU, color: mat.color.clone() });
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
        list.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.instanceMatrix.needsUpdate = true;
        this.scene.add(mesh);
      }

      this.addHeroBillboards();
    }

    addHeroBillboards() {
      const defs = [
        { side: -1, z: 9, y: 10.6, w: 7.8, h: 13.5, kind: 'kitsune', seed: 21, intensity: 2.1 },
        { side: 1, z: -5, y: 10.2, w: 6.9, h: 12.2, kind: 'axiom', seed: 22, intensity: 2.0 },
        { side: -1, z: -18, y: 7.8, w: 5.2, h: 8.2, kind: 'ramen', seed: 23, intensity: 1.7 },
        { side: -1, z: -36, y: 15.0, w: 8.0, h: 18.0, kind: 'geisha', seed: 24, intensity: 2.0 },
        { side: 1, z: -27, y: 8.1, w: 5.4, h: 8.0, kind: 'void', seed: 25, intensity: 1.8 },
        { side: 1, z: -48, y: 14.0, w: 8.0, h: 17.0, kind: 'koi', seed: 26, intensity: 2.0 },
        { side: -1, z: 42, y: 10.0, w: 7.0, h: 10.0, kind: 'city', seed: 27, intensity: 1.8 }
      ];
      for (const d of defs) this.addBillboard(d);
      this.addBannerSigns();
    }

    addBillboard(d) {
      const { side, z, y, w, h, kind } = d;
      const canvas = ND.Tex.ad(kind, Math.round(720 * (w / h)), 1000, d.seed);
      const tex = ND.Tex.canvasToTexture(canvas);
      const boost = 1.02;
      const mat = this.makeScreenMaterial(tex, d.seed, d.intensity * boost, 1);
      const grp = new THREE.Group();
      // cant the panel a little toward the camera axis: blade signage, not wallpaper
      grp.position.set(side * 13.05, y, z);
      grp.rotation.y = -side * (Math.PI / 2 - 0.38);
      this.scene.add(grp);
      const billboardColor = new THREE.Color(kind === 'axiom' || kind === 'void' ? 0x38e6ff : 0xff3b9d);
      this.addNeonSpill('ground', side * 8.8, 0.04, z, w * 1.35, 8.5, billboardColor, 0.66);
      this.addNeonSpill('wall', -side * 13.70, y * 0.82, z, w * 0.82, h * 0.5, billboardColor, 0.20);

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.z = 0.05;
      grp.add(mesh);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.65, h + 0.65, 0.35), this.billboardFrameMat);
      frame.position.z = -0.16;
      grp.add(frame);
      // structural bracket underneath
      const catwalk = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.12, 1.4), this.metalMat);
      catwalk.position.set(0, -h / 2 - 0.24, -0.55);
      grp.add(catwalk);
      this.screens.push({ mat, base: d.intensity * boost, phase: this.random() * TAU, light: null });

      if (w > 5.5) {
        const haloMat = new THREE.SpriteMaterial({
          map: this._glowSpriteTex || (this._glowSpriteTex = ND.Tex.canvasToTexture(ND.Tex.glow(128), true)),
          color: new THREE.Color(kind === 'axiom' || kind === 'void' ? 0x38e6ff : 0xff3b9d),
          transparent: true, opacity: 0.028, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const halo = new THREE.Sprite(haloMat);
        halo.position.set(0, 0, 0.9);
        halo.scale.set(w * 1.24, h * 1.08, 1);
        grp.add(halo);
      }
      // a cold downlight under the largest panels
      if (w > 7.5) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.08, 0.15), new THREE.MeshBasicMaterial({ color: new THREE.Color(kind === 'axiom' || kind === 'void' ? 0x8ff6ff : 0xff9acb).multiplyScalar(2.4), toneMapped: false }));
        lamp.position.set(0, -h / 2 - 0.34, 0.35);
        grp.add(lamp);
      }
    }

    addFrontScreen(x, y, z, w, h, kind, seed, intensity, landscape) {
      const cw = landscape ? 1400 : 900;
      const ch = landscape ? 500 : 1100;
      const canvas = ND.Tex.ad(kind, cw, ch, seed);
      const tex = ND.Tex.canvasToTexture(canvas);
      const boost = 1.02;
      const mat = this.makeScreenMaterial(tex, seed, intensity * boost, 1);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z + 0.48);
      this.scene.add(mesh);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, h + 0.7, 0.45), this.billboardFrameMat);
      frame.position.set(x, y, z);
      this.scene.add(frame);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowSpriteTex || (this._glowSpriteTex = ND.Tex.canvasToTexture(ND.Tex.glow(128), true)),
        color: 0xff4f9f, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.position.set(x, y, z + 0.6);
      halo.scale.set(w * 1.12, h * 1.05, 1);
      this.scene.add(halo);
      this.screens.push({ mat, base: intensity * boost, phase: this.random() * TAU, light: null });
    }

    makeScreenMaterial(tex, seed, intensity, repeat) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: tex },
          uTime: { value: 0 },
          uSeed: { value: seed * 0.137 },
          uIntensity: { value: intensity },
          uRepeat: { value: repeat || 1 },
          uFogDensity: { value: this.fogDensity },
          uFogColor: { value: this.fogColor }
        },
        vertexShader: SCREEN_VERT,
        fragmentShader: SCREEN_FRAG,
        depthTest: true,
        depthWrite: true,
        side: THREE.FrontSide
      });
      return mat;
    }

    addBannerSigns() {
      const defs = [
        { side: -1, z: 31, y: 4.2, text: '九龍電器', sub: 'KOWLOON ELECTRIC', a: '#ff3b9d', b: '#2ce5ff', w: 3.4 },
        { side: 1, z: 28, y: 4.4, text: '拉麺 24H', sub: 'OPEN ALL NIGHT', a: '#ffb44d', b: '#ff3b3b', w: 3.6 },
        { side: -1, z: 4, y: 3.9, text: '義體診所', sub: 'CYBERWARE CLINIC', a: '#28e5ff', b: '#8d5cff', w: 4.1 },
        { side: 1, z: -8, y: 4.4, text: '當舖', sub: 'PAWN / TRADE', a: '#ffcb4f', b: '#ff5c31', w: 2.7 },
        { side: -1, z: -47, y: 4.2, text: '夜雨旅館', sub: 'NIGHT RAIN HOTEL', a: '#ff65b8', b: '#30c9ff', w: 4.4 },
        { side: 1, z: -58, y: 4.3, text: '彈藥', sub: 'AMMO / 24H', a: '#ff413b', b: '#ffbd49', w: 2.4 },
        { side: -1, z: -66, y: 4.0, text: '龍城茶樓', sub: 'DRAGON CITY TEA', a: '#ffb84d', b: '#ff2d7e', w: 3.8 },
        { side: 1, z: 40, y: 4.6, text: '未來光學', sub: 'FUTURE OPTICS', a: '#53efff', b: '#8f6cff', w: 4.0 },
        { side: -1, z: 172, y: 4.8, text: '九龍城寨', sub: 'WALLED CITY', a: '#ffca4e', b: '#ff2d8e', w: 4.8 },
        { side: 1, z: 158, y: 4.5, text: '夜雨旅館', sub: 'NIGHT RAIN', a: '#ff2d8e', b: '#5cecff', w: 4.2 },
        { side: -1, z: 128, y: 4.7, text: '九龍夜市', sub: 'NIGHT MARKET', a: '#ff8a4c', b: '#ff2d8e', w: 5.0 },
        { side: 1, z: 96, y: 4.3, text: '地鐵九龍', sub: 'MTR KOWLOON', a: '#53efff', b: '#ffb04d', w: 4.1 },
        { side: -1, z: 70, y: 4.4, text: '舊城電器', sub: 'OLD TOWN ELECTRIC', a: '#5d9cff', b: '#ff4c5e', w: 4.2 }
      ];
      for (const d of defs) {
        const tex = this.makeBannerTexture(d.text, d.sub, d.a, d.b);
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.65, 1.65, 1.65), side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.w * 0.255), mat);
        mesh.position.set(d.side * 13.6, d.y, d.z);
        mesh.rotation.y = -d.side * Math.PI / 2;
        this.scene.add(mesh);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.position.set(d.side * 13.25, d.y, d.z);
        glow.scale.set(d.w * 1.4, d.w * 0.42, 1);
        this.scene.add(glow);
        const bannerColor = new THREE.Color(d.a);
        this.addNeonSpill('wall', d.side * 13.70, d.y, d.z, d.w * 1.2, 3.4, bannerColor, 0.52);
        this.addNeonSpill('ground', d.side * 9.3, 0.04, d.z, d.w * 1.35, 4.6, bannerColor, 0.42);
      }
    }

    makeBannerTexture(text, sub, a, b) {
      const w = 1024, h = 256;
      const c = ND.util.makeCanvas(w, h);
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(5,5,10,.92)'); g.addColorStop(0.45, 'rgba(15,6,18,.92)'); g.addColorStop(1, 'rgba(4,5,12,.96)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.strokeStyle = a; x.lineWidth = 5; x.shadowColor = a; x.shadowBlur = 22; x.strokeRect(9, 9, w - 18, h - 18);
      x.fillStyle = b; x.fillRect(20, 20, 12, h - 40);
      x.save();
      x.font = '700 96px "Yu Gothic","Microsoft YaHei",sans-serif';
      x.textAlign = 'left'; x.textBaseline = 'middle';
      x.shadowColor = a; x.shadowBlur = 26; x.fillStyle = '#fff4fd'; x.fillText(text, 56, 104);
      x.font = '400 30px "Bahnschrift","Arial Narrow",sans-serif';
      x.fillStyle = b; x.shadowColor = b; x.shadowBlur = 12; x.fillText(sub, 58, 178);
      x.restore();
      // little wear
      x.globalAlpha = 0.18; x.fillStyle = '#000';
      for (let i = 0; i < 30; i++) x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 20, 1);
      x.globalAlpha = 1;
      return ND.Tex.canvasToTexture(c);
    }

    buildGround() {
      const wetCanvas = ND.util.makeCanvas(256, 1024);
      const wctx = wetCanvas.getContext('2d');
      const mx = x => ((x + 23.0) / 46.0) * 256;
      const my = z => ((z + 170.0) / 430.0) * 1024;
      wctx.fillStyle = '#ffffff'; wctx.fillRect(0, 0, 256, 1024);
      wctx.fillStyle = '#707070';
      const dryBars = [];
      const wrnd = ND.util.mulberry32(18421);
      for (const side of [-1, 1]) {
        for (let z = -68; z < 186; z += 5.2) {
          if (wrnd() > 0.22) {
            const x = side * 11.7;
            wctx.fillRect(mx(x - 2.0), my(z - 1.55), mx(x + 2.0) - mx(x - 2.0), my(z + 1.55) - my(z - 1.55));
          }
        }
      }
      // broad dry shelter under the market / hotel / MTR / gate canopies
      wctx.fillStyle = '#555555';
      wctx.fillRect(mx(-13.6), my(111), mx(-8.9) - mx(-13.6), my(133) - my(111));
      wctx.fillRect(mx(-13.6), my(147), mx(-9.0) - mx(-13.6), my(159) - my(147));
      wctx.fillRect(mx(-13.6), my(69), mx(-9.1) - mx(-13.6), my(82) - my(69));
      wctx.fillRect(mx(-13.6), my(172), mx(-9.0) - mx(-13.6), my(185) - my(172));
      const wetTex = ND.Tex.canvasToTexture(wetCanvas, false);
      wetTex.wrapS = wetTex.wrapT = THREE.ClampToEdgeWrapping;
      const uniforms = {
        uTextureMatrix: { value: new M4() },
        tReflection: { value: null },
        tWetMap: { value: wetTex },
        uTime: { value: 0 },
        uFogDensity: { value: this.fogDensity },
        uFogColor: { value: this.fogColor },
        uLightPos: { value: this.groundLights.map(l => l.p) },
        uLightColor: { value: this.groundLights.map(l => l.c) },
        uKind: { value: 0 }
      };
      Object.assign(uniforms, THREE.UniformsUtils.clone(THREE.UniformsLib.lights));
      this.groundUniforms = uniforms;
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        depthWrite: true,
        lights: true
      });
      mat.receiveShadow = true;
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(46, 430, 1, 1), mat);
      this.ground.receiveShadow = true;
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.position.set(0, 0.015, 45);
      this.scene.add(this.ground);
      this.reflectionHidden.push(this.ground);

      const su = {
        uTextureMatrix: uniforms.uTextureMatrix,
        tReflection: uniforms.tReflection,
        tWetMap: uniforms.tWetMap,
        uTime: uniforms.uTime,
        uFogDensity: uniforms.uFogDensity,
        uFogColor: uniforms.uFogColor,
        uLightPos: uniforms.uLightPos,
        uLightColor: uniforms.uLightColor,
        uKind: { value: 1 }
      };
      Object.assign(su, THREE.UniformsUtils.clone(THREE.UniformsLib.lights));
      const smat = new THREE.ShaderMaterial({
        uniforms: su,
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        depthWrite: true,
        lights: true
      });
      smat.receiveShadow = true;
      this.sidewalkMat = smat;
      const swGeo = new THREE.PlaneGeometry(4.2, 340);
      const swL = new THREE.Mesh(swGeo, smat);
      swL.rotation.x = -Math.PI / 2;
      swL.position.set(-11.6, 0.17, 55);
      this.scene.add(swL);
      const swR = new THREE.Mesh(swGeo.clone(), smat);
      swR.rotation.x = -Math.PI / 2;
      swR.position.set(11.6, 0.17, 55);
      this.scene.add(swR);
      swL.receiveShadow = true;
      swR.receiveShadow = true;
      this.sidewalks = [swL, swR];
      this.reflectionHidden.push(swL, swR);
    }

    buildReflection() {
      this.reflectionCamera = new THREE.PerspectiveCamera();
      // The reflection only needs the architecture, signage and large props.
      // Small clutter and every glow sprite stay out; this roughly halves the
      // reflection draw calls while keeping everything visible in the main pass.
      this.reflectionCamera.layers.set(2);
      this.reflectionTextureMatrix = new M4();
      this._selectReflectionLayers();
      const size = new THREE.Vector2();
      this.renderer.getSize(size);
      const ratio = Math.min(this.renderer.getPixelRatio(), 1.5) * (this.quality.reflectionScale || 0.5);
      this.reflectionRT = new THREE.WebGLRenderTarget(Math.max(1, Math.floor(size.x * ratio)), Math.max(1, Math.floor(size.y * ratio)), {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true
      });
      this.reflectionRT.texture.generateMipmaps = false;
      this.reflectionRT.texture.colorSpace = THREE.NoColorSpace;
      this.groundUniforms.tReflection.value = this.reflectionRT.texture;
      this.sidewalkMat.uniforms.tReflection.value = this.reflectionRT.texture;
      if (this.waterMat) this.waterMat.uniforms.tReflection.value = this.reflectionRT.texture;
    }



    batchGlowSprites() {
      // Every shop halo / street glow used to be its own additive draw call.
      // They are static, share one radial texture and can live in a single
      // instanced billboard batch.
      const animated = new Set();
      for (const list of [this.pedestrians, this.flyers, this.waterRings, this.dynamicGlow]) {
        for (const o of list || []) animated.add(o);
      }
      for (const o of [this.cat, this.whaleGroup, this.wayfinding, this.stall]) {
        if (o) animated.add(o);
      }
      for (const s of this.lifeSways || []) animated.add(s.obj);
      const isAnimated = o => {
        for (let p = o; p; p = p.parent) if (animated.has(p)) return true;
        return false;
      };
      const glowTex = this._glowTex;
      const sprites = [];
      this.scene.traverse(o => {
        if (!o.isSprite || !o.visible || isAnimated(o)) return;
        const m = o.material;
        if (!m || m.map !== glowTex || m.blending !== THREE.AdditiveBlending) return;
        if (m.rotation !== 0 || m.opacity < 0.01 || m.depthTest === false) return;
        sprites.push(o);
      });
      if (sprites.length < 8) return;

      const count = sprites.length;
      const base = new THREE.PlaneGeometry(1, 1);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index;
      geo.setAttribute('position', base.getAttribute('position'));
      geo.setAttribute('uv', base.getAttribute('uv'));
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const size = new Float32Array(count * 2);
      const alpha = new Float32Array(count);
      const p = new THREE.Vector3();
      const s = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const sp = sprites[i];
        sp.getWorldPosition(p);
        sp.getWorldScale(s);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = sp.material.color.r;
        col[i * 3 + 1] = sp.material.color.g;
        col[i * 3 + 2] = sp.material.color.b;
        size[i * 2] = s.x;
        size[i * 2 + 1] = s.y;
        alpha[i] = sp.material.opacity;
      }
      geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
      geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(col, 3));
      geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
      geo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
      geo.instanceCount = count;

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: glowTex },
          uFogDensity: { value: this.fogDensity },
          uFogColor: { value: this.fogColor }
        },
        vertexShader: `
          attribute vec3 iPos, iColor;
          attribute vec2 iSize;
          attribute float iAlpha;
          varying vec2 vUv;
          varying vec3 vColor;
          varying float vAlpha;
          varying float vDepth;
          void main() {
            vec4 mv = viewMatrix * vec4(iPos, 1.0);
            mv.xy += position.xy * iSize;
            vUv = uv;
            vColor = iColor;
            vAlpha = iAlpha;
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform float uFogDensity;
          uniform vec3 uFogColor;
          varying vec2 vUv;
          varying vec3 vColor;
          varying float vAlpha;
          varying float vDepth;
          void main() {
            vec4 t = texture2D(uMap, vUv);
            float a = t.a * vAlpha;
            if (a < 0.002) discard;
            float fogAmt = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
            vec3 c = vColor * t.rgb;
            c = mix(c, uFogColor, fogAmt * 0.7);
            gl_FragColor = vec4(c, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      mesh.layers.set(0);
      this.scene.add(mesh);
      for (const sp of sprites) { if (sp.parent) sp.parent.remove(sp); }
    }


    mergeGroupStatic(group, animatedRoots) {
      if (!group) return;
      const animated = new Set(animatedRoots || []);
      const isAnimated = o => {
        for (let p = o; p && p !== group; p = p.parent) if (animated.has(p)) return true;
        return false;
      };
      group.updateWorldMatrix(true, true);
      const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
      const groups = new Map();
      group.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return;
        if (o.children.length) return;
        if (Array.isArray(o.material)) return;
        const mat = o.material;
        if (!mat || mat.transparent || mat.isShaderMaterial || mat.isSpriteMaterial) return;
        if (isAnimated(o)) return;
        if (!o.geometry.attributes.position) return;
        const attrs = Object.keys(o.geometry.attributes).sort().map(n => {
          const a = o.geometry.attributes[n];
          return n + ':' + a.itemSize + ':' + a.array.constructor.name;
        }).join(',');
        const key = materialSignature(mat) + '|' + attrs;
        if (!groups.has(key)) groups.set(key, { mat, items: [] });
        groups.get(key).items.push(o);
      });
      for (const groupData of groups.values()) {
        if (groupData.items.length < 2) continue;
        const first = groupData.items[0];
        const attrNames = Object.keys(first.geometry.attributes);
        const attrMeta = attrNames.map(name => {
          const a = first.geometry.attributes[name];
          return { name, itemSize: a.itemSize, normalized: !!a.normalized };
        });
        for (const o of groupData.items) {
          o.updateWorldMatrix(true, false);
        }
        const chunks = [];
        const totals = {};
        for (const { name, itemSize } of attrMeta) totals[name] = 0;
        let valid = true;
        for (const o of groupData.items) {
          for (const { name } of attrMeta) {
            const a = o.geometry.attributes[name];
            if (!a || !(a.array instanceof Float32Array)) { valid = false; break; }
          }
          if (!valid) break;
          let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
          chunks.push(g);
          for (const { name, itemSize } of attrMeta) totals[name] += g.attributes[name].count * itemSize;
        }
        if (!valid) continue;
        const merged = new THREE.BufferGeometry();
        for (const { name, itemSize, normalized } of attrMeta) {
          const arr = new Float32Array(totals[name]);
          let offset = 0;
          for (const g of chunks) {
            const a = g.attributes[name];
            arr.set(a.array, offset);
            offset += a.array.length;
          }
          merged.setAttribute(name, new THREE.BufferAttribute(arr, itemSize, normalized));
        }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, first.material);
        mesh.layers.mask = first.layers.mask;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        group.add(mesh);
        for (const o of groupData.items) { if (o.parent) o.parent.remove(o); }
      }
    }

    mergeStaticGeometry() {
      // Merge static, opaque meshes that share a material. The scene uses many
      // small metal/plastic parts; batching them cuts hundreds of draw calls
      // without changing what is visible.
      const animated = new Set();
      for (const list of [this.pedestrians, this.flyers, this.waterRings, this.dynamicGlow]) {
        for (const o of list || []) animated.add(o);
      }
      for (const o of [this.cat, this.whaleGroup, this.wayfinding, this.water, this.ground, this.sky, this.dripPoints]) {
        if (o) animated.add(o);
      }
      for (const s of this.lifeSways || []) animated.add(s.obj);
      const isAnimated = o => {
        for (let p = o; p; p = p.parent) if (animated.has(p)) return true;
        return false;
      };
      const groups = new Map();
      this.scene.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return;
        if (o.children.length) return;
        if (Array.isArray(o.material)) return;
        const mat = o.material;
        if (!mat || mat.transparent || mat.isShaderMaterial || mat.isSpriteMaterial) return;
        if (o.morphTargetInfluences && o.morphTargetInfluences.length) return;
        if (isAnimated(o)) return;
        if (!o.geometry.attributes.position) return;
        const attrs = Object.keys(o.geometry.attributes).sort().map(n => n + ':' + o.geometry.attributes[n].itemSize + ':' + o.geometry.attributes[n].array.constructor.name).join(',');
        const key = materialSignature(mat) + '|' + o.renderOrder + '|' + o.layers.mask + '|' + attrs;
        if (!groups.has(key)) groups.set(key, { mat, items: [] });
        groups.get(key).items.push(o);
      });

      for (const group of groups.values()) {
        if (group.items.length < 2) continue;
        const first = group.items[0];
        const attrNames = Object.keys(first.geometry.attributes);
        const attrMeta = attrNames.map(name => {
          const a = first.geometry.attributes[name];
          return { name, itemSize: a.itemSize, normalized: !!a.normalized };
        });
        const chunks = [];
        const totals = {};
        for (const { name, itemSize } of attrMeta) totals[name] = 0;
        let valid = true;
        for (const o of group.items) {
          const geo = o.geometry;
          for (const { name } of attrMeta) {
            const a = geo.attributes[name];
            if (!a || !(a.array instanceof Float32Array)) { valid = false; break; }
          }
          if (!valid) break;
          let g = geo.index ? geo.toNonIndexed() : geo.clone();
          o.updateWorldMatrix(true, false);
          g.applyMatrix4(o.matrixWorld);
          chunks.push(g);
          for (const { name, itemSize } of attrMeta) totals[name] += g.attributes[name].count * itemSize;
        }
        if (!valid) continue;
        const merged = new THREE.BufferGeometry();
        for (const { name, itemSize, normalized } of attrMeta) {
          const arr = new Float32Array(totals[name]);
          let offset = 0;
          for (const g of chunks) {
            const a = g.attributes[name];
            arr.set(a.array, offset);
            offset += a.array.length;
          }
          merged.setAttribute(name, new THREE.BufferAttribute(arr, itemSize, normalized));
        }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, first.material);
        mesh.renderOrder = first.renderOrder;
        mesh.layers.mask = first.layers.mask;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
        this.scene.add(mesh);
        for (const o of group.items) { if (o.parent) o.parent.remove(o); }
      }
    }

    _selectReflectionLayers() {
      const includeSprite = o => o === this.whalePlane || o === this.whaleHalo || o === this.whaleBack;
      this.scene.traverse(o => {
        if (o.isLight) { o.layers.enable(2); return; }
        if (o === this.sky || o === this.ground || o === this.water) return;
        if (this.sidewalks && this.sidewalks.indexOf(o) !== -1) return;
        if (o === this.neonSpillMesh) return;
        if (o.isSprite) { if (includeSprite(o)) o.layers.enable(2); return; }
        if (o.isPoints || o.isLine) return;
        if (o.isInstancedMesh) { o.layers.enable(2); return; }
        if (!o.isMesh || !o.geometry) return;
        const geo = o.geometry;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        const bs = geo.boundingSphere;
        if (!bs) return;
        const s = Math.max(Math.abs(o.scale.x), Math.abs(o.scale.y), Math.abs(o.scale.z));
        const r = bs.radius * s;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!mat || mat.transparent) return;
        const emissive = mat && (mat.toneMapped === false || (mat.emissive && mat.emissive.getHex() !== 0));
        if (r >= 3.0 || (emissive && r >= 0.9)) o.layers.enable(2);
      });
    }

    setSize(w, h, dpr) {
      if (!this.reflectionRT) return;
      const ratio = Math.min(dpr, 1.5) * (this.quality.reflectionScale || 0.5);
      const rw = Math.max(1, Math.floor(w * ratio));
      const rh = Math.max(1, Math.floor(h * ratio));
      this.reflectionRT.setSize(rw, rh);
    }

    update(dt, time, camera) {
      this.time = time;
      this.activeCamera = camera || this.activeCamera || null;
      this.skyUniforms.uTime.value = time;
      this.groundUniforms.uTime.value = time;
      if (this.waterMat) this.waterMat.uniforms.uTime.value = time;
      if (this.rainMat) {
        this.rainMat.uniforms.uTime.value = time;
        this.rainMat.uniforms.uFlash.value = this.flash;
      }
      if (this.rainNearMat) {
        this.rainNearMat.uniforms.uTime.value = time;
        this.rainNearMat.uniforms.uFlash.value = this.flash;
      }
      if (this.airDustMat) this.airDustMat.uniforms.uTime.value = time;
      if (this.rainMistMat) this.rainMistMat.uniforms.uTime.value = time;
      this.screens.forEach((s, i) => {
        s.mat.uniforms.uTime.value = time;
        const flicker = 0.94 + 0.06 * Math.sin(time * (1.7 + (i % 4) * 0.3) + s.phase);
        s.mat.uniforms.uIntensity.value = s.base * flicker;
      });
      this.neonMats.forEach((n, i) => {
        const pulse = 0.88 + 0.12 * Math.sin(time * (1.1 + (i % 3) * 0.4) + n.phase);
        n.mat.color.copy(n.color).multiplyScalar(pulse);
      });
      for (const obj of this.dynamicGlow) {
        if (obj.userData && obj.userData.blink !== undefined) {
          const on = Math.sin(time * 2.2 + obj.userData.blink) > 0.6;
          obj.material.color.setRGB(on ? 2.4 : 0.2, on ? 0.05 : 0.01, on ? 0.08 : 0.01);
        }
      }
      if (this.towerRings) {
        this.towerRings[0].rotation.z = time * 0.05;
        this.towerRings[1].rotation.z = -time * 0.08;
      }
      if (this.updateProps) this.updateProps(dt, time);
      if (this.updateActors) this.updateActors(dt, time);
      if (this.updateLife) this.updateLife(dt, time);
      this.updateLightning(dt, time);
    }

    triggerLightning() {
      const yaw = this.cameraYaw || 0;
      const side = this.random() > 0.5 ? 1 : -1;
      const az = yaw + side * (0.18 + this.random() * 0.5);
      const dist = 150 + this.random() * 100;
      const cp = this.lightningCameraPos;
      const x = cp.x - Math.sin(az) * dist;
      const z = cp.z - Math.cos(az) * dist;
      const y = 70 + this.random() * 50;
      this.lightningGroup.position.set(x, y, z);
      const sx = 42 + this.random() * 28;
      const sy = 130 + this.random() * 70;
      this.lightningCore.scale.set(sx, sy, 1);
      this.lightningGlow.scale.set(sx * 2.8, sy * 1.35, 1);
      this.lightningCore.material.rotation = (this.random() - 0.5) * 0.12;
      this.lightningActive = true;
      this.lightningElapsed = 0;
      this.lightningGroup.visible = true;
      const distance = 900 + this.random() * 1900;
      const delay = 1.8 + (distance / 1000) * 1.1 + this.random() * 0.35;
      const pan = Math.max(-0.7, Math.min(0.7, (x - cp.x) / Math.max(1, dist)));
      const intensity = 0.45 + this.random() * 0.45;
      if (this.onLightning) this.onLightning({ distance, delay, intensity, pan });
    }

    updateLightning(dt, time) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0 && !this.lightningActive) {
        this.triggerLightning();
        this.nextLightning = 22 + this.random() * 24;
      }
      if (this.lightningActive) {
        this.lightningElapsed += dt;
        const t = this.lightningElapsed;
        let pulse = 0;
        if (t < 0.045) pulse = 1;
        else if (t < 0.08) pulse = 0.2;
        else if (t < 0.13) pulse = 0.95;
        else if (t < 0.19) pulse = 0.35;
        else if (t < 0.24) pulse = 0.8;
        else if (t < 0.34) pulse = 0.25;
        this.lightningCore.material.opacity = pulse * 0.95;
        this.lightningGlow.material.opacity = pulse * 0.2;
        this.flash = pulse * 0.13;
        if (t > 0.5) {
          this.lightningActive = false;
          this.lightningGroup.visible = false;
          this.flash = 0;
        }
      } else {
        this.flash *= Math.max(0, 1 - dt * 7);
      }
      this.skyUniforms.uLightning.value = this.flash;
    }

    renderReflection(renderer, camera) {
      if (!this.reflectionRT || camera.position.y < 0.04) return;
      camera.updateMatrixWorld();
      const camPos = camera.getWorldPosition(this._reflCamPos);
      const normal = this._reflNormal;
      const view = this._reflView.subVectors(this._reflTarget.set(0, 0, 0), camPos);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate();
      const rotationMatrix = this._reflRot.extractRotation(camera.matrixWorld);
      const lookAtPosition = this._reflLook.set(0, 0, -1).applyMatrix4(rotationMatrix).add(camPos);
      const target = this._reflTarget.subVectors(this._reflTarget.set(0, 0, 0), lookAtPosition);
      target.reflect(normal).negate();
      const rc = this.reflectionCamera;
      rc.position.copy(view);
      rc.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      rc.lookAt(target);
      rc.near = camera.near; rc.far = Math.min(camera.far, 150);
      rc.updateMatrixWorld();
      rc.projectionMatrix.copy(camera.projectionMatrix);
      rc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

      const tm = this.reflectionTextureMatrix;
      tm.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
      tm.multiply(rc.projectionMatrix);
      tm.multiply(rc.matrixWorldInverse);
      this.groundUniforms.uTextureMatrix.value.copy(tm);
      this.sidewalkMat.uniforms.uTextureMatrix.value = this.groundUniforms.uTextureMatrix.value;
      if (this.waterMat) this.waterMat.uniforms.uTextureMatrix.value = this.groundUniforms.uTextureMatrix.value;

      for (const obj of this.reflectionHidden) obj.visible = false;
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.reflectionRT);
      renderer.clear();
      renderer.render(this.scene, rc);
      renderer.setRenderTarget(prevTarget);
      for (const obj of this.reflectionHidden) obj.visible = true;
    }
  }

  // shader strings shared with prototype extensions in props.js
  World.prototype._groundVert = GROUND_VERT;
  World.prototype._groundFrag = GROUND_FRAG;
  World.prototype._waterFrag = WATER_FRAG;

  ND.World = World;
})();
