/* =========================================================================
   NEON DISTRICT — city, wet ground, sky and planar mirror
   ========================================================================= */
(function () {
  'use strict';
  const ND = (window.ND = window.ND || {});
  const TAU = Math.PI * 2;
  const V3 = THREE.Vector3;
  const M4 = THREE.Matrix4;

  const GROUND_VERT = `
    uniform mat4 uTextureMatrix;
    varying vec3 vWorld;
    varying vec3 vView;
    varying vec4 vReflect;
    varying vec2 vGroundUv;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vReflect = uTextureMatrix * world;
      vView = normalize(cameraPosition - world.xyz);
      vGroundUv = uv;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;

  const GROUND_FRAG = `
    uniform sampler2D tReflection;
    uniform float uTime;
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    uniform vec3 uLightPos[6];
    uniform vec3 uLightColor[6];
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
      float h = 0.0;
      for (int l = 0; l < 3; l++) {
        float scale = 1.0 + float(l) * 0.72;
        vec2 q = p * scale + float(l) * 9.7;
        vec2 id = floor(q);
        vec2 f = fract(q) - 0.5;
        float phase = hash21(id + float(l) * 4.3);
        float cycle = fract(t * 0.48 + phase);
        float radius = cycle * 0.60;
        float ring = smoothstep(0.045, 0.0, abs(length(f) - radius)) * (1.0 - cycle);
        h += ring * 0.52;
      }
      h += (vnoise(p * 17.0 + vec2(t * 2.7, -t * 1.9)) - 0.5) * 0.035;
      return h * 0.5;
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

      float reflAmount = mix(0.26, 0.96, puddle) * (0.58 + 0.42 * fresnel) * (1.0 - grout * 0.45);
      vec3 col = stone * (0.34 + 0.66 * (1.0 - puddle));

      // street light spill, physically-ish inverse square
      vec3 spill = vec3(0.0);
      for (int i = 0; i < 6; i++) {
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
    uniform vec3 uLightPos[6];
    uniform vec3 uLightColor[6];
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
      float h = 0.0;
      h += sin(p.x * 2.7 + t * 1.45) * 0.040;
      h += sin(p.y * 3.9 - t * 1.9 + p.x * 0.7) * 0.030;
      h += sin((p.x + p.y) * 6.2 + t * 2.7) * 0.012;
      vec2 q = p * 2.4 + t * 0.45;
      vec2 id = floor(q), f = fract(q) - 0.5;
      float phase = hash21(id);
      float cycle = fract(t * 0.65 + phase);
      float ringMask = smoothstep(0.58, 0.76, hash21(id + 17.3));
      float ring = smoothstep(0.05, 0.0, abs(length(f) - cycle * 0.55)) * (1.0 - cycle) * ringMask;
      return h + ring * 0.12;
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
      for (int i = 0; i < 6; i++) {
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

  class World {
    constructor(scene, renderer, opts) {
      this.scene = scene;
      this.renderer = renderer;
      this.opts = opts || {};
      this.quality = this.opts.quality || {};
      this.time = 0;
      this.flash = 0;
      this.nextLightning = 7.5;
      this.lightningDecay = 0;
      this.random = ND.util.mulberry32(92731);
      this.fogColor = new THREE.Color(0x12081d);
      this.fogDensity = 0.0074;
      this.screens = [];
      this.cars = [];
      this.pedestrians = [];
      this.steamVents = [];
      this.fogCards = [];
      this.neonMats = [];
      this.acMatrices = [];
      this.acLedMatrices = [];
      this.acLedColors = [];
      this.balconyMatrices = [];
      this.railMatrices = [];
      this.pipeMatrices = [];
      this.ledgeMatrices = [];
      this.neonBatches = { magenta: [], cyan: [], amber: [], violet: [] };
      this.roofTanks = [];
      this.reflectionHidden = [];
      this.dynamicGlow = [];
      this.groundLights = [
        { p: new V3(-10.7, 8.2, 15.0), c: new THREE.Color(0xff2d8f).multiplyScalar(2.0) },
        { p: new V3(10.8, 11.0, 1.5), c: new THREE.Color(0x23d7ff).multiplyScalar(1.8) },
        { p: new V3(0.0, 18.0, -76.0), c: new THREE.Color(0xff7a3b).multiplyScalar(2.3) },
        { p: new V3(-10.6, 7.5, -34.0), c: new THREE.Color(0x8a5bff).multiplyScalar(1.7) },
        { p: new V3(10.5, 8.6, -48.0), c: new THREE.Color(0xff4b9e).multiplyScalar(1.7) },
        { p: new V3(0.0, 5.4, 27.0), c: new THREE.Color(0xffb15b).multiplyScalar(1.3) }
      ];

      this.scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity);
      this.buildMaterials();
      this.buildSky();
      this.buildEnvironment();
      this.buildLights();
      this.buildCity();
      this.buildGround();
      this.buildWater();
      this.buildStreetDetails();
      this.buildAtmosphere();
      this.buildRain();
      this.buildCharacters();
      this.buildVehicles();
      this.buildHologram();
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
      this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x14131b, roughness: 0.82, metalness: 0.12 });
      this.roofMat = new THREE.MeshStandardMaterial({ color: 0x0b0c12, roughness: 0.72, metalness: 0.25 });
      this.metalMat = new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.38, metalness: 0.72 });
      this.rustMat = new THREE.MeshStandardMaterial({ color: 0x2a1712, roughness: 0.55, metalness: 0.6 });
      this.glowingWindowMat = new THREE.MeshBasicMaterial({ color: 0xffd19a, toneMapped: false });
      this.billboardFrameMat = new THREE.MeshStandardMaterial({ color: 0x08090e, roughness: 0.35, metalness: 0.85 });
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

    buildEnvironment() {
      const tex = ND.Tex.canvasToTexture(ND.Tex.environment(), true);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = tex;
      this.envTexture = tex;
      // tame the IBL slightly so the emissive signage still leads
      this.scene.traverse(o => {
        if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
          o.material.envMapIntensity = 0.55;
        }
      });
    }

    buildLights() {
      this.scene.add(new THREE.HemisphereLight(0x5b6fa8, 0x2b0a22, 1.05));
      const dir = new THREE.DirectionalLight(0x8999ff, 0.95);
      dir.position.set(30, 80, 20);
      this.scene.add(dir);
      const points = [
        { pos: [-11, 10, 16], color: 0xff2d8f, intensity: 190, distance: 45 },
        { pos: [11, 12, 0], color: 0x2adfff, intensity: 220, distance: 48 },
        { pos: [0, 24, -75], color: 0xff823c, intensity: 500, distance: 80 },
        { pos: [-11, 8, -35], color: 0x8a5bff, intensity: 170, distance: 40 },
        { pos: [11, 9, -50], color: 0xff4b9e, intensity: 170, distance: 42 },
        { pos: [0, 6, 27], color: 0xffb15b, intensity: 90, distance: 28 }
      ];
      this.pointLights = [];
      for (const p of points) {
        const l = new THREE.PointLight(p.color, p.intensity, p.distance, 2);
        l.position.set(p.pos[0], p.pos[1], p.pos[2]);
        this.scene.add(l);
        this.pointLights.push(l);
      }
    }

    // Build one row of tenement blocks along the street.
    buildSide(side) {
      const rnd = this.random;
      const facadeX = 13.8;
      let cursor = 57;
      const buildings = [];
      while (cursor > -79) {
        let len = 8 + rnd() * 13;
        if (cursor - len < -79) len = Math.max(4, cursor + 79);
        const gap = 0.35 + rnd() * 2.2;
        const depth = 10 + rnd() * 15;
        let h = 18 + Math.pow(rnd(), 1.7) * 68;
        if (cursor < 18 && cursor > -60) h = Math.max(h, 24 + rnd() * 26);
        const z = cursor - len / 2;
        const b = { side, z, len, depth, h, facadeX };
        this.addBuilding(b, rnd, buildings.length);
        buildings.push(b);
        cursor -= len + gap;
      }
      return buildings;
    }

    addBuilding(b, rnd, index) {
      const { side, z, len, depth, h } = b;
      const group = new THREE.Group();
      const bodyColor = new THREE.Color().setHSL(0.66 + rnd() * 0.08, 0.08 + rnd() * 0.08, 0.035 + rnd() * 0.02);
      const bodyMat = this.bodyMat.clone();
      bodyMat.color.copy(bodyColor);
      const body = new THREE.Mesh(new THREE.BoxGeometry(depth, h, len), bodyMat);
      body.position.set(side * (b.facadeX + depth / 2), h / 2, z);
      group.add(body);

      const canvas = this.facadeCanvases[index % this.facadeCanvases.length];
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
        emissiveIntensity: 0.82 + rnd() * 0.25,
        color: new THREE.Color().setHSL(0.62 + rnd() * 0.16, 0.12, 0.56 + rnd() * 0.12),
        roughness: 0.32 + rnd() * 0.18,
        metalness: 0.28 + rnd() * 0.2
      });
      const facade = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
      facade.position.set(side * (b.facadeX - 0.02), h / 2, z);
      facade.rotation.y = -side * Math.PI / 2;
      group.add(facade);

      // side facade facing the nearest alley / cross street
      if (rnd() > 0.45) {
        const stex = tex.clone();
        stex.needsUpdate = true;
        stex.repeat.set(Math.max(1, depth / 13.5), Math.max(1, h / 30.0));
        const smat = mat.clone();
        smat.map = stex; smat.emissiveMap = stex;
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
      const ledges = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < ledges; i++) {
        const ly = 7 + rnd() * Math.max(2, h - 12);
        const dummy = new THREE.Object3D();
        dummy.position.set(side * (b.facadeX - 0.42), ly, z + (rnd() - 0.5) * len * 0.1);
        dummy.scale.set(0.95, 0.16, len * (0.55 + rnd() * 0.32));
        dummy.updateMatrix();
        this.ledgeMatrices.push(dummy.matrix.clone());
      }

      // air conditioners, balconies, pipes
      const acCount = Math.floor(len * (0.8 + rnd() * 1.5));
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
      const balconyCount = rnd() > 0.48 ? 1 + Math.floor(rnd() * 4) : 0;
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
      const pipeCount = rnd() > 0.5 ? 1 + Math.floor(rnd() * 3) : 0;
      for (let i = 0; i < pipeCount; i++) {
        const dummy = new THREE.Object3D();
        const py = 2 + rnd() * 8;
        dummy.position.set(side * (b.facadeX - 0.23), py + (h - py) / 2, z + (rnd() - 0.5) * len);
        dummy.scale.set(0.07, h - py, 0.07);
        dummy.updateMatrix();
        this.pipeMatrices.push(dummy.matrix.clone());
      }

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
      const pipeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), this.rustMat, this.pipeMatrices.length);
      this.pipeMatrices.forEach((m, i) => pipeMesh.setMatrixAt(i, m));
      pipeMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(pipeMesh);
      const ledgeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1b1922, roughness: 0.52, metalness: 0.38 }), this.ledgeMatrices.length);
      this.ledgeMatrices.forEach((m, i) => ledgeMesh.setMatrixAt(i, m));
      ledgeMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(ledgeMesh);
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
        { side: 1, z: 40, y: 4.6, text: '未來光學', sub: 'FUTURE OPTICS', a: '#53efff', b: '#8f6cff', w: 4.0 }
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
      const uniforms = {
        uTextureMatrix: { value: new M4() },
        tReflection: { value: null },
        uTime: { value: 0 },
        uFogDensity: { value: this.fogDensity },
        uFogColor: { value: this.fogColor },
        uLightPos: { value: this.groundLights.map(l => l.p) },
        uLightColor: { value: this.groundLights.map(l => l.c) },
        uKind: { value: 0 }
      };
      this.groundUniforms = uniforms;
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        depthWrite: true
      });
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(46, 200, 1, 1), mat);
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.position.set(0, 0.015, -22);
      this.scene.add(this.ground);
      this.reflectionHidden.push(this.ground);

      const su = {
        uTextureMatrix: uniforms.uTextureMatrix,
        tReflection: uniforms.tReflection,
        uTime: uniforms.uTime,
        uFogDensity: uniforms.uFogDensity,
        uFogColor: uniforms.uFogColor,
        uLightPos: uniforms.uLightPos,
        uLightColor: uniforms.uLightColor,
        uKind: { value: 1 }
      };
      const smat = new THREE.ShaderMaterial({
        uniforms: su,
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        depthWrite: true
      });
      this.sidewalkMat = smat;
      const swGeo = new THREE.PlaneGeometry(4.2, 150);
      const swL = new THREE.Mesh(swGeo, smat);
      swL.rotation.x = -Math.PI / 2;
      swL.position.set(-11.6, 0.17, -17);
      this.scene.add(swL);
      const swR = new THREE.Mesh(swGeo.clone(), smat);
      swR.rotation.x = -Math.PI / 2;
      swR.position.set(11.6, 0.17, -17);
      this.scene.add(swR);
      this.sidewalks = [swL, swR];
      this.reflectionHidden.push(swL, swR);
    }

    buildReflection() {
      this.reflectionCamera = new THREE.PerspectiveCamera();
      this.reflectionCamera.layers.set(0);
      this.reflectionTextureMatrix = new M4();
      this.reflectorPlane = new THREE.Plane(new V3(0, 1, 0), 0);
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

    setSize(w, h, dpr) {
      if (!this.reflectionRT) return;
      const ratio = Math.min(dpr, 1.5) * (this.quality.reflectionScale || 0.5);
      const rw = Math.max(1, Math.floor(w * ratio));
      const rh = Math.max(1, Math.floor(h * ratio));
      this.reflectionRT.setSize(rw, rh);
    }

    update(dt, time) {
      this.time = time;
      this.skyUniforms.uTime.value = time;
      this.groundUniforms.uTime.value = time;
      if (this.waterMat) this.waterMat.uniforms.uTime.value = time;
      if (this.rainMat) this.rainMat.uniforms.uTime.value = time;
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
      this.updateLightning(dt, time);
    }

    updateLightning(dt, time) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.lightningDecay = 1;
        this.nextLightning = 14 + this.random() * 18;
      }
      if (this.lightningDecay > 0) {
        const flick = Math.max(0, Math.sin(time * 37) * 0.4 + 0.6);
        this.flash = this.lightningDecay * flick * 0.48;
        this.lightningDecay = Math.max(0, this.lightningDecay - dt * 2.2);
      } else {
        this.flash *= Math.max(0, 1 - dt * 7);
      }
      this.skyUniforms.uLightning.value = this.flash;
    }

    renderReflection(renderer, camera) {
      if (!this.reflectionRT || camera.position.y < 0.04) return;
      camera.updateMatrixWorld();
      const camPos = camera.getWorldPosition(new V3());
      const normal = new V3(0, 1, 0);
      const view = new V3().subVectors(new V3(0, 0, 0), camPos);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(new V3(0, 0, 0));
      const rotationMatrix = new M4().extractRotation(camera.matrixWorld);
      const lookAtPosition = new V3(0, 0, -1).applyMatrix4(rotationMatrix).add(camPos);
      const target = new V3().subVectors(new V3(0, 0, 0), lookAtPosition);
      target.reflect(normal).negate().add(new V3(0, 0, 0));
      const rc = this.reflectionCamera;
      rc.position.copy(view);
      rc.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      rc.lookAt(target);
      rc.near = camera.near; rc.far = camera.far;
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
