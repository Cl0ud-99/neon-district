/* =========================================================================
   NEON DISTRICT — HDR post-processing chain
   scene -> planar reflection -> HDR target -> 5-level bloom -> film grade
   ========================================================================= */
(function () {
  'use strict';
  const ND = (window.ND = window.ND || {});

  const VS = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const COMMON = `
    float hash12(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * .1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
  `;

  function makeQuad(renderer) {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: VS,
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }',
      depthTest: false, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return {
      scene, camera, mesh,
      draw(material, target, clear) {
        mesh.material = material;
        renderer.setRenderTarget(target);
        if (clear !== false) renderer.clear();
        renderer.render(scene, camera);
      }
    };
  }

  function halton(index, base) {
    let f = 1, r = 0, i = index;
    while (i > 0) {
      f /= base;
      r += f * (i % base);
      i = Math.floor(i / base);
    }
    return r;
  }

  class PostFX {
    constructor(renderer, opts) {
      this.renderer = renderer;
      this.opts = Object.assign({
        bloomLevels: 5,
        msaa: 4,
        reflectionScale: 0.5,
        sceneScale: 1.0,
        exposure: 1.02,
        bloomStrength: 0.98,
        ssr: true
      }, opts || {});
      this.quad = makeQuad(renderer);
      this.width = 1; this.height = 1; this.pixelRatio = 1;
      this.levels = this.opts.bloomLevels;
      this.sceneRT = null;
      this.bloomA = [];
      this.bloomB = [];
      this.streakRT = null;
      this.compositeRT = null;
      this.taaA = null; this.taaB = null; this.taaRead = null; this.taaWrite = null; this.ssrRT = null;
      this.ssrRT = null;
      this._camPos = new THREE.Vector3();
      this.prevViewProj = new THREE.Matrix4();
      this.taaReset = true;
      this.taaFrame = 0;
      this.buildMaterials();
    }

    createRT(w, h, opts) {
      opts = opts || {};
      const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)), {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: opts.type || THREE.HalfFloatType,
        depthBuffer: !!opts.depth,
        stencilBuffer: false,
        samples: opts.samples || 0
      });
      rt.texture.generateMipmaps = false;
      rt.texture.colorSpace = THREE.NoColorSpace;
      return rt;
    }

    buildMaterials() {
      this.brightMat = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
          uThreshold: { value: 0.74 },
          uKnee: { value: 0.48 },
          uIntensity: { value: 1.20 }
        },
        vertexShader: VS,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec2 uTexel;
          uniform float uThreshold, uKnee, uIntensity;
          varying vec2 vUv;
          vec3 prefilter(vec3 c) {
            float br = max(c.r, max(c.g, c.b));
            float soft = br - uThreshold + uKnee;
            soft = clamp(soft, 0.0, 2.0 * uKnee);
            soft = soft * soft / (4.0 * uKnee + 0.0001);
            float contrib = max(soft, br - uThreshold) / max(br, 0.0001);
            return c * contrib * uIntensity;
          }
          void main() {
            vec2 t = uTexel;
            vec3 c = texture2D(tDiffuse, vUv).rgb * 4.0;
            c += texture2D(tDiffuse, vUv + vec2(-t.x, -t.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2( t.x, -t.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2(-t.x,  t.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2( t.x,  t.y)).rgb;
            gl_FragColor = vec4(prefilter(c / 8.0), 1.0);
          }
        `,
        depthTest: false, depthWrite: false
      });

      this.downMat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
        vertexShader: VS,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec2 uTexel;
          varying vec2 vUv;
          void main() {
            vec3 c = texture2D(tDiffuse, vUv).rgb * 4.0;
            c += texture2D(tDiffuse, vUv + vec2(-uTexel.x, -uTexel.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2( uTexel.x, -uTexel.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2(-uTexel.x,  uTexel.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2( uTexel.x,  uTexel.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2(-uTexel.x * 2.0, 0.0)).rgb * 0.5;
            c += texture2D(tDiffuse, vUv + vec2( uTexel.x * 2.0, 0.0)).rgb * 0.5;
            c += texture2D(tDiffuse, vUv + vec2(0.0, -uTexel.y * 2.0)).rgb * 0.5;
            c += texture2D(tDiffuse, vUv + vec2(0.0,  uTexel.y * 2.0)).rgb * 0.5;
            gl_FragColor = vec4(c / 8.0, 1.0);
          }
        `,
        depthTest: false, depthWrite: false
      });

      this.blurMat = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uDir: { value: new THREE.Vector2(1, 0) },
          uTexel: { value: new THREE.Vector2() },
          uScale: { value: 1 }
        },
        vertexShader: VS,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec2 uDir, uTexel;
          uniform float uScale;
          varying vec2 vUv;
          void main() {
            vec2 step = uDir * uTexel * uScale;
            vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
            c += texture2D(tDiffuse, vUv + step * 1.0).rgb * 0.1945945946;
            c += texture2D(tDiffuse, vUv - step * 1.0).rgb * 0.1945945946;
            c += texture2D(tDiffuse, vUv + step * 2.0).rgb * 0.1216216216;
            c += texture2D(tDiffuse, vUv - step * 2.0).rgb * 0.1216216216;
            c += texture2D(tDiffuse, vUv + step * 3.0).rgb * 0.0540540541;
            c += texture2D(tDiffuse, vUv - step * 3.0).rgb * 0.0540540541;
            c += texture2D(tDiffuse, vUv + step * 4.0).rgb * 0.0162162162;
            c += texture2D(tDiffuse, vUv - step * 4.0).rgb * 0.0162162162;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
        depthTest: false, depthWrite: false
      });

      this.streakMat = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uTexel: { value: new THREE.Vector2() }
        },
        vertexShader: VS,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec2 uTexel;
          varying vec2 vUv;
          void main() {
            vec3 c = texture2D(tDiffuse, vUv).rgb * 0.30;
            float w = 0.0;
            for (int i = 1; i <= 12; i++) {
              float fi = float(i);
              float weight = 1.0 / (1.0 + fi * 0.6);
              c += texture2D(tDiffuse, vUv + vec2(uTexel.x * fi * 3.0, 0.0)).rgb * weight;
              c += texture2D(tDiffuse, vUv - vec2(uTexel.x * fi * 3.0, 0.0)).rgb * weight;
              w += weight * 2.0;
            }
            c /= (1.0 + w);
            gl_FragColor = vec4(c * vec3(0.62, 0.82, 1.25), 1.0);
          }
        `,
        depthTest: false, depthWrite: false
      });

      this.finalMat = new THREE.ShaderMaterial({
        uniforms: {
          tScene: { value: null },
          tDepth: { value: null },
          tBloom0: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
          tBloom3: { value: null }, tBloom4: { value: null },
          tStreak: { value: null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uExposure: { value: this.opts.exposure },
          uBloomStrength: { value: this.opts.bloomStrength },
          uFlash: { value: 0 },
          uFade: { value: 1 },
          uLetterbox: { value: 0 },
          uNear: { value: 0.08 },
          uFar: { value: 500 },
          uFocus: { value: 22 },
          uDof: { value: 0 },
          uAO: { value: 0.12 }
        },
        vertexShader: VS,
        fragmentShader: COMMON + `
          uniform sampler2D tScene;
          uniform sampler2D tDepth;
          uniform sampler2D tBloom0, tBloom1, tBloom2, tBloom3, tBloom4;
          uniform sampler2D tStreak;
          uniform vec2 uResolution;
          uniform float uTime, uExposure, uBloomStrength, uFlash, uFade;
          uniform float uNear, uFar, uFocus, uDof, uAO;
          varying vec2 vUv;

          float linearDepth(vec2 uv) {
            float d = texture2D(tDepth, uv).x;
            float z = d * 2.0 - 1.0;
            return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
          }

          vec3 aces(vec3 x) {
            const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
            return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
          }
          vec3 toSRGB(vec3 c) {
            return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
          }

          void main() {
            vec2 uv = vUv;
            vec2 centered = uv * 2.0 - 1.0;

            // Very subtle lens edge chromatic aberration
            float edge = dot(centered, centered);
            vec2 ca = normalize(centered + 0.0001) * edge * 0.0012;
            vec3 scene;
            scene.r = texture2D(tScene, uv + ca * 1.5).r;
            scene.g = texture2D(tScene, uv).g;
            scene.b = texture2D(tScene, uv - ca * 1.5).b;

            // Wet lens micro-droplets: barely perceptible refraction.
            vec2 dropGrid = uv * vec2(17.0, 9.0);
            dropGrid.y += uTime * 0.012;
            vec2 dcell = floor(dropGrid);
            vec2 df = fract(dropGrid) - 0.5;
            float dropMask = smoothstep(0.16, 0.02, length(df * vec2(1.0, 1.6)));
            dropMask *= step(0.955, hash12(dcell + floor(uTime * 0.05)));
            vec2 dropOff = normalize(df + 0.0001) * dropMask * 0.0018;
            vec3 dropCol = texture2D(tScene, uv + dropOff).rgb;
            scene = mix(scene, dropCol, dropMask * 0.22);

            // Cheap depth-edge AO for contact seams and silhouettes.
            if (uAO > 0.0) {
              float d0 = linearDepth(uv);
              float occ = 0.0;
              vec2 p = 1.0 / uResolution;
              for (int i = 0; i < 8; i++) {
                float a = float(i) * 0.7853982;
                vec2 ofs = vec2(cos(a), sin(a)) * p * 2.4;
                float di = linearDepth(uv + ofs);
                occ += smoothstep(0.055, 0.42, (d0 - di) / max(d0, 1.0));
              }
              scene *= 1.0 - clamp(occ / 8.0, 0.0, 1.0) * uAO;
            }

            // Cinematic depth of field. Focus is in world units.
            if (uDof > 0.0) {
              float d = linearDepth(uv);
              float coc = smoothstep(0.06, 0.55, abs(d - uFocus) / max(uFocus, 1.0));
              vec3 blurred = scene * 0.24;
              vec2 p = 1.0 / uResolution;
              float rad = 2.0 + uDof * 4.0;
              blurred += texture2D(tScene, uv + vec2( 1.0, 0.0) * p * rad).rgb * 0.095;
              blurred += texture2D(tScene, uv + vec2(-1.0, 0.0) * p * rad).rgb * 0.095;
              blurred += texture2D(tScene, uv + vec2( 0.0, 1.0) * p * rad).rgb * 0.095;
              blurred += texture2D(tScene, uv + vec2( 0.0,-1.0) * p * rad).rgb * 0.095;
              blurred += texture2D(tScene, uv + vec2( 0.7, 0.7) * p * rad).rgb * 0.085;
              blurred += texture2D(tScene, uv + vec2(-0.7, 0.7) * p * rad).rgb * 0.085;
              blurred += texture2D(tScene, uv + vec2( 0.7,-0.7) * p * rad).rgb * 0.085;
              blurred += texture2D(tScene, uv + vec2(-0.7,-0.7) * p * rad).rgb * 0.085;
              scene = mix(scene, blurred, coc * uDof * 0.72);
            }

            // Fine local contrast keeps wet stone edges and window frames from
            // melting into the bloom.
            vec2 spx = 1.0 / uResolution;
            vec3 soft = scene * 0.36;
            soft += texture2D(tScene, uv + vec2( 1.0, 0.0) * spx * 1.4).rgb * 0.16;
            soft += texture2D(tScene, uv + vec2(-1.0, 0.0) * spx * 1.4).rgb * 0.16;
            soft += texture2D(tScene, uv + vec2( 0.0, 1.0) * spx * 1.4).rgb * 0.16;
            soft += texture2D(tScene, uv + vec2( 0.0,-1.0) * spx * 1.4).rgb * 0.16;
            scene = max(scene + (scene - soft) * 0.095, vec3(0.0));

            vec3 bloom = texture2D(tBloom0, uv).rgb * 1.00;
            bloom += texture2D(tBloom1, uv).rgb * 0.78;
            bloom += texture2D(tBloom2, uv).rgb * 0.58;
            bloom += texture2D(tBloom3, uv).rgb * 0.42;
            bloom += texture2D(tBloom4, uv).rgb * 0.30;
            bloom += texture2D(tStreak, uv).rgb * 0.12;
            bloom *= vec3(1.03, 0.98, 1.045);

            vec3 c = scene + bloom * uBloomStrength;
            c *= uExposure;
            c += uFlash * vec3(0.55, 0.72, 1.0) * 0.55;
            c = aces(c);

            // color grade: inky teal shadows, hot magenta highlights
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            vec3 shadowTint = vec3(0.030, 0.055, 0.070);
            vec3 highTint = vec3(1.045, 0.965, 1.055);
            c = mix(c, c + shadowTint * (1.0 - smoothstep(0.0, 0.32, l)), 0.55);
            c *= mix(vec3(1.0), highTint, smoothstep(0.3, 1.0, l));
            c = mix(vec3(l), c, 1.12);
            c = pow(clamp(c, 0.0, 1.0), vec3(0.96, 1.0, 1.025));

            // vignette + gate weave
            float vig = smoothstep(0.95, 0.28, length(centered * vec2(1.0, 0.9)));
            c *= mix(0.55, 1.0, vig);

            // fine film grain and dither
            float g = hash12(uv * uResolution + fract(uTime) * 431.7);
            c += (g - 0.5) * 0.022;
            c = toSRGB(clamp(c, 0.0, 1.0));
            c += (hash12(uv * uResolution + 7.3) - 0.5) / 255.0;
            c *= uFade;

            gl_FragColor = vec4(c, 1.0);
          }
        `,
        depthTest: false, depthWrite: false
      });

    this.fxaaMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: VS,
      fragmentShader: COMMON + `
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        varying vec2 vUv;
        float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
        void main() {
          vec2 inv = 1.0 / uResolution;
          vec3 m = texture2D(tDiffuse, vUv).rgb;
          vec3 nw = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * inv).rgb;
          vec3 ne = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * inv).rgb;
          vec3 sw = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * inv).rgb;
          vec3 se = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * inv).rgb;
          float lm = luma(m), lnw = luma(nw), lne = luma(ne), lsw = luma(sw), lse = luma(se);
          float lmin = min(lm, min(lnw, min(lne, min(lsw, lse))));
          float lmax = max(lm, max(lnw, max(lne, max(lsw, lse))));
          float range = lmax - lmin;
          if (range < max(0.028, lmax * 0.10)) { gl_FragColor = vec4(m, 1.0); return; }
          vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), ((lnw + lsw) - (lne + lse)));
          float reduce = max((lnw + lne + lsw + lse) * 0.25 * 0.125, 1.0 / 160.0);
          float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
          dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * inv;
          vec3 a = 0.5 * (
            texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
            texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb
          );
          vec3 b = a * 0.5 + 0.25 * (
            texture2D(tDiffuse, vUv - dir * 0.5).rgb +
            texture2D(tDiffuse, vUv + dir * 0.5).rgb
          );
          float lb = luma(b);
          vec3 outc = (lb < lmin || lb > lmax) ? a : b;
          gl_FragColor = vec4(outc, 1.0);
        }
      `,
      depthTest: false, depthWrite: false
    });

    this.taaMat = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tHistory: { value: null },
        tDepth: { value: null },
        uInvView: { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uReset: { value: 1 },
        uBlend: { value: 0.14 }
      },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tCurrent, tHistory, tDepth;
        uniform mat4 uInvView, uInvProj, uPrevViewProj;
        uniform vec2 uResolution;
        uniform float uReset, uBlend;
        varying vec2 vUv;
        void main() {
          vec3 cur = texture2D(tCurrent, vUv).rgb;
          if (uReset > 0.5) { gl_FragColor = vec4(cur, 1.0); return; }
          float d = texture2D(tDepth, vUv).x;
          vec4 clip = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 view = uInvProj * clip;
          view.xyz /= view.w;
          vec3 world = (uInvView * vec4(view.xyz, 1.0)).xyz;
          vec4 prev = uPrevViewProj * vec4(world, 1.0);
          vec2 puv = prev.xy / max(prev.w, 0.0001) * 0.5 + 0.5;
          if (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) {
            gl_FragColor = vec4(cur, 1.0); return;
          }
          vec2 px = 1.5 / uResolution;
          vec3 mn = cur, mx = cur;
          vec3 taps[4];
          taps[0] = texture2D(tCurrent, vUv + vec2(px.x, 0.0)).rgb;
          taps[1] = texture2D(tCurrent, vUv - vec2(px.x, 0.0)).rgb;
          taps[2] = texture2D(tCurrent, vUv + vec2(0.0, px.y)).rgb;
          taps[3] = texture2D(tCurrent, vUv - vec2(0.0, px.y)).rgb;
          for (int i = 0; i < 4; i++) {
            mn = min(mn, taps[i]);
            mx = max(mx, taps[i]);
          }
          vec3 hist = texture2D(tHistory, puv).rgb;
          hist = clamp(hist, mn, mx);
          float dp = texture2D(tDepth, puv).x;
          if (abs(dp - d) > 0.012) hist = cur;
          gl_FragColor = vec4(mix(hist, cur, uBlend), 1.0);
        }
      `,
      depthTest: false, depthWrite: false
    });

    this.ssrMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tDepth: { value: null },
        uProj: { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uView: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uNear: { value: 0.1 },
        uFar: { value: 260 },
        uStrength: { value: 0.82 }
      },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tScene, tDepth;
        uniform mat4 uProj, uInvProj, uView, uCameraWorld;
        uniform vec3 uCameraPos;
        uniform float uNear, uFar, uStrength;
        varying vec2 vUv;
        float linearDepth(float d) {
          float z = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        void main() {
          vec3 base = texture2D(tScene, vUv).rgb;
          float d = texture2D(tDepth, vUv).x;
          if (d >= 0.999) { gl_FragColor = vec4(base, 1.0); return; }
          vec4 clip = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 vp = uInvProj * clip;
          vp /= vp.w;
          vec3 wpos = (uCameraWorld * vec4(vp.xyz, 1.0)).xyz;
          vec3 n = normalize(cross(dFdx(wpos), dFdy(wpos)));
          if (dot(n, uCameraPos - wpos) < 0.0) n = -n;
          float vertical = 1.0 - smoothstep(0.28, 0.62, abs(n.y));
          if (vertical < 0.01) { gl_FragColor = vec4(base, 1.0); return; }
          vec3 V = normalize(wpos - uCameraPos);
          vec3 R = reflect(V, n);
          float fres = pow(1.0 - max(dot(-V, n), 0.0), 3.0);
          vec3 reflected = vec3(0.0);
          float hit = 0.0;
          for (int i = 1; i <= 18; i++) {
            float dist = float(i) * 0.42;
            vec3 rp = wpos + n * 0.06 + R * dist;
            vec4 cp = uProj * uView * vec4(rp, 1.0);
            if (cp.w <= 0.0) break;
            vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
            float sd = texture2D(tDepth, uv).x;
            if (sd >= 0.999) continue;
            float sceneZ = linearDepth(sd);
            float rayZ = -(uView * vec4(rp, 1.0)).z;
            if (rayZ > sceneZ && rayZ - sceneZ < 1.4) {
              reflected = texture2D(tScene, uv).rgb;
              hit = 1.0;
              break;
            }
          }
          base += reflected * hit * vertical * (0.25 + fres * 0.75) * uStrength * 0.32;
          gl_FragColor = vec4(base, 1.0);
        }
      `,
      depthTest: false, depthWrite: false
    });
    }

    setSize(w, h, pixelRatio) {
      const width = Math.max(1, Math.floor(w * pixelRatio));
      const height = Math.max(1, Math.floor(h * pixelRatio));
      if (this.width === width && this.height === height) return;
      this.width = width; this.height = height; this.pixelRatio = pixelRatio;
      this.disposeTargets();
      const scale = this.opts.sceneScale || 1.0;
      const sw = Math.max(1, Math.floor(width * scale));
      const sh = Math.max(1, Math.floor(height * scale));
      this.renderWidth = sw; this.renderHeight = sh;
      this.sceneRT = this.createRT(sw, sh, {
        depth: true,
        samples: this.opts.msaa || 0
      });
      this.sceneDepth = new THREE.DepthTexture(sw, sh, THREE.UnsignedIntType);
      this.sceneDepth.minFilter = THREE.NearestFilter;
      this.sceneDepth.magFilter = THREE.NearestFilter;
      this.sceneRT.depthTexture = this.sceneDepth;
      this.finalMat.uniforms.tDepth.value = this.sceneDepth;
      this.taaA = this.createRT(sw, sh);
      this.taaB = this.createRT(sw, sh);
      this.taaRead = this.taaA;
      this.taaWrite = this.taaB;
      this.ssrRT = this.createRT(Math.max(1, Math.floor(sw * 0.5)), Math.max(1, Math.floor(sh * 0.5)));
      this.taaMat.uniforms.uResolution.value.set(sw, sh);
      this.taaReset = true;
      let lw = Math.max(1, Math.floor(sw * 0.5));
      let lh = Math.max(1, Math.floor(sh * 0.5));
      this.bloomA = []; this.bloomB = [];
      for (let i = 0; i < this.levels; i++) {
        this.bloomA.push(this.createRT(lw, lh));
        this.bloomB.push(this.createRT(lw, lh));
        lw = Math.max(1, Math.floor(lw * 0.5));
        lh = Math.max(1, Math.floor(lh * 0.5));
      }
      this.streakRT = this.createRT(Math.max(1, Math.floor(sw * 0.25)), Math.max(1, Math.floor(sh * 0.25)));
      this.compositeRT = this.createRT(width, height, { type: THREE.UnsignedByteType });
      this.fxaaMat.uniforms.uResolution.value.set(width, height);
      this.finalMat.uniforms.uResolution.value.set(width, height);
    }

    disposeTargets() {
      if (this.sceneRT) this.sceneRT.dispose();
      this.bloomA.forEach(t => t.dispose());
      this.bloomB.forEach(t => t.dispose());
      if (this.streakRT) this.streakRT.dispose();
      if (this.compositeRT) this.compositeRT.dispose();
      if (this.sceneDepth) this.sceneDepth.dispose();
      if (this.taaA) this.taaA.dispose();
      if (this.taaB) this.taaB.dispose();
      if (this.ssrRT) this.ssrRT.dispose();
      this.sceneDepth = null;
      this.taaA = null; this.taaB = null; this.taaRead = null; this.taaWrite = null;
      this.bloomA = []; this.bloomB = [];
    }

    resetTAA() {
      this.taaReset = true;
    }

    render(scene, camera, world, time, flash) {
      const r = this.renderer;
      // 1. planar reflection render (handled by world)
      if (world && world.renderReflection) world.renderReflection(r, camera);

      // 2. HDR scene, temporarily jittered by a sub-pixel Halton offset.
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      const proj = camera.projectionMatrix.clone();
      const invProj = proj.clone().invert();
      const viewProj = new THREE.Matrix4().multiplyMatrices(proj, camera.matrixWorldInverse);
      const taa = this.opts.taa !== false;
      this.taaFrame++;
      if (taa) {
        const jx = (halton(this.taaFrame, 2) - 0.5) * 2.0 / this.sceneRT.width;
        const jy = (halton(this.taaFrame, 3) - 0.5) * 2.0 / this.sceneRT.height;
        camera.projectionMatrix.elements[8] += jx;
        camera.projectionMatrix.elements[9] += jy;
      }
      r.setRenderTarget(this.sceneRT);
      r.clear();
      r.render(scene, camera);
      camera.projectionMatrix.copy(proj);
      camera.projectionMatrixInverse.copy(invProj);

      // 2b. temporal resolve (static geometry reprojection + neighbourhood clamp)
      if (taa) {
        const T = this.taaMat.uniforms;
        T.tCurrent.value = this.sceneRT.texture;
        T.tHistory.value = this.taaRead.texture;
        T.tDepth.value = this.sceneDepth;
        T.uInvView.value.copy(camera.matrixWorld);
        T.uInvProj.value.copy(invProj);
        T.uPrevViewProj.value.copy(this.prevViewProj);
        T.uReset.value = this.taaReset ? 1 : 0;
        T.uBlend.value = 0.14;
        this.quad.draw(this.taaMat, this.taaWrite);
        const swap = this.taaRead;
        this.taaRead = this.taaWrite;
        this.taaWrite = swap;
        this.taaReset = false;
      }
      this.prevViewProj.copy(viewProj);
      let sceneTex = taa ? this.taaRead.texture : this.sceneRT.texture;

      // 2c. screen-space reflections for vertical wet walls
      if (this.opts.ssr !== false && this.ssrRT) {
        const S = this.ssrMat.uniforms;
        S.tScene.value = sceneTex;
        S.tDepth.value = this.sceneDepth;
        S.uProj.value.copy(camera.projectionMatrix);
        S.uInvProj.value.copy(camera.projectionMatrixInverse);
        S.uView.value.copy(camera.matrixWorldInverse);
        S.uCameraWorld.value.copy(camera.matrixWorld);
        camera.getWorldPosition(this._camPos);
        S.uCameraPos.value.copy(this._camPos);
        S.uNear.value = camera.near;
        S.uFar.value = camera.far;
        this.quad.draw(this.ssrMat, this.ssrRT);
        sceneTex = this.ssrRT.texture;
      }

      // 3. bright pass -> bloom mip 0
      this.brightMat.uniforms.tDiffuse.value = sceneTex;
      this.brightMat.uniforms.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      this.quad.draw(this.brightMat, this.bloomA[0]);

      // 4. build blurred mip chain
      for (let i = 0; i < this.levels; i++) {
        if (i > 0) {
          const src = this.bloomA[i - 1];
          this.downMat.uniforms.tDiffuse.value = src.texture;
          this.downMat.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
          this.quad.draw(this.downMat, this.bloomA[i]);
        }
        const rt = this.bloomA[i];
        const tw = 1 / rt.width, th = 1 / rt.height;
        this.blurMat.uniforms.tDiffuse.value = rt.texture;
        this.blurMat.uniforms.uTexel.value.set(tw, th);
        this.blurMat.uniforms.uDir.value.set(1, 0);
        this.blurMat.uniforms.uScale.value = 1.0 + i * 0.35;
        this.quad.draw(this.blurMat, this.bloomB[i]);
        this.blurMat.uniforms.tDiffuse.value = this.bloomB[i].texture;
        this.blurMat.uniforms.uDir.value.set(0, 1);
        this.quad.draw(this.blurMat, this.bloomA[i]);
      }

      // 5. anamorphic streak from the second mip
      this.streakMat.uniforms.tDiffuse.value = this.bloomA[Math.min(1, this.levels - 1)].texture;
      this.streakMat.uniforms.uTexel.value.set(1 / this.streakRT.width, 1 / this.streakRT.height);
      this.quad.draw(this.streakMat, this.streakRT);

      // 6. grade to screen
      const U = this.finalMat.uniforms;
      U.tScene.value = sceneTex;
      U.tDepth.value = this.sceneDepth;
      U.uNear.value = camera.near;
      U.uFar.value = camera.far;
      U.tBloom0.value = this.bloomA[0].texture;
      U.tBloom1.value = this.bloomA[1] ? this.bloomA[1].texture : this.bloomA[0].texture;
      U.tBloom2.value = this.bloomA[2] ? this.bloomA[2].texture : this.bloomA[0].texture;
      U.tBloom3.value = this.bloomA[3] ? this.bloomA[3].texture : this.bloomA[0].texture;
      U.tBloom4.value = this.bloomA[4] ? this.bloomA[4].texture : this.bloomA[0].texture;
      U.tStreak.value = this.streakRT.texture;
      U.uTime.value = time;
      U.uFlash.value = flash || 0;
      this.quad.draw(this.finalMat, this.compositeRT);
      this.fxaaMat.uniforms.tDiffuse.value = this.compositeRT.texture;
      this.quad.draw(this.fxaaMat, null);
    }
  }

  ND.PostFX = PostFX;
})();
