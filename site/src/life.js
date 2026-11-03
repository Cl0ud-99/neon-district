/* =========================================================================
   NEON DISTRICT — small life: rain impacts, awning drips, sign stutter,
   metro pulses, flyer strobes and the cat that owns the cyber pawn shop.
   ========================================================================= */
(function () {
  'use strict';
  const ND = window.ND;
  const World = ND.World;
  const TAU = Math.PI * 2;

  const _dummy = new THREE.Object3D();
  const _color = new THREE.Color();
  const _v = new THREE.Vector3();

  World.prototype.emitLife = function (type, data) {
    if (!this.onLifeEvent) return;
    const ev = data || {};
    ev.type = type;
    this.onLifeEvent(ev);
  };

  World.prototype.buildLife = function () {
    this._lifeRnd = ND.util.mulberry32(20250308);
    this._splashCursor = 0;
    this._splashAccum = 0;
    this._dripAccum = 0;
    this._lifeClock = 0;

    // ---- expanding rain-impact rings -------------------------------------
    const splashCount = 120;
    const sgeo = new THREE.RingGeometry(0.55, 0.9, 12, 1);
    sgeo.rotateX(-Math.PI / 2);
    const smat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    });
    const smesh = new THREE.InstancedMesh(sgeo, smat, splashCount);
    smesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smesh.frustumCulled = false;
    smesh.renderOrder = 3;
    this._splashes = [];
    for (let i = 0; i < splashCount; i++) {
      this._splashes.push({ active: false, life: 0, max: 1, x: 0, y: -100, z: 0, size: 0.1, r: 1, g: 1, b: 1 });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      smesh.setMatrixAt(i, _dummy.matrix);
      smesh.setColorAt(i, _color.setRGB(0, 0, 0));
    }
    smesh.instanceMatrix.needsUpdate = true;
    if (smesh.instanceColor) smesh.instanceColor.needsUpdate = true;
    this.splashMesh = smesh;
    this.scene.add(smesh);

    // ---- slow drips from awnings and sign brackets ------------------------
    const dripCount = 72;
    const dgeo = new THREE.BufferGeometry();
    const dpos = new Float32Array(dripCount * 3);
    const dalpha = new Float32Array(dripCount);
    const dsize = new Float32Array(dripCount);
    for (let i = 0; i < dripCount; i++) {
      dpos[i * 3 + 1] = -100;
      dalpha[i] = 0;
      dsize[i] = 0.05;
    }
    dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    dgeo.setAttribute('aAlpha', new THREE.BufferAttribute(dalpha, 1));
    dgeo.setAttribute('aSize', new THREE.BufferAttribute(dsize, 1));
    const dmat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this._glowTex }, uColor: { value: new THREE.Color(0.52, 0.78, 0.92) } },
      vertexShader: `
        attribute float aAlpha, aSize;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (210.0 / max(1.0, -mv.z)), 1.0, 18.0);
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
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor * (0.7 + 0.6 * t.r), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.dripPoints = new THREE.Points(dgeo, dmat);
    this.dripPoints.frustumCulled = false;
    this.dripPoints.renderOrder = 8;
    this.scene.add(this.dripPoints);
    this._drips = [];
    for (let i = 0; i < dripCount; i++) {
      this._drips.push({ active: false, x: 0, y: -100, z: 0, vy: -6, size: 0.05 });
    }
    this._dripCursor = 0;

    // ---- metro entrance activity lights ----------------------------------
    const mLights = [];
    for (let i = 0; i < 7; i++) {
      const mMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2bd9ff).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.8 });
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.32), mMat);
      bulb.position.set(-11.35, 2.42, 73.5 + i * 0.82);
      this.scene.add(bulb);
      mLights.push(mMat);
    }
    this.metroLights = mLights;

    // ---- the alley cat at the cyber pawn shop ---------------------------
    this.buildAlleyCat();
  };

  World.prototype.buildAlleyCat = function () {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.5, metalness: 0.12 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur);
    body.scale.set(1.75, 0.8, 0.78);
    body.position.y = 0.24;
    g.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), fur);
    chest.position.set(-0.20, 0.29, 0);
    chest.scale.set(0.9, 1.0, 0.86);
    g.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 11, 9), fur);
    head.position.set(-0.36, 0.37, 0);
    head.scale.set(1.05, 0.94, 0.92);
    g.add(head);
    for (const sz of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.1, 4), fur);
      ear.position.set(-0.39, 0.47, sz * 0.07);
      ear.rotation.z = sz * 0.12;
      g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8dffbb).multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 1 }));
      eye.position.set(-0.46, 0.39, sz * 0.052);
      g.add(eye);
      this.catEyeMats = this.catEyeMats || [];
      this.catEyeMats.push(eye.material);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 5), fur);
        leg.position.set(sx * 0.16, 0.08, sz * 0.075);
        g.add(leg);
      }
    }
    const tail = new THREE.Group();
    tail.position.set(0.27, 0.3, 0);
    let parent = tail;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.022 - i * 0.004, 0.026 - i * 0.004, 0.18, 5), fur);
      seg.position.y = 0.09;
      seg.rotation.z = -0.55 - i * 0.18;
      const pivot = new THREE.Group();
      pivot.position.y = i === 0 ? 0 : 0.15;
      pivot.add(seg);
      parent.add(pivot);
      parent = pivot;
    }
    g.add(tail);
    this.catTail = tail;
    // thin red collar catches the shop light and keeps the silhouette readable
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.009, 4, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3b6b).multiplyScalar(1.25), toneMapped: false }));
    collar.rotation.y = Math.PI / 2;
    collar.position.set(-0.27, 0.36, 0);
    g.add(collar);
    g.position.set(12.24, 0.17, -4.55);
    g.rotation.y = 0.08;
    this.scene.add(g);
    const shadow = this.addContactShadow(this.scene, 0.8, 0.5, 0.5, 0.013);
    shadow.position.set(12.24, 0.013, -4.55);
    this.cat = g;
  };

  World.prototype.spawnSplash = function (x, y, z, size, max, color) {
    if (!this._splashes) return;
    const s = this._splashes[this._splashCursor++ % this._splashes.length];
    s.active = true;
    s.life = 0;
    s.max = max || 0.6;
    s.x = x; s.y = y; s.z = z;
    s.size = size || 0.1;
    const c = color || [0.58, 0.78, 0.92];
    s.r = c[0]; s.g = c[1]; s.b = c[2];
  };

  World.prototype.updateSplashes = function (dt) {
    const mesh = this.splashMesh;
    if (!mesh) return;
    let dirty = false;
    for (let i = 0; i < this._splashes.length; i++) {
      const s = this._splashes[i];
      if (!s.active) continue;
      s.life += dt;
      const t = s.life / s.max;
      if (t >= 1) {
        s.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
        mesh.setColorAt(i, _color.setRGB(0, 0, 0));
        dirty = true;
        continue;
      }
      const sc = s.size * (0.4 + t * 2.7);
      _dummy.position.set(s.x, s.y + 0.012, s.z);
      _dummy.scale.set(sc, 1, sc);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      const fade = (1 - t) * (0.55 + 0.45 * (1 - t));
      mesh.setColorAt(i, _color.setRGB(s.r * fade, s.g * fade, s.b * fade));
      dirty = true;
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  World.prototype._spawnRainSplashes = function (dt, camera) {
    if (!camera) return;
    this._splashAccum += dt * 48;
    let guard = 0;
    while (this._splashAccum >= 1 && guard++ < 4) {
      this._splashAccum -= 1;
      const a = this._lifeRnd() * TAU;
      const r = 1.8 + this._lifeRnd() * 14.5;
      const x = camera.position.x + Math.cos(a) * r;
      const z = camera.position.z + Math.sin(a) * r;
      if (Math.abs(x) > 13.2 || z > 188.5 || z < -79.5) continue;
      const y = Math.abs(x) > 9.5 ? 0.177 : 0.012;
      this.spawnSplash(x, y, z, 0.075 + this._lifeRnd() * 0.16, 0.42 + this._lifeRnd() * 0.42, [0.72, 0.9, 1.0]);
    }
  };

  World.prototype._spawnDrip = function (x, y, z) {
    if (!this._drips) return;
    const d = this._drips[this._dripCursor++ % this._drips.length];
    d.active = true;
    d.x = x + (this._lifeRnd() - 0.5) * 0.06;
    d.y = y;
    d.z = z;
    d.vy = -(4.2 + this._lifeRnd() * 2.8);
    d.size = 0.035 + this._lifeRnd() * 0.035;
  };

  World.prototype._updateDrips = function (dt, camera) {
    if (!this._drips) return;
    this._dripAccum += dt * 16;
    let guard = 0;
    while (this._dripAccum >= 1 && guard++ < 3 && camera) {
      this._dripAccum -= 1;
      const spots = this.dripSpots || [];
      if (!spots.length) break;
      const near = [];
      for (const s of spots) {
        if (Math.abs(s.z - camera.position.z) < 26) near.push(s);
      }
      if (!near.length) continue;
      const spot = near[Math.floor(this._lifeRnd() * near.length)];
      this._spawnDrip(spot.x, spot.y, spot.z);
    }
    const pos = this.dripPoints.geometry.attributes.position.array;
    const alpha = this.dripPoints.geometry.attributes.aAlpha.array;
    const size = this.dripPoints.geometry.attributes.aSize.array;
    for (let i = 0; i < this._drips.length; i++) {
      const d = this._drips[i];
      if (!d.active) {
        alpha[i] = 0;
        pos[i * 3 + 1] = -100;
        continue;
      }
      d.y += d.vy * dt;
      d.vy -= 2.0 * dt;
      const ground = Math.abs(d.x) > 9.5 ? 0.177 : 0.012;
      if (d.y <= ground + 0.02) {
        if (camera && Math.abs(d.z - camera.position.z) < 30) {
          this.spawnSplash(d.x, ground, d.z, 0.045 + this._lifeRnd() * 0.055, 0.35 + this._lifeRnd() * 0.25, [0.45, 0.68, 0.86]);
        }
        d.active = false;
        alpha[i] = 0;
        pos[i * 3 + 1] = -100;
        continue;
      }
      pos[i * 3] = d.x;
      pos[i * 3 + 1] = d.y;
      pos[i * 3 + 2] = d.z;
      alpha[i] = 0.55;
      size[i] = d.size;
    }
    this.dripPoints.geometry.attributes.position.needsUpdate = true;
    this.dripPoints.geometry.attributes.aAlpha.needsUpdate = true;
    this.dripPoints.geometry.attributes.aSize.needsUpdate = true;
  };

  World.prototype.updateLife = function (dt, time) {
    const camera = this.activeCamera;
    this._spawnRainSplashes(dt, camera);
    this._updateDrips(dt, camera);
    this.updateSplashes(dt);

    // irregular practical-sign stutter, never a global sine loop
    for (const s of this.lifeSigns || []) {
      if (s.flicker <= 0 && time > s.next) {
        s.flicker = 0.14 + this._lifeRnd() * 0.5;
        s.seed = this._lifeRnd() * 100;
        s.next = time + 4.0 + this._lifeRnd() * 11.0;
        this.emitLife('neon', { x: s.x, z: s.z, side: s.side });
      }
      let k;
      if (s.flicker > 0) {
        s.flicker -= dt;
        const n = Math.sin(time * 67 + s.seed) * Math.sin(time * 39 + s.seed * 1.7);
        k = n > -0.12 ? 0.1 : 1.0;
      } else {
        k = 0.97 + 0.03 * Math.sin(time * 1.55 + (s.phase || 0));
      }
      s.mat.color.setScalar(s.base * k);
    }

    // vending-machine ballasts
    for (const v of this.vendingMats || []) {
      if (v.flicker <= 0 && time > v.next) {
        v.flicker = 0.08 + this._lifeRnd() * 0.22;
        v.next = time + 5 + this._lifeRnd() * 14;
      }
      let k = 0.96 + 0.04 * Math.sin(time * 2.1 + v.phase);
      if (v.flicker > 0) {
        v.flicker -= dt;
        k = Math.sin(time * 88 + v.phase) > 0 ? 1.0 : 0.35;
      }
      v.mat.color.setScalar(v.base * k);
    }

    // barely-there cable sway on blade signage
    for (const s of this.lifeSways || []) {
      s.obj.rotation.z = Math.sin(time * 0.72 + s.phase) * s.amp;
    }

    // metro strip breathing, with a tiny chase
    for (let i = 0; i < (this.metroLights || []).length; i++) {
      const m = this.metroLights[i];
      const wave = Math.max(0, Math.sin(time * 2.2 - i * 0.55));
      m.opacity = 0.18 + 0.82 * wave;
      m.color.setRGB(0.12 + wave * 0.5, 0.55 + wave * 0.65, 0.75 + wave * 0.55);
    }

    // cat: tail flicks, head tracks the street, eyes blink
    if (this.cat) {
      const flick = Math.sin(time * 1.45) * 0.16 + (Math.sin(time * 0.23 + 1.7) > 0.94 ? Math.sin(time * 13) * 0.5 : 0);
      this.catTail.rotation.y = flick;
      this.catTail.rotation.z = 0.12 + Math.sin(time * 1.9) * 0.05;
      this.cat.rotation.y = 0.08 + Math.sin(time * 0.31) * 0.16;
      const blink = Math.sin(time * 0.83) > 0.985 ? 0.12 : 1;
      for (const m of this.catEyeMats || []) m.opacity = blink;
    }
  };
})();
