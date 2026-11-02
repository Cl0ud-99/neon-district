/* =========================================================================
   NEON DISTRICT — rain, citizens, traffic and a holographic koi
   ========================================================================= */
(function () {
  'use strict';
  const ND = window.ND;
  const World = ND.World;
  const TAU = Math.PI * 2;

  /* ---------------------------------------------------------------------
     GPU rain. Each drop is a line segment whose position is wrapped in the
     vertex shader, so 9,000 drops cost almost nothing on the CPU.
     --------------------------------------------------------------------- */
  World.prototype.buildRain = function () {
    const count = this.quality.rainCount || 9000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 2 * 3);
    const speed = new Float32Array(count * 2);
    const phase = new Float32Array(count * 2);
    const end = new Float32Array(count * 2);
    const rnd = ND.util.mulberry32(23087);
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * 64;
      const y = rnd() * 38;
      const z = (rnd() - 0.5) * 90;
      const s = 18 + rnd() * 26;
      const p = rnd();
      for (let e = 0; e < 2; e++) {
        const idx = i * 2 + e;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
        speed[idx] = s;
        phase[idx] = p;
        end[idx] = e;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: 38 },
        uColor: { value: new THREE.Color(0.30, 0.47, 0.78) },
        uOpacity: { value: 0.20 }
      },
      vertexShader: `
        uniform float uTime, uHeight;
        attribute float aSpeed, aPhase, aEnd;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float y = mod(p.y - uTime * aSpeed + aPhase * uHeight * 2.0, uHeight);
          p.y = y;
          p.x += sin(uTime * 0.23 + aPhase * 6.28) * 0.45;
          p.z += cos(uTime * 0.19 + aPhase * 5.13) * 0.35;
          float len = 0.15 + aSpeed * 0.017;
          p.y += aEnd * len;
          vAlpha = mix(0.85, 0.06, aEnd) * (0.62 + 0.38 * aPhase);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, uOpacity * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.rainMat = mat;
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.layers.set(1);
    this.rain.renderOrder = 20;
    this.scene.add(this.rain);
  };

  /* ---------------------------------------------------------------------
     Steam / vent smoke. CPU particles, soft point sprites.
     --------------------------------------------------------------------- */
  World.prototype._buildSteam = function () {
    const count = 320;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const rnd = ND.util.mulberry32(83491);
    this._steamVents = [
      { x: -8.8, y: 0.15, z: 22, dir: 0.4 },
      { x: 9.3, y: 0.15, z: -5, dir: -0.2 },
      { x: -7.0, y: 0.15, z: -30, dir: 0.12 },
      { x: 10.1, y: 0.15, z: -47, dir: -0.15 },
      { x: 1.8, y: 0.15, z: -68, dir: 0.22 },
      { x: -2.2, y: 0.15, z: -58, dir: -0.4 }
    ];
    this._steam = [];
    for (let i = 0; i < count; i++) {
      const vent = this._steamVents[i % this._steamVents.length];
      const life = rnd();
      const p = {
        vent, life,
        x: vent.x + (rnd() - 0.5) * 1.2,
        y: vent.y + life * 5.5,
        z: vent.z + (rnd() - 0.5) * 1.2,
        vx: (rnd() - 0.5) * 0.25,
        vy: 0.25 + rnd() * 0.65,
        vz: (rnd() - 0.5) * 0.25,
        max: 2.5 + rnd() * 3.5,
        size: 0.6 + rnd() * 1.2
      };
      this._steam.push(p);
      positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
      sizes[i] = p.size;
      alphas[i] = 0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    const tex = ND.Tex.canvasToTexture(ND.Tex.smoke(160, 3), true);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uColor: { value: new THREE.Color(0.45, 0.55, 0.72) }
      },
      vertexShader: `
        attribute float aSize, aAlpha;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (180.0 / max(1.0, -mv.z)), 1.0, 170.0);
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          float a = t.a * vAlpha;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uColor * (0.7 + 0.5 * t.r), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.steam = new THREE.Points(geo, mat);
    this.steam.frustumCulled = false;
    this.steam.renderOrder = 8;
    this.scene.add(this.steam);
  };

  /* ---------------------------------------------------------------------
     Citizens in raincoats with luminous umbrellas.
     --------------------------------------------------------------------- */
  World.prototype._makeCitizen = function (index) {
    const rnd = ND.util.mulberry32(30103 + index * 77);
    const group = new THREE.Group();
    const coatCol = new THREE.Color().setHSL(0.64 + rnd() * 0.12, 0.16 + rnd() * 0.18, 0.035 + rnd() * 0.035);
    const coatMat = new THREE.MeshStandardMaterial({ color: coatCol, roughness: 0.7, metalness: 0.18 });
    const trimCol = [0xff2d8e, 0x26e7ff, 0xb969ff, 0xffa349][Math.floor(rnd() * 4)];
    const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(trimCol).multiplyScalar(1.9), toneMapped: false });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x120f13, roughness: 0.9, metalness: 0.02 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.5, metalness: 0.3 });

    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.52, 1.18, 14), coatMat);
    coat.position.y = 0.92;
    group.add(coat);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.012, 4, 26), trimMat);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.35;
    group.add(hem);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 9), coatMat);
    shoulders.scale.set(1.25, 0.55, 0.8);
    shoulders.position.y = 1.46;
    group.add(shoulders);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10), skinMat);
    head.position.y = 1.68;
    group.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), coatMat);
    hood.scale.set(1.1, 1.0, 1.06);
    hood.position.set(0, 1.7, -0.035);
    group.add(hood);
    const arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 6), coatMat);
      arm.position.set(sx * 0.29, 1.19, 0);
      arm.rotation.z = sx * 0.08;
      group.add(arm);
      arms.push(arm);
    }
    if (rnd() > 0.56) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.32, 0.11), new THREE.MeshStandardMaterial({ color: 0x13151b, roughness: 0.45, metalness: 0.35 }));
      bag.position.set(-0.36, 0.67, 0.03);
      bag.rotation.z = 0.12;
      group.add(bag);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.7, 0.02), this.metalMat);
      strap.position.set(-0.25, 1.22, 0.04);
      strap.rotation.z = -0.18;
      group.add(strap);
    }

    const legs = [];
    for (const sx of [-0.12, 0.12]) {
      const hip = new THREE.Group();
      hip.position.set(sx, 0.5, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.12), bootMat);
      leg.position.y = -0.25;
      hip.add(leg);
      group.add(hip);
      legs.push(hip);
    }
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.65, 0.03), trimMat);
    trim.position.set(0.24, 1.1, -0.05);
    group.add(trim);

    // umbrella
    const umbrella = new THREE.Group();
    const canopyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(trimCol).multiplyScalar(0.32),
      roughness: 0.28, metalness: 0.25, transparent: true, opacity: 0.82,
      side: THREE.DoubleSide, depthWrite: false
    });
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.22, 12, 1, true), canopyMat);
    canopy.position.y = 0.02;
    umbrella.add(canopy);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.012, 4, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(trimCol).multiplyScalar(2.2), toneMapped: false }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.09;
    umbrella.add(rim);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), bootMat);
    stem.position.y = -0.52;
    umbrella.add(stem);
    const ribPos = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      ribPos.push(0, 0.06, 0, Math.cos(a) * 0.7, -0.08, Math.sin(a) * 0.7);
    }
    const ribGeo = new THREE.BufferGeometry();
    ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribPos, 3));
    const ribs = new THREE.LineSegments(ribGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(trimCol).multiplyScalar(0.9), transparent: true, opacity: 0.72 }));
    umbrella.add(ribs);
    umbrella.position.set(0.12, 2.04, 0);
    group.add(umbrella);

    this.addContactShadow(group, 1.15, 0.72, 0.5, 0.008);
    group.userData = { legs, arms, hem, umbrella, phase: rnd() * TAU, speed: 0.45 + rnd() * 0.6, dir: rnd() > 0.5 ? 1 : -1 };
    return group;
  };

  World.prototype._buildFountain = function () {
    const count = 280;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const alp = new Float32Array(count);
    const siz = new Float32Array(count);
    const rnd = ND.util.mulberry32(61411);
    this._fountainData = [];
    const emitters = [
      { x: -5.8, z: -63.1 }, { x: 5.8, z: -63.1 }, { x: -4.4, z: -58.3 }, { x: 4.4, z: -58.3 }
    ];
    for (let i = 0; i < count; i++) {
      const e = emitters[i % emitters.length];
      const d = {
        e,
        x: e.x, y: 0.35, z: e.z,
        vx: (0 - e.x) * (0.035 + rnd() * 0.02),
        vz: (-61.5 - e.z) * (0.025 + rnd() * 0.015),
        vy: 1.2 + rnd() * 1.8,
        life: rnd() * 1.5,
        max: 1.2 + rnd() * 1.2,
        size: 0.08 + rnd() * 0.08
      };
      this._fountainData.push(d);
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      alp[i] = 0; siz[i] = d.size;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: ND.Tex.canvasToTexture(ND.Tex.glow(64), true) }, uColor: { value: new THREE.Color(0.55, 0.95, 1.0) } },
      vertexShader: `
        attribute float aAlpha, aSize;
        varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = clamp(aSize * (420.0 / max(1.0,-mv.z)), 1.0, 26.0);
          vA = aAlpha;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vA); }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.fountain = new THREE.Points(geo, mat);
    this.fountain.frustumCulled = false;
    this.scene.add(this.fountain);
    // nozzles
    for (const e of emitters) {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.26, 7), this.metalMat);
      n.position.set(e.x, 0.27, e.z);
      this.scene.add(n);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ff6ff).multiplyScalar(2.2), toneMapped: false }));
      cap.position.set(e.x, 0.41, e.z);
      this.scene.add(cap);
    }
  };

  World.prototype.updateFountain = function (dt, time) {
    if (!this.fountain) return;
    const pos = this.fountain.geometry.attributes.position.array;
    const alp = this.fountain.geometry.attributes.aAlpha.array;
    const siz = this.fountain.geometry.attributes.aSize.array;
    for (let i = 0; i < this._fountainData.length; i++) {
      const p = this._fountainData[i];
      p.life += dt / p.max;
      if (p.life >= 1) {
        p.life = 0;
        p.x = p.e.x; p.y = 0.35; p.z = p.e.z;
        p.vx = (0 - p.e.x) * (0.035 + Math.random() * 0.02);
        p.vz = (-61.5 - p.e.z) * (0.025 + Math.random() * 0.015);
        p.vy = 1.2 + Math.random() * 1.8;
      }
      p.vy -= 3.4 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.24) { p.y = 0.24; p.vy = 0; }
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      alp[i] = Math.sin(Math.min(1, p.life) * Math.PI) * 0.6;
      siz[i] = p.size * (0.6 + p.life * 0.8);
    }
    this.fountain.geometry.attributes.position.needsUpdate = true;
    this.fountain.geometry.attributes.aAlpha.needsUpdate = true;
    this.fountain.geometry.attributes.aSize.needsUpdate = true;
  };

  World.prototype.buildCharacters = function () {
    this._buildSteam();
    this._buildFountain();
    const rnd = ND.util.mulberry32(77123);
    const xsLeft = [-10.7, -9.7, -11.4, -8.9, -10.2];
    const xsRight = [10.7, 9.6, 11.4, 8.8, 10.1];
    for (let i = 0; i < 12; i++) {
      const p = this._makeCitizen(i);
      const left = i % 2 === 0;
      const x = (left ? xsLeft : xsRight)[Math.floor(i / 2) % 5];
      const z = -70 + rnd() * 112;
      p.position.set(x, 0.17, z);
      p.rotation.y = rnd() * TAU;
      p.scale.setScalar(0.92 + rnd() * 0.18);
      this.pedestrians.push(p);
      this.scene.add(p);
    }
    // A pair of foreground silhouettes anchoring the composition.
    const heroA = this._makeCitizen(101);
    heroA.position.set(-4.2, 0.03, 18.5);
    heroA.rotation.y = 0.24;
    heroA.scale.setScalar(1.12);
    heroA.userData.speed = 0.15;
    heroA.userData.dir = -1;
    this.heroA = heroA;
    this.scene.add(heroA);
    this.pedestrians.push(heroA);
    const heroB = this._makeCitizen(102);
    heroB.position.set(3.9, 0.03, 27.0);
    heroB.rotation.y = -0.3;
    heroB.scale.setScalar(1.04);
    heroB.userData.speed = 0.12;
    heroB.userData.dir = 1;
    this.heroB = heroB;
    this.scene.add(heroB);
    this.pedestrians.push(heroB);
  };

  /* ---------------------------------------------------------------------
     Traffic above the canyon.
     --------------------------------------------------------------------- */
  World.prototype._makeFlyer = function (index) {
    const rnd = ND.util.mulberry32(5521 + index * 31);
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c1019, roughness: 0.3, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.52, 1.18), bodyMat);
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.38, 0.95), new THREE.MeshStandardMaterial({ color: 0x06111a, roughness: 0.1, metalness: 0.9 }));
    cabin.position.set(-0.2, 0.42, 0);
    g.add(cabin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x36e8ff).multiplyScalar(2.2), toneMapped: false }));
    stripe.position.set(0, -0.08, 0.62);
    g.add(stripe);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.55), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2e7f).multiplyScalar(1.8), toneMapped: false }));
    tail.position.set(-1.45, 0.1, 0);
    g.add(tail);
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdff8ff).multiplyScalar(3.0), toneMapped: false });
    for (const z of [-0.38, 0.38]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.18), headMat);
      light.position.set(1.43, 0.05, z);
      g.add(light);
    }
    const under = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: 0x2ee8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    under.position.set(0, -0.34, 0);
    under.scale.set(5.2, 1.5, 1);
    g.add(under);
    const trail = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: 0xff3b9d, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
    trail.position.set(-3.4, 0, 0);
    trail.scale.set(8.5, 0.7, 1);
    g.add(trail);
    g.userData = {
      speed: 4.5 + rnd() * 5,
      y: 16 + rnd() * 20,
      z: -70 + rnd() * 85,
      x: -80 + rnd() * 160,
      dir: rnd() > 0.5 ? 1 : -1,
      bobbing: rnd() * TAU
    };
    return g;
  };

  World.prototype.buildVehicles = function () {
    this.flyers = [];
    for (let i = 0; i < 7; i++) {
      const f = this._makeFlyer(i);
      f.position.set(-60 + i * 20, 0, 0);
      // two low patrol lanes cut through the canyon, visible from street level
      if (i === 0) { f.userData.y = 8.8; f.userData.z = -28; f.userData.speed = 6.5; }
      if (i === 1) { f.userData.y = 11.5; f.userData.z = -55; f.userData.speed = 5.0; }
      if (i === 2) { f.userData.y = 14.0; f.userData.z = 8; f.userData.speed = 7.0; }
      this.flyers.push(f);
      this.scene.add(f);
    }
    // one sentinel patrol car hangs almost still above the crossing
    const sentinel = this._makeFlyer(99);
    sentinel.userData.y = 9.4;
    sentinel.userData.z = -34;
    sentinel.userData.x = 2.2;
    sentinel.userData.speed = 0.08;
    sentinel.userData.dir = 1;
    this.scene.add(sentinel);
    this.flyers.push(sentinel);
  };

  /* ---------------------------------------------------------------------
     Holographic koi and water rings.
     --------------------------------------------------------------------- */
  World.prototype.buildHologram = function () {
    const holoMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0x064c5a) },
        uColorB: { value: new THREE.Color(0x4d072d) }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vPos;
        void main() {
          vec3 n = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = n;
          vView = -normalize(mv.xyz);
          vPos = position;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColorA, uColorB;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vPos;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.3);
          float scan = smoothstep(0.25, 0.72, sin(vPos.x * 18.0 - uTime * 6.0) * 0.5 + 0.5);
          vec3 col = mix(uColorB, uColorA, fres) * (0.24 + 0.62 * fres + 0.14 * scan);
          float alpha = 0.015 + 0.20 * pow(fres, 1.25) + 0.02 * scan;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.holoMat = holoMat;

    const orbit = new THREE.Group();
    orbit.position.set(0, 6.0, -61.5);
    const koi = new THREE.Group();
    koi.position.set(8.7, 0, 0);
    koi.rotation.y = -Math.PI / 2;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 4.0, 5, 12), holoMat);
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 0.86, 0.48);
    koi.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.53, 12, 9), holoMat);
    head.position.x = 2.35;
    head.scale.set(1.12, 0.86, 0.54);
    koi.add(head);
    const tailA = new THREE.Mesh(new THREE.ConeGeometry(0.74, 2.5, 3, 1, true), holoMat);
    tailA.position.x = -3.55;
    tailA.rotation.z = Math.PI / 2;
    tailA.rotation.y = 0.35;
    tailA.scale.z = 0.4;
    koi.add(tailA);
    const tailB = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.3, 3, 1, true), holoMat);
    tailB.position.x = -3.4;
    tailB.rotation.z = Math.PI / 2;
    tailB.rotation.y = -0.35;
    tailB.scale.z = 0.35;
    koi.add(tailB);
    const finA = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), holoMat);
    finA.position.set(-0.2, -0.45, 0);
    finA.rotation.set(0.7, 0, -0.4);
    koi.add(finA);
    const finB = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), holoMat);
    finB.position.set(-0.4, 0.5, 0);
    finB.rotation.set(-0.6, 0, 0.4);
    koi.add(finB);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b9f, toneMapped: false }));
    eye.position.set(2.45, 0.12, 0.3);
    koi.add(eye);

    // thin digital wireframe over the solid body
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x6df4ff, wireframe: true, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false });
    const wire = new THREE.Mesh(body.geometry, wireMat);
    wire.rotation.copy(body.rotation);
    wire.scale.copy(body.scale).multiplyScalar(1.006);
    koi.add(wire);
    const wireHead = new THREE.Mesh(head.geometry, wireMat);
    wireHead.position.copy(head.position);
    wireHead.scale.copy(head.scale).multiplyScalar(1.01);
    koi.add(wireHead);
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 5.3, 4), wireMat);
    spine.rotation.z = Math.PI / 2;
    koi.add(spine);

    orbit.add(koi);
    koi.visible = false;
    const koiCanvas = ND.Tex.holoKoi();
    const koiTex = ND.Tex.canvasToTexture(koiCanvas, true);
    const koiSpriteMat = new THREE.SpriteMaterial({
      map: koiTex, color: 0xffffff, transparent: true, opacity: 0.68,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const koiSprite = new THREE.Sprite(koiSpriteMat);
    koiSprite.position.set(7.3, 0, 0);
    koiSprite.scale.set(6.0, 3.0, 1);
    orbit.add(koiSprite);
    this.koiSprite = koiSprite;
    this.koi = koi;
    this.koiOrbit = orbit;
    this.scene.add(orbit);

    // water rings and a shimmering trail
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2bb8cc).multiplyScalar(0.95), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.waterRings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2 + i * 1.4, 0.014, 4, 80), ringMat.clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.30 + i * 0.008, -61.5);
      ring.material.opacity = 0.11 - i * 0.025;
      this.waterRings.push(ring);
      this.scene.add(ring);
    }

    const sparkGeo = new THREE.BufferGeometry();
    const n = 90;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const rnd = ND.util.mulberry32(5501);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = 8.7 + (rnd() - 0.5) * 4;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * 0.7 + rnd() * 1.8;
      pos[i * 3 + 2] = Math.sin(a) * r * 0.35;
      const c = rnd() > 0.5 ? [0.2, 0.9, 1.0] : [1.0, 0.2, 0.65];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.koiSparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.07, map: this._glowTex, vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.koiSparks);
  };

  World.prototype.updateActors = function (dt, time) {
    this.updateFountain(dt, time);
    // citizens
    for (const p of this.pedestrians) {
      const u = p.userData;
      p.position.z += u.speed * u.dir * dt;
      if (p.position.z > 48) { p.position.z = -78; }
      if (p.position.z < -78) { p.position.z = 48; }
      p.position.y = (Math.abs(p.position.x) > 9.5 ? 0.17 : 0.03) + Math.sin(time * 1.9 + u.phase) * 0.012;
      p.rotation.y = u.dir > 0 ? 0.1 : Math.PI - 0.1;
      u.legs[0].rotation.x = Math.sin(time * 5.2 + u.phase) * 0.38 * Math.min(1, u.speed);
      u.legs[1].rotation.x = -Math.sin(time * 5.2 + u.phase) * 0.38 * Math.min(1, u.speed);
      u.umbrella.rotation.z = Math.sin(time * 1.3 + u.phase) * 0.075;
      u.umbrella.rotation.x = Math.sin(time * 0.9 + u.phase) * 0.045;
      u.arms[0].rotation.x = Math.sin(time * 5.2 + u.phase) * 0.26;
      u.arms[1].rotation.x = -Math.sin(time * 5.2 + u.phase) * 0.26;
      u.hem.rotation.z = Math.sin(time * 1.7 + u.phase) * 0.018;
    }
    // traffic
    for (const f of this.flyers) {
      const u = f.userData;
      u.x += u.speed * u.dir * dt;
      if (u.x > 82) u.x = -82;
      if (u.x < -82) u.x = 82;
      f.position.set(u.x, u.y + Math.sin(time * 0.55 + u.bobbing) * 0.3, u.z);
      f.rotation.z = Math.sin(time * 0.4 + u.bobbing) * 0.035;
      f.rotation.y = u.dir > 0 ? 0 : Math.PI;
    }
    // koi
    if (this.koiOrbit) {
      this.koiOrbit.rotation.y = time * 0.19;
      this.koi.position.y = Math.sin(time * 0.8) * 0.55;
      this.koi.rotation.z = Math.sin(time * 1.1) * 0.08;
      this.koi.rotation.y = -Math.PI / 2 + Math.sin(time * 0.9) * 0.18;
      if (this.koiSprite) {
        this.koiSprite.material.opacity = 0.58 + 0.10 * Math.sin(time * 2.1);
        const pulse = 1 + Math.sin(time * 1.7) * 0.018;
        this.koiSprite.scale.set(6.0 * pulse, 3.0 * pulse, 1);
        this.koiSprite.position.y = Math.sin(time * 0.8) * 0.55;
      }
      this.holoMat.uniforms.uTime.value = time;
      this.koiSparks.rotation.y = -time * 0.19;
      this.koiSparks.position.y = Math.sin(time * 0.8) * 0.55;
      for (let i = 0; i < this.waterRings.length; i++) {
        const r = this.waterRings[i];
        r.rotation.z = time * (0.08 + i * 0.03);
        r.material.opacity = (0.10 - i * 0.022) * (0.7 + 0.3 * Math.sin(time * 1.4 + i));
      }
    }
    // steam
    if (this.steam) {
      const arr = this.steam.geometry.attributes.position.array;
      const alpha = this.steam.geometry.attributes.aAlpha.array;
      const size = this.steam.geometry.attributes.aSize.array;
      for (let i = 0; i < this._steam.length; i++) {
        const p = this._steam[i];
        p.life += dt / p.max;
        if (p.life > 1) {
          p.life = 0;
          p.x = p.vent.x + (Math.random() - 0.5) * 1.1;
          p.y = p.vent.y;
          p.z = p.vent.z + (Math.random() - 0.5) * 1.1;
          p.vx = (Math.random() - 0.5) * 0.3 + p.vent.dir * 0.18;
          p.vy = 0.3 + Math.random() * 0.6;
          p.vz = (Math.random() - 0.5) * 0.3;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
        alpha[i] = Math.sin(p.life * Math.PI) * 0.14;
        size[i] = p.size * (0.6 + p.life * 2.0);
      }
      this.steam.geometry.attributes.position.needsUpdate = true;
      this.steam.geometry.attributes.aAlpha.needsUpdate = true;
      this.steam.geometry.attributes.aSize.needsUpdate = true;
    }
  };
})();
