/* =========================================================================
   NEON DISTRICT — street furniture, water, lanterns and atmosphere
   ========================================================================= */
(function () {
  'use strict';
  const ND = window.ND;
  const World = ND.World;
  const TAU = Math.PI * 2;

  function rndRange(rnd, a, b) { return a + rnd() * (b - a); }

  World.prototype.addContactShadow = function (parent, width, depth, opacity, localY) {
    if (!this._contactShadowTex) {
      this._contactShadowTex = ND.Tex.canvasToTexture(ND.Tex.shadowBlob(128), false);
      this._contactShadowGeo = new THREE.PlaneGeometry(1, 1);
    }
    const mat = new THREE.MeshBasicMaterial({
      map: this._contactShadowTex,
      transparent: true,
      opacity: opacity == null ? 0.5 : opacity,
      color: 0x000000,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(this._contactShadowGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(width, depth, 1);
    mesh.position.y = localY == null ? 0.012 : localY;
    mesh.renderOrder = 2;
    parent.add(mesh);
    return mesh;
  };

  World.prototype.buildStreetDetails = function () {
    const rnd = ND.util.mulberry32(44031);
    const g = new THREE.Group();
    this.detailGroup = g;
    this.scene.add(g);

    // raised curbs, wet stone and gutter mouths
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x181720, roughness: 0.32, metalness: 0.42 });
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 360), curbMat);
      curb.position.set(side * 9.72, 0.12, 55);
      g.add(curb);
      const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 360), new THREE.MeshStandardMaterial({ color: 0x06070b, roughness: 0.18, metalness: 0.8 }));
      gutter.position.set(side * 9.4, 0.03, 55);
      g.add(gutter);
    }

    // street lamps with drooping cables and cold sodium heads
    const lampPositions = [
      [-10.7, 188], [10.8, 176], [-10.7, 158], [10.8, 145], [-10.7, 126], [10.8, 112],
      [-10.7, 92], [10.8, 78], [-10.7, 58], [10.8, 40],
      [-10.7, 32], [10.8, 20], [-10.7, 2], [10.8, -12], [-10.7, -30], [10.8, -44], [-10.7, -61]
    ];
    this.lampLights = [];
    for (let i = 0; i < lampPositions.length; i++) {
      const [x, z] = lampPositions[i];
      const grp = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.38, metalness: 0.8 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 6.6, 7), mat);
      pole.position.set(x, 3.3, z);
      grp.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.12), mat);
      arm.position.set(x + (x < 0 ? 1.0 : -1.0), 6.45, z);
      grp.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.35), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fefff).multiplyScalar(2.4), toneMapped: false }));
      head.position.set(x + (x < 0 ? 2.0 : -2.0), 6.36, z);
      grp.add(head);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex || (this._glowTex = ND.Tex.canvasToTexture(ND.Tex.glow(128))), color: 0x8feaff, transparent: true, opacity: 0.19, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(head.position);
      halo.scale.set(5.5, 2.6, 1);
      grp.add(halo);
      g.add(grp);
      this.addCollider({ type: 'circle', x, z, r: 0.2 });
    }

    // long black cables sagging across the canyon
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.75, metalness: 0.4 });
    const cableZs = [188, 178, 168, 158, 148, 138, 128, 118, 108, 98, 88, 78, 68, 58, 48, 36, 26, 14, 3, -9, -17, -31, -40, -53, -64, -73];
    for (let i = 0; i < cableZs.length; i++) {
      const z = cableZs[i];
      const y = 10 + rnd() * 8;
      const sag = 2.5 + rnd() * 3.5;
      const pts = [];
      for (let s = 0; s <= 10; s++) {
        const tt = s / 10;
        const x = -14 + tt * 28;
        const yy = y - Math.sin(tt * Math.PI) * sag + (rnd() - 0.5) * 0.15;
        pts.push(new THREE.Vector3(x, yy, z + (rnd() - 0.5) * 1.2));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018 + rnd() * 0.025, 3, false), cableMat);
      g.add(tube);
      if (i % 3 === 0) {
        // dangling service light
        const lx = -10 + rnd() * 20;
        const ly = y - Math.sin((lx + 14) / 28 * Math.PI) * sag;
        const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5 + rnd() * 2.2, 3), cableMat);
        drop.position.set(lx, ly - 1.4, z);
        g.add(drop);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffb968, toneMapped: false }));
        bulb.position.set(lx, ly - (2.15 + rnd() * 1.5), z);
        g.add(bulb);
      }
    }

    // festival lanterns strung across the lower street
    this.lanternGroups = [];
    const lanternColors = [0xff4b45, 0xffa844, 0xff4f8d];
    for (const z of [188, 172, 156, 140, 124, 108, 92, 76, 60, 39, 18, -4, -27, -51]) {
      const grp = new THREE.Group();
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector3(-13.5 + t * 27, 9.2 - Math.sin(t * Math.PI) * 1.1, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.014, 3, false), cableMat);
      grp.add(wire);
      for (let i = 1; i < 12; i++) {
        if (i % 2 === 0) continue;
        const t = i / 12;
        const p = curve.getPoint(t);
        const col = lanternColors[(i + Math.floor(Math.abs(z))) % lanternColors.length];
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.9), toneMapped: false });
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), mat);
        lantern.scale.y = 1.25;
        lantern.position.set(p.x, p.y - 0.4, p.z);
        grp.add(lantern);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.06, 8), new THREE.MeshStandardMaterial({ color: 0x1c0e10, roughness: 0.5, metalness: 0.4 }));
        cap.position.set(p.x, p.y - 0.07, p.z);
        grp.add(cap);
      }
      grp.userData.phase = z * 0.11;
      this.lanternGroups.push(grp);
      g.add(grp);
    }

    // vending machines, reeking of cold fluorescent light
    const vendingSpots = [
      [-11.9, 184, -0.1], [11.9, 170, 0.1], [-11.9, 156, -0.1], [11.9, 142, 0.1],
      [-11.9, 126, -0.1], [11.9, 112, 0.1], [-11.9, 96, -0.1], [11.9, 82, 0.1],
      [-11.9, 66, -0.1], [11.9, 52, 0.1],
      [-11.9, 21, -0.1], [11.9, 15, 0.1], [-11.9, -22, -0.1], [11.9, -38, 0.1], [-11.9, -57, -0.1]
    ];
    for (let i = 0; i < vendingSpots.length; i++) {
      const [x, z, rot] = vendingSpots[i];
      const tex = this._vendingTexture(i);
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.45, 1.45, 1.45) });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.0, 0.76), new THREE.MeshStandardMaterial({ color: 0x121620, roughness: 0.28, metalness: 0.55 }));
      body.position.set(x, 1.16, z);
      body.rotation.y = rot;
      g.add(body);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.64), mat);
      face.position.set(x - Math.sign(x) * 0.395, 1.17, z);
      face.rotation.y = Math.sign(x) > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(face);
      const contact = this.addContactShadow(g, 1.65, 1.1, 0.38, 0.012);
      contact.position.x = x; contact.position.z = z;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: i % 2 ? 0xff53ac : 0x55e9ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(x - Math.sign(x) * 0.55, 1.2, z);
      glow.scale.set(3.8, 3.1, 1);
      g.add(glow);
      this.addCollider({ type: 'box', x, z, hx: 0.68, hz: 0.45 });
    }

    // stacked crates, bins and gas canisters
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x17182a, roughness: 0.62, metalness: 0.35 });
    const crateGeo = new THREE.BoxGeometry(1, 1, 1);
    const crates = new THREE.InstancedMesh(crateGeo, crateMat, 150);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 150; i++) {
      const side = rnd() > 0.5 ? 1 : -1;
      const x = side * (10.2 + rnd() * 3.1);
      const z = -75 + rnd() * 260;
      const s = 0.3 + rnd() * 0.75;
      const sy = s * (0.5 + rnd());
      const sz = s * (0.6 + rnd() * 0.9);
      dummy.position.set(x, s * 0.5 + (rnd() > 0.75 ? s : 0), z);
      dummy.rotation.set(0, rnd() * TAU, 0);
      dummy.scale.set(s, sy, sz);
      dummy.updateMatrix();
      crates.setMatrixAt(i, dummy.matrix);
      this.addCollider({ type: 'box', x, z, hx: s * 0.5, hz: sz * 0.5 });
    }
    crates.instanceMatrix.needsUpdate = true;
    g.add(crates);

    // a tiny ramen stall tucked against the west wall
    const stall = new THREE.Group();
    const stallBody = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.5, 4.2), new THREE.MeshStandardMaterial({ color: 0x1a1112, roughness: 0.62, metalness: 0.2 }));
    stallBody.position.set(-11.1, 1.35, 18.0);
    stall.add(stallBody);
    const norenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb61728).multiplyScalar(1.7), toneMapped: false, side: THREE.DoubleSide });
    const noren = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), norenMat);
    noren.position.set(-9.26, 2.15, 18.0);
    noren.rotation.y = Math.PI / 2;
    stall.add(noren);
    const stallLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: 0xffa64f, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    stallLight.position.set(-9.1, 2.1, 18.0);
    stallLight.scale.set(6.5, 4.5, 1);
    stall.add(stallLight);
    this.stall = stall;
    g.add(stall);
    this.addCollider({ type: 'box', x: -11.1, z: 18.0, hx: 1.9, hz: 2.2 });
    const stallShadow = this.addContactShadow(g, 4.6, 3.6, 0.38, 0.012);
    stallShadow.position.x = -11.1;
    stallShadow.position.z = 18.0;
    const stallGlow = new THREE.PointLight(0xff8a3a, 38, 10, 2);
    stallGlow.position.set(-10.2, 2.1, 18.0);
    this.scene.add(stallGlow);

    // floating holographic wayfinding near the plaza
    const arrowTex = this._wayfindingTexture();
    const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), arrowMat);
    arrow.position.set(6.8, 4.8, -68);
    arrow.rotation.y = -0.2;
    g.add(arrow);
    this.wayfinding = arrow;

    this._addStorefronts(g);
    this._addBladeSigns(g);
    this._addHoverbike(g);
    this._addParkedTraffic(g);
    this.buildRearDistrict(g);
  };

  /* ---------------------------------------------------------------------
     Rear district: the doubled street behind the starting camera.
     Landmarks are deliberately authored, while the surrounding blocks keep
     the procedural rhythm of the original street.
     --------------------------------------------------------------------- */
  World.prototype._verticalSignTexture = function (text, sub, a, b) {
    const w = 512, h = 2048;
    const c = ND.util.makeCanvas(w, h);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(22,6,18,.96)');
    g.addColorStop(0.45, 'rgba(6,7,13,.98)');
    g.addColorStop(1, 'rgba(15,5,22,.96)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = a; x.lineWidth = 4; x.shadowColor = a; x.shadowBlur = 24;
    x.strokeRect(18, 18, w - 36, h - 36);
    x.strokeStyle = b; x.globalAlpha = 0.6; x.lineWidth = 1.5;
    x.strokeRect(34, 34, w - 68, h - 68);
    x.globalAlpha = 1;
    const chars = Array.from(text);
    const step = (h - 260) / Math.max(1, chars.length);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 220px "Yu Gothic","Microsoft YaHei",serif';
    for (let i = 0; i < chars.length; i++) {
      const y = 150 + step * (i + 0.5);
      x.shadowColor = i % 2 ? b : a; x.shadowBlur = 26;
      x.fillStyle = '#fff7fd';
      x.fillText(chars[i], w / 2, y);
      x.shadowBlur = 0;
      x.fillStyle = i % 2 ? b : a;
      x.globalAlpha = 0.18; x.fillRect(64, y + step * 0.38, w - 128, 2); x.globalAlpha = 1;
    }
    x.font = '400 34px "Bahnschrift","Arial Narrow",sans-serif';
    x.fillStyle = b; x.shadowColor = b; x.shadowBlur = 12;
    x.fillText(sub, w / 2, h - 96);
    x.font = '400 22px "Bahnschrift",sans-serif';
    x.fillStyle = 'rgba(235,245,255,.55)'; x.shadowBlur = 0;
    x.fillText('NEO-KOWLOON / 2099', w / 2, h - 52);
    ND.util.noiseLayer(x, w, h, 881, 10, true);
    return ND.Tex.canvasToTexture(c);
  };

  World.prototype._neonStrip = function (parent, x, y, z, w, h, d, color) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.0), toneMapped: false })
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  World.prototype.buildRearDistrict = function (g) {
    const rnd = ND.util.mulberry32(62017);
    const metal = this.metalMat;
    const glowTex = this._glowTex || (this._glowTex = ND.Tex.canvasToTexture(ND.Tex.glow(128)));
    const addGlow = (x, y, z, color, sx, sy, opacity) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: opacity == null ? 0.14 : opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(x, y, z); s.scale.set(sx, sy, 1); g.add(s);
      return s;
    };

    // ---- 1. rear gate / paifang at z=180 -------------------------------
    const gateZ = 180;
    const neonA = 0xff2d8e, neonB = 0x55ecff;
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 15.5, 2.7), metal);
      pillar.position.set(side * 12.7, 7.75, gateZ);
      g.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 3.5), this.roofMat);
      cap.position.set(side * 12.7, 15.55, gateZ);
      g.add(cap);
      this._neonStrip(g, side * 11.35, 8.0, gateZ - 0.02, 0.08, 13.2, 0.08, side < 0 ? neonA : neonB);
      this._neonStrip(g, side * 12.7, 12.8, gateZ - 1.38, 2.1, 0.08, 0.07, side < 0 ? neonB : neonA);
      const contact = this.addContactShadow(g, 3.4, 3.4, 0.4, 0.014);
      contact.position.set(side * 12.7, 0.014, gateZ);
      for (let i = 0; i < 3; i++) {
        const lan = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? neonB : neonA).multiplyScalar(1.8), toneMapped: false }));
        lan.position.set(side * (10.8 + i * 0.45), 11.5 - i * 0.45, gateZ - 1.5);
        g.add(lan);
        addGlow(lan.position.x, lan.position.y, lan.position.z, i % 2 ? neonB : neonA, 2.2, 2.2, 0.18);
      }
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(27.5, 0.9, 2.3), metal);
    beam.position.set(0, 14.1, gateZ); g.add(beam);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(29.5, 0.3, 3.7), this.roofMat);
    roof.position.set(0, 14.85, gateZ); g.add(roof);
    for (const side of [-1, 1]) {
      const eave = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 4.1), this.roofMat);
      eave.position.set(side * 12.2, 15.15, gateZ);
      eave.rotation.z = side * -0.16;
      g.add(eave);
    }
    const gateTex = this.makeBannerTexture('九龍城寨', 'KOWLOON WALLED CITY', '#ff2d8e', '#5cecff');
    const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 2.8), new THREE.MeshBasicMaterial({ map: gateTex, toneMapped: false, color: new THREE.Color(1.45, 1.45, 1.45), side: THREE.DoubleSide }));
    gateSign.position.set(0, 10.6, gateZ - 1.65);
    gateSign.rotation.y = Math.PI;
    g.add(gateSign);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(12.4, 3.4, 0.25), this.billboardFrameMat);
    frame.position.set(0, 10.6, gateZ - 1.5); g.add(frame);
    addGlow(0, 10.6, gateZ - 2.0, neonA, 16, 5.5, 0.16);
    for (let i = -4; i <= 4; i++) {
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0xffb04d : 0xff345e).multiplyScalar(1.9), toneMapped: false }));
      lan.position.set(i * 2.4, 12.55 - Math.cos(i * 0.5) * 0.25, gateZ - 1.1);
      g.add(lan);
      addGlow(lan.position.x, lan.position.y, lan.position.z, i % 2 ? 0xffb04d : 0xff345e, 1.9, 1.9, 0.14);
    }

    // ---- 1b. a dense, non-walkable skyline behind the gate -------------
    const rearTowers = [
      { x: -30, z: 214, w: 17, d: 20, h: 54, tex: 0, a: 0xff6a3d, b: 0x5cecff },
      { x: -13, z: 226, w: 18, d: 18, h: 72, tex: 1, a: 0xff2d8e, b: 0x5cecff },
      { x: 8, z: 218, w: 18, d: 21, h: 60, tex: 2, a: 0x5cecff, b: 0xffb04d },
      { x: 29, z: 230, w: 16, d: 18, h: 46, tex: 3, a: 0xffb04d, b: 0xff2d8e },
      { x: 0, z: 238, w: 26, d: 24, h: 94, tex: 4, a: 0xffca4e, b: 0xff2d8e },
      { x: -22, z: 243, w: 14, d: 16, h: 38, tex: 5, a: 0x5cecff, b: 0xff2d8e },
      { x: 21, z: 242, w: 14, d: 17, h: 42, tex: 6, a: 0xff2d8e, b: 0x5cecff }
    ];
    const makeRearTower = (t) => {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x090b12, roughness: 0.8, metalness: 0.18 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), bodyMat);
      body.position.set(t.x, t.h / 2, t.z);
      g.add(body);
      const tex = new THREE.CanvasTexture(this.facadeCanvases[t.tex % this.facadeCanvases.length]);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(1, t.w / 13.5), Math.max(1, t.h / 30));
      tex.anisotropy = 4;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.80, 0.78, 0.86) }));
      face.position.set(t.x, t.h / 2, t.z - t.d / 2 - 0.03);
      face.rotation.y = Math.PI;
      g.add(face);
      this._neonStrip(g, t.x - t.w / 2 + 0.08, t.h * 0.58, t.z - t.d / 2 - 0.1, 0.07, t.h * 0.62, 0.07, t.a);
      this._neonStrip(g, t.x + t.w / 2 - 0.08, t.h * 0.48, t.z - t.d / 2 - 0.1, 0.07, t.h * 0.46, 0.07, t.b);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff334d, toneMapped: false }));
      beacon.position.set(t.x, t.h + 1.2, t.z);
      beacon.userData.blink = rnd() * TAU;
      g.add(beacon); this.dynamicGlow.push(beacon);
      return face;
    };
    rearTowers.forEach(makeRearTower);
    const rearTex = this.makeBannerTexture('九龍城寨', 'KOWLOON WALLED CITY', '#ffca4e', '#ff2d8e');
    const rearSign = new THREE.Mesh(new THREE.PlaneGeometry(18, 5.2), new THREE.MeshBasicMaterial({ map: rearTex, toneMapped: false, color: new THREE.Color(1.35, 1.35, 1.35), side: THREE.DoubleSide }));
    rearSign.position.set(0, 62, 225.8);
    rearSign.rotation.y = Math.PI;
    g.add(rearSign);
    addGlow(0, 62, 224.8, 0xffca4e, 28, 10, 0.11);

    // ---- 1c. elevated skybridge at z=164 -------------------------------
    const bridgeZ = 164;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(26.5, 1.45, 2.4), new THREE.MeshStandardMaterial({ color: 0x0c1119, roughness: 0.5, metalness: 0.6 }));
    bridge.position.set(0, 12.4, bridgeZ); g.add(bridge);
    for (const bz of [bridgeZ - 1.22, bridgeZ + 1.22]) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(25.4, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x14293a).multiplyScalar(0.55), toneMapped: false, side: THREE.DoubleSide }));
      glass.position.set(0, 12.4, bz); g.add(glass);
    }
    const bridgeNeonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5cecff).multiplyScalar(1.0), toneMapped: false });
    const bridgeNeon = new THREE.Mesh(new THREE.BoxGeometry(25.2, 0.035, 0.035), bridgeNeonMat);
    bridgeNeon.position.set(0, 11.68, bridgeZ - 1.24); g.add(bridgeNeon);
    for (let i = -8; i <= 8; i += 2) {
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.32), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 4 ? 0xffc07a : 0x7cefff).multiplyScalar(1.15), toneMapped: false }));
      lit.position.set(i, 12.4, bridgeZ - 1.23); lit.rotation.y = Math.PI; g.add(lit);
    }
    for (const sx of [-1, 1]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 7.6, 4), this.metalMat);
      cable.position.set(sx * 9.5, 15.2, bridgeZ); cable.rotation.z = sx * 0.7; g.add(cable);
    }
    const bridgeTex = this.makeBannerTexture('天橋', 'SKYWAY / SECTOR 08', '#5cecff', '#ff2d8e');
    const bridgeSign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.15), new THREE.MeshBasicMaterial({ map: bridgeTex, toneMapped: false, color: new THREE.Color(1.35, 1.35, 1.35), side: THREE.DoubleSide }));
    bridgeSign.position.set(0, 12.35, bridgeZ - 1.25); bridgeSign.rotation.y = Math.PI; g.add(bridgeSign);
    addGlow(0, 12.4, bridgeZ - 1.8, 0x5cecff, 10, 3.2, 0.08);

    // ---- 2. hotel vertical sign at z=152 --------------------------------
    const hotelZ = 152;
    const hotelTex = this._verticalSignTexture('夜雨旅館', 'NIGHT RAIN HOTEL', '#ff2d8e', '#5cecff');
    const hotelSign = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 11.5), new THREE.MeshBasicMaterial({ map: hotelTex, toneMapped: false, color: new THREE.Color(1.45, 1.45, 1.45), side: THREE.DoubleSide }));
    hotelSign.position.set(12.45, 14.5, hotelZ);
    hotelSign.rotation.y = -Math.PI / 2;
    g.add(hotelSign);
    for (const zz of [hotelZ - 1.6, hotelZ + 1.6]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 11.8, 0.09), metal);
      edge.position.set(12.55, 14.5, zz); g.add(edge);
    }
    const hotelCap = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 3.5), this.roofMat);
    hotelCap.position.set(12.55, 20.5, hotelZ); g.add(hotelCap);
    addGlow(11.9, 14.5, hotelZ, neonA, 7, 18, 0.12);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 5.2), this.bodyMat);
    canopy.position.set(12.8, 3.35, hotelZ); g.add(canopy);
    this._neonStrip(g, 12.2, 3.3, hotelZ, 0.05, 0.05, 4.6, neonA);
    for (const zz of [hotelZ - 1.6, hotelZ + 1.6]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a0b18).multiplyScalar(0.7), toneMapped: false }));
      door.position.set(13.35, 1.55, zz); door.rotation.y = -Math.PI / 2; g.add(door);
    }
    const hotelContact = this.addContactShadow(g, 4.5, 3.6, 0.35, 0.014);
    hotelContact.position.set(12.5, 0.014, hotelZ);
    addGlow(12.2, 4.2, hotelZ, 0xff9a4d, 7, 5, 0.15);

    // ---- 3. night market on the west sidewalk, z=112..132 --------------
    const marketZ = 122;
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.14, 21), new THREE.MeshStandardMaterial({ color: 0x14252a, roughness: 0.68, metalness: 0.24, side: THREE.DoubleSide }));
    tarp.position.set(-10.9, 3.55, marketZ); g.add(tarp);
    this._neonStrip(g, -8.52, 3.45, marketZ, 0.05, 0.06, 19.6, 0xffa04d);
    for (let i = 0; i < 6; i++) {
      const pz = 112 + i * 4;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.12), metal);
      pole.position.set(-8.7, 1.7, pz); g.add(pole);
    }
    const marketTex = this.makeBannerTexture('九龍夜市', 'NIGHT MARKET / 24H', '#ffa04d', '#ff2d8e');
    const marketSign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.55), new THREE.MeshBasicMaterial({ map: marketTex, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5), side: THREE.DoubleSide }));
    marketSign.position.set(-8.45, 4.55, marketZ); marketSign.rotation.y = Math.PI / 2; g.add(marketSign);
    addGlow(-8.1, 4.5, marketZ, 0xffa04d, 9, 3.2, 0.14);
    for (let i = 0; i < 4; i++) {
      const sz = 113.5 + i * 5.5;
      const stall = new THREE.Group();
      const counter = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.9, 2.2), new THREE.MeshStandardMaterial({ color: 0x2b1710, roughness: 0.65, metalness: 0.2 }));
      counter.position.set(-11.0, 0.62, sz); stall.add(counter);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 2.45), new THREE.MeshStandardMaterial({ color: 0x5d3320, roughness: 0.48, metalness: 0.3 }));
      top.position.set(-11.0, 1.08, sz); stall.add(top);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 2.5), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x1d4b4b : 0x5a1520, roughness: 0.5, metalness: 0.25 }));
      awning.position.set(-11.7, 2.3, sz); awning.rotation.z = 0.12; stall.add(awning);
      this._neonStrip(stall, -11.7, 2.28, sz, 0.05, 0.04, 2.1, i % 2 ? 0x53efff : 0xffb34d);
      g.add(stall);
      this.addCollider({ type: 'box', x: -11.0, z: sz, hx: 1.0, hz: 1.25 });
      addGlow(-10.8, 1.8, sz, i % 2 ? 0x53efff : 0xffb34d, 3.5, 2.4, 0.12);
      const contact = this.addContactShadow(g, 3.4, 2.7, 0.3, 0.012);
      contact.position.set(-11.0, 0.012, sz);
      for (let k = 0; k < 2; k++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.55), new THREE.MeshStandardMaterial({ color: 0x221820, roughness: 0.7, metalness: 0.2 }));
        crate.position.set(-12.0 + k * 0.65, 0.19, sz + 1.7);
        crate.rotation.y = rnd() * TAU; g.add(crate);
      }
    }
    for (let i = 0; i < 7; i++) {
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0xff5a4d : 0xffb34d).multiplyScalar(1.9), toneMapped: false }));
      lan.position.set(-8.8, 3.1 - Math.sin(i) * 0.2, 114 + i * 2.5);
      g.add(lan);
      addGlow(lan.position.x, lan.position.y, lan.position.z, i % 2 ? 0xff5a4d : 0xffb34d, 1.6, 1.6, 0.13);
    }

    // ---- 4. MTR entrance, west sidewalk at z=76 ------------------------
    const mtrZ = 76;
    const recess = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 5.4), new THREE.MeshBasicMaterial({ color: 0x02050a }));
    recess.rotation.x = -Math.PI / 2;
    recess.position.set(-11.35, 0.19, mtrZ); g.add(recess);
    for (let i = 0; i < 5; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 0.52), metal);
      step.position.set(-11.35, 0.18 - i * 0.025, mtrZ - 2.1 + i * 0.48); g.add(step);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.05, 0.07), metal);
        post.position.set(-11.35 + side * 1.75, 0.7, mtrZ - 2.2 + i * 1.4); g.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 5.3), metal);
      rail.position.set(-11.35 + side * 1.75, 1.2, mtrZ); g.add(rail);
    }
    const mtrCanopy = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.2, 6.1), new THREE.MeshStandardMaterial({ color: 0x0b1a22, roughness: 0.35, metalness: 0.7 }));
    mtrCanopy.position.set(-11.35, 3.25, mtrZ); g.add(mtrCanopy);
    this._neonStrip(g, -11.35, 3.18, mtrZ - 3.0, 4.4, 0.05, 0.05, 0x53efff);
    const mtrTex = this.makeBannerTexture('九龍站', 'MTR / KOWLOON STATION', '#53efff', '#ff2d8e');
    const mtrSign = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.25), new THREE.MeshBasicMaterial({ map: mtrTex, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5), side: THREE.DoubleSide }));
    mtrSign.position.set(-8.72, 3.9, mtrZ); mtrSign.rotation.y = Math.PI / 2; g.add(mtrSign);
    addGlow(-9.2, 2.4, mtrZ, 0x53efff, 7, 5, 0.15);
    this.addCollider({ type: 'box', x: -11.35, z: mtrZ, hx: 2.2, hz: 3.0 });

    // ---- 5. service alley alcove at z=104 ------------------------------
    const alleyZ = 104;
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 7.2), new THREE.MeshBasicMaterial({ color: 0x03050a, side: THREE.DoubleSide }));
    dark.position.set(-13.45, 3.6, alleyZ); dark.rotation.y = Math.PI / 2; g.add(dark);
    for (const dz of [-2.2, 2.2]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.4, 0.2), metal);
      edge.position.set(-13.25, 3.6, alleyZ + dz); g.add(edge);
    }
    const alleyTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 4.8), metal);
    alleyTop.position.set(-13.25, 7.2, alleyZ); g.add(alleyTop);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6.4, 6), this.rustMat);
    pipe.position.set(-13.0, 3.5, alleyZ - 1.8); g.add(pipe);
    this._neonStrip(g, -13.1, 5.8, alleyZ + 2.1, 0.05, 1.7, 0.05, 0xff345e);
    addGlow(-12.8, 3.0, alleyZ, 0xff345e, 4.5, 4.0, 0.12);

    // ---- 6. two landmark billboards ------------------------------------
    const bb1Tex = this.makeBannerTexture('舊城', 'OLD TOWN / SECTOR 08', '#ff6a3d', '#5cecff');
    const bb1 = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.6), new THREE.MeshBasicMaterial({ map: bb1Tex, toneMapped: false, color: new THREE.Color(1.55, 1.55, 1.55), side: THREE.DoubleSide }));
    bb1.position.set(-13.42, 9.5, 88); bb1.rotation.y = Math.PI / 2; g.add(bb1);
    addGlow(-12.8, 9.5, 88, 0xff6a3d, 10, 4.5, 0.12);
    const bb2Tex = this.makeBannerTexture('極樂', 'PARADISE / HOTEL', '#ff2d8e', '#ffb34d');
    const bb2 = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.5), new THREE.MeshBasicMaterial({ map: bb2Tex, toneMapped: false, color: new THREE.Color(1.55, 1.55, 1.55), side: THREE.DoubleSide }));
    bb2.position.set(13.42, 13.0, 166); bb2.rotation.y = -Math.PI / 2; g.add(bb2);
    addGlow(12.8, 13, 166, 0xff2d8e, 9, 4.2, 0.12);

    // ---- 7. cluttered rear sidewalks -----------------------------------
    const binMat = new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.5, metalness: 0.45 });
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.82, metalness: 0.08 });
    const spots = [[-11.6, 166], [11.2, 160], [-10.7, 146], [10.8, 136], [-11.9, 128], [11.4, 108], [-11.2, 96], [10.6, 86], [-11.0, 68], [11.5, 62]];
    for (let i = 0; i < spots.length; i++) {
      const x = spots[i][0], z = spots[i][1];
      if (i % 3 === 0) {
        const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.9, 8), binMat);
        bin.position.set(x, 0.62, z); bin.rotation.z = (rnd() - 0.5) * 0.15; g.add(bin);
        this.addCollider({ type: 'circle', x, z, r: 0.42 });
      } else {
        for (let k = 0; k < 3; k++) {
          const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22 + rnd() * 0.12, 7, 5), bagMat);
          bag.scale.y = 0.8; bag.position.set(x + (rnd() - 0.5) * 0.8, 0.2, z + (rnd() - 0.5) * 1.2); g.add(bag);
        }
      }
      this.addCollider({ type: 'circle', x, z, r: 0.55 });
      const contact = this.addContactShadow(g, 1.7, 1.7, 0.25, 0.012);
      contact.position.set(x, 0.012, z);
    }
    for (let i = 0; i < 5; i++) {
      const x = i % 2 ? 10.5 : -10.8;
      const z = 156 - i * 9;
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0x2a1b12, roughness: 0.9, metalness: 0.04 }));
      pallet.position.set(x, 0.2, z); pallet.rotation.y = rnd() * 0.4; g.add(pallet);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.65), new THREE.MeshStandardMaterial({ color: 0x1b2220, roughness: 0.78, metalness: 0.18 }));
      crate.position.set(x + 0.15, 0.48, z); crate.rotation.y = rnd() * 0.5; g.add(crate);
      this.addCollider({ type: 'box', x, z, hx: 0.72, hz: 0.55 });
    }
  };

  World.prototype._addHoverbike = function (g) {
    const root = new THREE.Group();
    root.position.set(8.6, 0.0, -17.5);
    root.rotation.y = -0.8;
    root.scale.setScalar(0.85);
    const dark = new THREE.MeshStandardMaterial({ color: 0x071018, roughness: 0.22, metalness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.45, 5, 10), dark);
    body.rotation.z = Math.PI / 2;
    body.rotation.y = 0.0;
    body.scale.set(1, 1.25, 0.7);
    body.position.y = 0.88;
    root.add(body);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.66), new THREE.MeshStandardMaterial({ color: 0x140b12, roughness: 0.52, metalness: 0.3 }));
    seat.position.set(-0.18, 1.16, 0);
    root.add(seat);
    for (const z of [-0.36, 0.36]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.075, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x32e9ff).multiplyScalar(1.35), toneMapped: false }));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0.72, 0.62, z);
      root.add(ring);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8), this.metalMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(0.72, 0.62, z);
      root.add(hub);
    }
    const frontRing = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.075, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d9d).multiplyScalar(1.3), toneMapped: false }));
    frontRing.rotation.y = Math.PI / 2;
    frontRing.position.set(-0.76, 0.62, 0);
    root.add(frontRing);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.66, 5), this.metalMat);
    stem.rotation.z = -0.5; stem.position.set(-0.85, 1.12, 0); root.add(stem);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.8), this.metalMat);
    bar.position.set(-1.02, 1.38, 0); root.add(bar);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(3.2), toneMapped: false }));
    light.position.set(-1.28, 0.95, 0); root.add(light);
    const under = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: 0x28e5ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    under.position.set(0, 0.36, 0); under.scale.set(4.4, 1.5, 1); root.add(under);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4), this.metalMat);
    pole.position.set(-0.2, 0.3, 0.34); pole.rotation.z = 0.15; root.add(pole);
    this.addContactShadow(root, 2.2, 1.2, 0.5, 0.02);
    this.addCollider({ type: 'box', x: 8.6, z: -17.5, hx: 1.1, hz: 1.2 });
    g.add(root);
    this.hoverbike = root;
  };

  World.prototype._storefrontTexture = function (variant) {
    const w = 768, h = 512;
    const c = ND.util.makeCanvas(w, h);
    const x = c.getContext('2d');
    const rnd = ND.util.mulberry32(7701 + variant * 917);
    const themes = [
      { a: '#2b0d07', b: '#160609', neon: '#ff9a48', name: '深夜食堂', sub: 'MIDNIGHT DINER' },
      { a: '#061b24', b: '#04090f', neon: '#3fe7ff', name: '義體診所', sub: 'CYBERWARE CLINIC' },
      { a: '#1b071e', b: '#08040d', neon: '#ff4fa8', name: '夜鷹酒吧', sub: 'NIGHT OWL BAR' },
      { a: '#081716', b: '#040907', neon: '#7be8d0', name: '九龍葯局', sub: 'KOWLOON PHARMACY' },
      { a: '#160b03', b: '#080508', neon: '#ffb34e', name: '拉麺一番', sub: 'RAMEN ICHIBAN' },
      { a: '#081308', b: '#030604', neon: '#66ffa9', name: '當舖', sub: 'PAWN & TRADE' }
    ];
    const t = themes[variant % themes.length];
    const bg = x.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, t.b); bg.addColorStop(1, '#020204');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);

    // sign band
    x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, w, 86);
    x.strokeStyle = t.neon; x.lineWidth = 3; x.shadowColor = t.neon; x.shadowBlur = 20;
    x.strokeRect(7, 7, w - 14, h - 14);
    x.font = '700 42px "Yu Gothic","Microsoft YaHei",sans-serif';
    x.fillStyle = '#fff7ee'; x.shadowColor = t.neon; x.shadowBlur = 22; x.fillText(t.name, 25, 58);
    x.font = '400 16px "Bahnschrift Condensed",sans-serif'; x.fillStyle = t.neon;
    x.fillText(t.sub, 460, 54);

    // glass interior
    const inner = x.createLinearGradient(0, 90, 0, h);
    inner.addColorStop(0, t.a); inner.addColorStop(0.55, 'rgba(10,8,10,.75)'); inner.addColorStop(1, 'rgba(2,2,4,.92)');
    x.fillStyle = inner; x.fillRect(22, 96, w - 44, h - 122);
    x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 2; x.strokeRect(22, 96, w - 44, h - 122);

    // interior light pools and shelves
    for (let i = 0; i < 3; i++) {
      const lg = x.createRadialGradient(150 + i * 240, 170, 0, 150 + i * 240, 170, 190);
      lg.addColorStop(0, 'rgba(255,185,105,.16)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = lg; x.fillRect(0, 90, w, h);
    }
    for (let row = 0; row < 2; row++) {
      const sy = 190 + row * 86;
      x.fillStyle = 'rgba(30,22,20,.8)'; x.fillRect(42, sy, w - 84, 8);
      for (let i = 0; i < 28; i++) {
        const bw = 7 + rnd() * 14, bh = 20 + rnd() * 30;
        x.fillStyle = 'hsla(' + (20 + rnd() * 180) + ',55%,45%,.55)';
        x.fillRect(48 + i * 24, sy - bh, bw, bh);
      }
    }
    // counter / silhouettes
    x.fillStyle = 'rgba(4,3,5,.85)'; x.fillRect(40, 360, w - 80, 82);
    for (let i = 0; i < 3; i++) {
      const px = 150 + i * 190 + rnd() * 40;
      x.fillStyle = 'rgba(3,2,4,.8)';
      x.beginPath(); x.arc(px, 326, 23, 0, TAU); x.fill();
      x.fillRect(px - 31, 346, 62, 55);
    }
    // neon menu strips
    x.fillStyle = t.neon; x.globalAlpha = 0.8; x.fillRect(48, 112, 4, 210); x.globalAlpha = 1;
    x.font = '400 14px "Bahnschrift",sans-serif'; x.fillStyle = 'rgba(255,255,255,.58)';
    for (let i = 0; i < 4; i++) x.fillText(['OPEN 24H', 'NO CREDITS', 'HOT FOOD', 'SECTOR 07'][i], 62, 128 + i * 25);
    // glass glare
    const glare = x.createLinearGradient(0, 0, w, h);
    glare.addColorStop(0, 'rgba(255,255,255,0)'); glare.addColorStop(0.42, 'rgba(255,255,255,.045)'); glare.addColorStop(0.48, 'rgba(255,255,255,.02)'); glare.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = glare; x.fillRect(0, 0, w, h);
    // grime
    x.fillStyle = 'rgba(0,0,0,.22)';
    for (let i = 0; i < 28; i++) x.fillRect(rnd() * w, h - 34, 1 + rnd() * 6, 10 + rnd() * 18);
    return ND.Tex.canvasToTexture(c);
  };

  World.prototype.addHeroFacade = function (b, group, rnd) {
    const side = b.side;
    const levels = [5.8, 10.2];
    const zOffsets = [-b.len * 0.22, b.len * 0.18];
    for (let row = 0; row < levels.length; row++) {
      for (let col = 0; col < zOffsets.length; col++) {
        const wy = levels[row] + (rnd() - 0.5) * 0.55;
        const wz = b.z + zOffsets[col] + (rnd() - 0.5) * 0.8;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 2.45, 2.08), this.metalMat);
        frame.position.set(side * 13.62, wy, wz);
        group.add(frame);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.82, 2.12), this.heroWindowMats[(row + col + Math.floor(b.z)) % this.heroWindowMats.length]);
        glass.position.set(side * 13.42, wy, wz);
        glass.rotation.y = -side * Math.PI / 2;
        group.add(glass);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.13, 2.34), this.metalMat);
        sill.position.set(side * 13.52, wy - 1.28, wz);
        group.add(sill);
      }
    }

    // One real fire escape per side gives the closest buildings a readable silhouette.
    this._heroFireEscapes = this._heroFireEscapes || {};
    if (!this._heroFireEscapes[side] && b.z > 28) {
      this._heroFireEscapes[side] = true;
      const fz = b.z - b.len * 0.09;
      const fe = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const py = 7.8 + i * 3.15;
        const platform = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.11, 2.75), this.metalMat);
        platform.position.set(side * 12.95, py, fz);
        fe.add(platform);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 2.75), this.metalMat);
        rail.position.set(side * 12.08, py + 0.9, fz);
        fe.add(rail);
        const endRail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.055, 0.055), this.metalMat);
        endRail.position.set(side * 12.95, py + 0.9, fz + 1.36);
        fe.add(endRail);
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.075, 3.4, 0.075), this.rustMat);
        ladder.position.set(side * 12.16, py + 1.55, fz + 1.22);
        ladder.rotation.x = 0.42;
        fe.add(ladder);
        if (i === 0) {
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffbb73, toneMapped: false }));
          bulb.position.set(side * 12.02, py + 1.78, fz - 0.8);
          fe.add(bulb);
        }
      }
      group.add(fe);
    }

    // Rooftop water tank on the closest block, visible in upward crane shots.
    if (b.z > 34 && !this._heroTank) {
      this._heroTank = true;
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.35, 3.3, 10), this.rustMat);
      tank.position.set(side * (13.8 + b.depth * 0.4), b.h + 2.0, b.z);
      group.add(tank);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.18, 10), this.roofMat);
      lid.position.set(tank.position.x, b.h + 3.7, b.z);
      group.add(lid);
    }
  };

  World.prototype._addParkedTraffic = function (g) {
    if (!this._glowTex) this._glowTex = ND.Tex.canvasToTexture(ND.Tex.glow(128));
    const glowTex = this._glowTex;
    const wheelGeo = new THREE.TorusGeometry(0.33, 0.105, 7, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x030407, roughness: 0.58, metalness: 0.4 });
    const metal = this.metalMat;
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x07111a, roughness: 0.12, metalness: 0.9 });
    const underMat = (color, w, d) => new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false })
    );

    const addBike = (x, z, ry, style) => {
      const root = new THREE.Group();
      const y0 = Math.abs(x) > 9.5 ? 0.17 : 0.03;
      root.position.set(x, y0, z);
      root.rotation.y = ry;
      g.add(root);
      const palettes = {
        street: [0x14131b, 0xff2d8e, 0x57eaff],
        delivery: [0x181b16, 0xffa64d, 0x6dffcf],
        interceptor: [0x0b0e15, 0xff345e, 0x58e8ff]
      };
      const [bodyCol, a, b] = palettes[style] || palettes.street;
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.32, metalness: 0.72 });
      for (const wz of [-0.72, 0.72]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(0, 0.33, wz);
        root.add(wheel);
      }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 1.5), bodyMat);
      frame.position.y = 0.57; root.add(frame);
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.7), bodyMat);
      tank.position.set(0, 0.8, 0.03); root.add(tank);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x0a090e, roughness: 0.8, metalness: 0.1 }));
      seat.position.set(0, 0.92, -0.32); root.add(seat);
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.75, 5), metal);
      fork.position.set(0, 0.65, 0.62); fork.rotation.x = 0.42; root.add(fork);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.045, 0.045), metal);
      bar.position.set(0, 1.03, 0.64); root.add(bar);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdff8ff).multiplyScalar(2.8), toneMapped: false }));
      head.position.set(0, 0.78, 0.75); root.add(head);
      const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1cf, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.set(0, 0.78, 0.92); beam.scale.set(2.2, 1.2, 1); root.add(beam);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(a).multiplyScalar(2.2), toneMapped: false }));
      tail.position.set(0, 0.77, -0.77); root.add(tail);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 1.38), new THREE.MeshBasicMaterial({ color: new THREE.Color(b).multiplyScalar(1.7), toneMapped: false }));
      strip.position.set(0.17, 0.59, 0); root.add(strip);
      if (style === 'delivery') {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.62), new THREE.MeshStandardMaterial({ color: 0x20261e, roughness: 0.72, metalness: 0.25 }));
        box.position.set(0, 0.93, -0.62); root.add(box);
        const sticker = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa64d).multiplyScalar(1.5), toneMapped: false }));
        sticker.position.set(0.32, 0.96, -0.62); root.add(sticker);
      } else if (style === 'interceptor') {
        for (const sx of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.06, 0.9), bodyMat);
          wing.position.set(sx * 0.32, 0.48, 0.05); wing.rotation.z = sx * 0.18; root.add(wing);
        }
        const red = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0xff1d45, toneMapped: false }));
        red.position.set(-0.19, 0.98, 0.25); root.add(red);
        const blue = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0x32dfff, toneMapped: false }));
        blue.position.set(0.19, 0.98, 0.25); root.add(blue);
      }
      const under = underMat(b, 2.5, 1.25);
      under.rotation.x = -Math.PI / 2; under.position.y = 0.025; root.add(under);
      const shadow = this.addContactShadow(g, 2.4, 1.25, 0.45, Math.abs(x) > 9.5 ? 0.182 : 0.022);
      shadow.position.set(x, Math.abs(x) > 9.5 ? 0.182 : 0.022, z);
      this.addCollider({ type: 'box', x, z, hx: 0.55, hz: 1.0 });
      return root;
    };

    const addCar = (x, z, ry, style) => {
      const root = new THREE.Group();
      const y0 = Math.abs(x) > 9.5 ? 0.17 : 0.03;
      root.position.set(x, y0, z);
      root.rotation.y = ry;
      g.add(root);
      const palettes = {
        taxi: [0x1c252b, 0xffb34d, 0x58e8ff],
        van: [0x121a1d, 0x2bdcff, 0xff4b9e],
        hover: [0x0a0c16, 0x58e8ff, 0xff2d8e],
        sedan: [0x17131c, 0xff4fa6, 0x6ce8ff]
      };
      const [bodyCol, a, b] = palettes[style] || palettes.sedan;
      const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(bodyCol).multiplyScalar(1.55), roughness: 0.27, metalness: 0.78 });
      const w = style === 'van' ? 2.05 : 1.9;
      const h = style === 'van' ? 1.0 : 0.58;
      const l = style === 'van' ? 4.5 : 3.9;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), bodyMat);
      body.position.y = 0.58; root.add(body);
      const lightGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
      lightGlow.position.set(0, 0.62, l / 2 + 0.08); lightGlow.scale.set(3.4, 1.3, 1); root.add(lightGlow);
      for (const sx of [-1, 1]) {
        const sideStrip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, l * 0.82), new THREE.MeshBasicMaterial({ color: new THREE.Color(b).multiplyScalar(1.2), toneMapped: false }));
        sideStrip.position.set(sx * w * 0.5, 0.62, 0); root.add(sideStrip);
      }
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, style === 'van' ? 0.8 : 0.52, style === 'van' ? 2.1 : 1.7), glassMat);
      cabin.position.set(0, style === 'van' ? 1.1 : 0.96, style === 'van' ? -0.25 : -0.12); root.add(cabin);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: sz > 0 ? 0xfff4d8 : new THREE.Color(a).multiplyScalar(2.0), toneMapped: false }));
          light.position.set(sx * w * 0.32, 0.58, sz * (l / 2 - 0.03)); root.add(light);
        }
      }
      if (style === 'taxi') {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb34d).multiplyScalar(1.9), toneMapped: false }));
        sign.position.set(0, 1.3, 0.2); root.add(sign);
      }
      if (style === 'hover') {
        for (const sx of [-1, 1]) {
          const skid = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, l * 0.85), new THREE.MeshBasicMaterial({ color: new THREE.Color(b).multiplyScalar(1.6), toneMapped: false }));
          skid.position.set(sx * w * 0.52, 0.28, 0); root.add(skid);
        }
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, 0.16, 1.1), glassMat);
        canopy.position.set(0, 1.12, 0.5); canopy.rotation.x = -0.12; root.add(canopy);
      } else {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.y = Math.PI / 2;
            wheel.position.set(sx * w * 0.53, 0.34, sz * l * 0.31);
            root.add(wheel);
          }
        }
      }
      const under = underMat(b, w * 1.35, l * 0.92);
      under.rotation.x = -Math.PI / 2; under.position.y = 0.025; root.add(under);
      const shadow = this.addContactShadow(g, w * 1.45, l * 0.9, 0.45, Math.abs(x) > 9.5 ? 0.182 : 0.022);
      shadow.position.set(x, Math.abs(x) > 9.5 ? 0.182 : 0.022, z);
      this.addCollider({ type: 'box', x, z, hx: w / 2 + 0.05, hz: l / 2 + 0.05 });
      return root;
    };

    const spots = [
      ['bike', 'street', -10.0, 43, 0.1], ['car', 'taxi', 10.1, 34, 0.02],
      ['bike', 'delivery', -10.1, 6, -0.08], ['car', 'van', 10.1, -18, 0.01],
      ['car', 'hover', -10.0, -42, 0.03], ['bike', 'interceptor', 10.1, -58, 0.1],
      ['car', 'taxi', 10.1, 88, 0.01], ['bike', 'street', -9.2, 108, -0.06],
      ['car', 'taxi', -8.4, 112, 0.03], ['car', 'taxi', -8.8, 118, 0.02], ['bike', 'delivery', 8.8, 126, -0.05], ['car', 'sedan', 9.0, 120, 0.02], ['car', 'van', 9.3, 140, 0.02],
      ['bike', 'interceptor', -9.2, 160, 0.08], ['car', 'hover', 9.2, 174, 0.02]
    ];
    for (const [kind, style, x, z, ry] of spots) {
      if (kind === 'bike') addBike(x, z, ry, style);
      else addCar(x, z, ry, style);
    }
  };

  World.prototype._addHeroShops = function (g) {
    const defs = [
      { side: -1, z: 0.0, title: '拉麺 24H', sub: 'RAMEN / OPEN ALL NIGHT', color: 0xffb34d },
      { side: 1, z: -8.0, title: '電脳質屋', sub: 'CYBER PAWN / TRADE', color: 0x53efff },
      { side: -1, z: -36.0, title: '龍城茶樓', sub: 'DRAGON CITY TEA', color: 0xff4da4 }
    ];
    const glowTex = this._glowTex || (this._glowTex = ND.Tex.canvasToTexture(ND.Tex.glow(128)));
    for (const d of defs) {
      const width = 3.5;
      const depth = 2.1;
      const side = d.side;
      const xMid = side * 12.45;
      const root = new THREE.Group();
      root.position.set(0, 0, d.z);
      g.add(root);
      const interiorMat = new THREE.MeshStandardMaterial({ color: 0x2a1711, roughness: 0.72, metalness: 0.18 });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x171219, roughness: 0.65, metalness: 0.25 });
      const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color).multiplyScalar(1.7), toneMapped: false });
      // floor / roof / back / side walls, open to the street
      const floor = new THREE.Mesh(new THREE.BoxGeometry(depth, 0.1, width), interiorMat);
      floor.position.set(xMid, 0.21, 0); root.add(floor);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.2, 0.16, width + 0.3), wallMat);
      roof.position.set(xMid, 3.08, 0); root.add(roof);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.9, width), interiorMat);
      back.position.set(side * 13.43, 1.68, 0); root.add(back);
      for (const sz of [-1, 1]) {
        const sideWall = new THREE.Mesh(new THREE.BoxGeometry(depth, 2.9, 0.14), wallMat);
        sideWall.position.set(xMid, 1.68, sz * (width / 2)); root.add(sideWall);
      }
      // counter + front frame
      const counter = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.92, width * 0.68), this.metalMat);
      counter.position.set(side * 11.92, 0.68, 0); root.add(counter);
      const counterTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, width * 0.72), new THREE.MeshStandardMaterial({ color: 0x2d2119, roughness: 0.42, metalness: 0.45 }));
      counterTop.position.set(side * 11.9, 1.17, 0); root.add(counterTop);
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.02, 0.12), this.metalMat);
        post.position.set(side * 11.35, 1.6, sz * (width / 2 - 0.05)); root.add(post);
      }
      const header = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, width + 0.1), this.metalMat);
      header.position.set(side * 11.35, 3.02, 0); root.add(header);
      const headerNeon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, width * 0.82), neon);
      headerNeon.position.set(side * 11.24, 3.02, 0); root.add(headerNeon);
      // shelves and glowing goods on the back wall
      for (let sy = 0; sy < 3; sy++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, width * 0.76), this.metalMat);
        shelf.position.set(side * 13.24, 1.1 + sy * 0.56, 0); root.add(shelf);
        for (let gi = 0; gi < 4; gi++) {
          const goods = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color([0xffa34d, 0x53efff, 0xff4da4, 0x9cff8d][(gi + sy) % 4]).multiplyScalar(0.68), toneMapped: false }));
          goods.position.set(side * 13.08, 1.23 + sy * 0.56, -width * 0.28 + gi * 0.36);
          root.add(goods);
        }
      }
      // a simple shopkeeper silhouette behind the counter
      const keeperMat = new THREE.MeshBasicMaterial({ color: 0x07060a });
      const keeper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.15, 0.3), keeperMat);
      keeper.position.set(side * 12.95, 0.83, 0.42); root.add(keeper);
      const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.36), keeperMat);
      shoulders.position.set(side * 12.95, 1.32, 0.42); root.add(shoulders);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), keeperMat);
      head.position.set(side * 12.95, 1.57, 0.42); root.add(head);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color).multiplyScalar(1.9), toneMapped: false }));
      visor.position.set(side * 12.77, 1.58, 0.42); visor.rotation.y = -side * Math.PI / 2; root.add(visor);
      // warm practical lamp and hanging bulb
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.45), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd39b).multiplyScalar(1.05), toneMapped: false }));
      lamp.position.set(side * 12.9, 2.72, 0); root.add(lamp);
      const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb15b, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      lampGlow.position.set(side * 12.8, 2.55, 0); lampGlow.scale.set(2.4, 1.8, 1); root.add(lampGlow);
      const steam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd6aa, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      steam.position.set(side * 12.0, 1.55, 0.75); steam.scale.set(2.0, 2.0, 1); root.add(steam);
      // horizontal shop sign
      const c = ND.util.makeCanvas(512, 160);
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgba(7,5,10,.96)'; cx.fillRect(0, 0, 512, 160);
      cx.strokeStyle = '#' + d.color.toString(16).padStart(6, '0'); cx.lineWidth = 5; cx.strokeRect(8, 8, 496, 144);
      cx.font = '700 54px "Microsoft YaHei", "Yu Gothic", sans-serif'; cx.fillStyle = '#fff3f8'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(d.title, 256, 66);
      cx.font = '400 18px "Bahnschrift", "Arial Narrow", sans-serif'; cx.fillStyle = '#' + d.color.toString(16).padStart(6, '0'); cx.fillText(d.sub, 256, 118);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.94, 0.52), new THREE.MeshBasicMaterial({ map: ND.Tex.canvasToTexture(c), toneMapped: false, color: new THREE.Color(1.0, 1.0, 1.0) }));
      sign.position.set(side * 11.22, 3.03, 0); sign.rotation.y = -side * Math.PI / 2; root.add(sign);
      // street wash and local warm light
      this.addNeonSpill('ground', side * 10.3, 0.04, d.z, 4.6, 5.4, new THREE.Color(d.color), 0.38);
      const light = new THREE.PointLight(d.color, 20, 7, 2);
      light.position.set(side * 12.35, 2.05, d.z);
      this.scene.add(light);
      this.addCollider({ type: 'box', x: side * 12.35, z: d.z, hx: 0.22, hz: 1.1 });
      this.addCollider({ type: 'box', x: side * 11.92, z: d.z, hx: 0.34, hz: 1.16 });
    }
  };

  World.prototype._addStorefronts = function (g) {
    const textures = [];
    const shutters = [];
    for (let i = 0; i < 6; i++) textures.push(this._storefrontTexture(i));
    for (let i = 0; i < 3; i++) shutters.push(ND.Tex.canvasToTexture(ND.Tex.shutter(91 + i * 37)));
    const shutterMats = shutters.map((tex, i) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.55, 0.52, 0.56), side: THREE.FrontSide }));
    const awningColors = [0x2b1119, 0x10222a, 0x241b10, 0x1c1224, 0x0e241e];
    const awningMats = awningColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.5 }));
    const rnd = ND.util.mulberry32(314159);
    for (const side of [-1, 1]) {
      let z = 186 - rnd() * 2;
      while (z > -78) {
        const width = 3.4 + rnd() * 2.4;
        const variant = Math.floor(rnd() * 6);
        const sh = 2.35 + rnd() * 0.85;
        const open = rnd() > 0.26;
        const tex = open ? textures[variant] : shutters[variant % 3];
        const brightness = open ? 0.72 + rnd() * 0.42 : 0.74;
        const mat = open
          ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(brightness, brightness, brightness), side: THREE.FrontSide })
          : shutterMats[variant % 3];
        const sf = new THREE.Mesh(new THREE.PlaneGeometry(width, sh), mat);
        sf.position.set(side * 13.55, 0.12 + sh / 2, z - width / 2);
        sf.rotation.y = -side * Math.PI / 2;
        g.add(sf);
        // awning with a little more material variety
        const awn = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, width + 0.15), awningMats[variant % awningMats.length]);
        awn.position.set(side * 13.05, 0.11 + sh + 0.07, z - width / 2);
        g.add(awn);
        if (open) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, width * 0.86), new THREE.MeshBasicMaterial({ color: new THREE.Color(variant % 2 ? 0x62ecff : 0xff63b2).multiplyScalar(1.55), toneMapped: false }));
          strip.position.set(side * 12.6, 0.1 + sh, z - width / 2);
          g.add(strip);
        } else {
          const closedLight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, width * 0.35), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a68).multiplyScalar(1.2), toneMapped: false }));
          closedLight.position.set(side * 12.6, 0.1 + sh * 0.58, z - width / 2);
          g.add(closedLight);
        }
        // door frame / divider
        for (const dz of [0, width]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, sh + 0.1, 0.16), this.metalMat);
          post.position.set(side * 13.42, 0.12 + sh / 2, z - dz);
          g.add(post);
        }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, width + 0.25), this.metalMat);
        lintel.position.set(side * 13.38, 0.12 + sh + 0.1, z - width / 2);
        g.add(lintel);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, width + 0.2), this.metalMat);
        sill.position.set(side * 13.34, 0.16, z - width / 2);
        g.add(sill);
        // occasional doorway spill glow
        if (open && rnd() > 0.58) {
          const col = variant % 2 ? 0x44e4ff : 0xff5aa9;
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: col, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false }));
          glow.position.set(side * 12.8, 0.11 + sh * 0.55, z - width / 2);
          glow.scale.set(3.4, 2.6, 1);
          g.add(glow);
          this.addNeonSpill('ground', side * 10.5, 0.035, z - width / 2, width * 1.25, 3.4, new THREE.Color(col), 0.32);
          const contact = this.addContactShadow(g, 3.0, 1.1, 0.22, 0.012);
          contact.position.x = side * 12.8;
          contact.position.z = z - width / 2;
        }
        z -= width + 0.35 + rnd() * 0.6;
      }
    }
    this._addHeroShops(g);
  };

  World.prototype._bladeTexture = function (text, sub, color, index) {
    const w = 256, h = 768;
    const c = ND.util.makeCanvas(w, h);
    const x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, 'rgba(7,4,10,.98)'); bg.addColorStop(1, 'rgba(16,4,18,.98)');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = color; x.lineWidth = 5; x.shadowColor = color; x.shadowBlur = 28;
    x.strokeRect(11, 11, w - 22, h - 22);
    x.shadowBlur = 20;
    x.font = '700 104px "Yu Gothic","Microsoft YaHei",sans-serif';
    x.fillStyle = '#fff3fb'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const chars = String(text).split('');
    const step = Math.min(118, (h - 150) / chars.length);
    chars.forEach((ch, i) => {
      x.shadowColor = color;
      x.fillText(ch, w / 2 + (i % 2 ? 3 : -3), 130 + i * step);
    });
    x.shadowBlur = 0;
    x.font = '400 18px "Bahnschrift",sans-serif'; x.fillStyle = color;
    x.save(); x.translate(w - 30, h - 132); x.rotate(Math.PI / 2); x.textAlign = 'left'; x.fillText(sub, 0, 0); x.restore();
    x.fillStyle = 'rgba(255,255,255,.22)';
    x.fillRect(28, h - 76, w - 56, 1);
    x.textAlign = 'left'; x.font = '400 14px "Bahnschrift",sans-serif'; x.fillStyle = 'rgba(255,255,255,.45)';
    x.fillText('SECTOR 07 / ' + String(31 + index).padStart(2, '0'), 28, h - 48);
    ND.util.noiseLayer(x, w, h, 44 + index, 9, true);
    return ND.Tex.canvasToTexture(c);
  };

  World.prototype._addBladeSigns = function (g) {
    const defs = [
      ['城', 'CITY', 0xffca4e], ['夜市', 'MARKET', 0xff8a4c], ['宿', 'INN', 0xff4da4],
      ['電脳', 'CYBER', 0x3ee8ff], ['龍城', 'DRAGON', 0xff2c98], ['茶', 'TEA', 0xffb04d],
      ['ホテル', 'HOTEL', 0xff4da4], ['拉麺', 'RAMEN', 0xffb04d], ['薬', 'PHARMA', 0x9eff83],
      ['酒', 'SAKE', 0xff4c5e], ['未来', 'FUTURE', 0x5d9cff], ['質', 'PAWN', 0xffca4e],
      ['義体', 'AUGMENT', 0x4ff1ff], ['夜', 'NIGHT', 0xff445f], ['カラオケ', 'KARAOKE', 0xd25dff],
      ['24H', 'OPEN', 0xff8a4c], ['MTR', 'TRANSIT', 0x53efff], ['極', 'PARADISE', 0xff2d8e],
      ['楽', 'CLUB', 0xd25dff], ['光', 'LIGHT', 0x5d9cff], ['雨', 'RAIN', 0x5cecff],
      ['九龍', 'KOWLOON', 0xff345e], ['網', 'NET', 0x5d9cff], ['市', 'MARKET', 0xffb04d]
    ];
    const rnd = ND.util.mulberry32(88221);
    for (let i = 0; i < defs.length; i++) {
      const [txt, sub, color] = defs[i];
      const side = i % 2 ? 1 : -1;
      const z = 184 - i * 10.2 - rnd() * 3.2;
      if (z < -74) continue;
      const y = 5.0 + (i % 4) * 2.7 + rnd() * 1.2;
      const w = 1.1 + rnd() * 0.35;
      const h = 3.1 + rnd() * 1.1;
      const tex = this._bladeTexture(txt, sub, '#' + color.toString(16).padStart(6, '0'), i);
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.55, 1.55, 1.55), side: THREE.DoubleSide });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      panel.position.set(side * (11.9 + (i % 2) * 0.4), y, z);
      panel.rotation.y = (i % 3 === 0) ? side * 0.12 : 0;
      g.add(panel);
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.07), this.metalMat);
      bracket.position.set(side * 12.9, y + h / 2 + 0.08, z);
      g.add(bracket);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(side * 11.8, y, z + 0.4);
      glow.scale.set(w * 3.8, h * 1.5, 1);
      g.add(glow);
      const spillColor = new THREE.Color(color);
      this.addNeonSpill('wall', side * 13.70, y, z, w * 1.5, h * 1.05, spillColor, 0.56);
      this.addNeonSpill('ground', side * 9.4, 0.04, z, w * 1.8, 4.6, spillColor, 0.42);
      this.addNeonSpill('wall', -side * 13.70, y + 0.3, z, w * 1.2, h * 1.8, spillColor, 0.14);
    }
    // second tier of large hanging banners, above the shopline
    const highDefs = [
      { txt: '龍', sub: 'DRAGON', color: 0xff4d6d, side: -1, z: 23, y: 19, w: 2.1, h: 7.1 },
      { txt: '電脳', sub: 'CYBER', color: 0x39e6ff, side: 1, z: 14, y: 16, w: 2.0, h: 6.2 },
      { txt: '夜', sub: 'NIGHT', color: 0xff4fa6, side: -1, z: -24, y: 22, w: 2.3, h: 7.6 },
      { txt: '薬', sub: 'PHARMA', color: 0x8df7c8, side: 1, z: -35, y: 19, w: 1.9, h: 6.4 },
      { txt: '酒', sub: 'SAKE', color: 0xffb34e, side: -1, z: -52, y: 17, w: 2.2, h: 7.0 },
      { txt: '未来', sub: 'FUTURE', color: 0x6f9cff, side: 1, z: -60, y: 20, w: 2.4, h: 7.4 }
    ];
    for (const d of highDefs) {
      const tex = this._bladeTexture(d.txt, d.sub, '#' + d.color.toString(16).padStart(6, '0'), Math.floor(d.z + 99));
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15), side: THREE.DoubleSide });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat);
      panel.position.set(d.side * 13.1, d.y, d.z);
      panel.rotation.y = -d.side * 0.18;
      g.add(panel);
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.08), this.metalMat);
      bracket.position.set(d.side * 12.6, d.y + d.h / 2 + 0.1, d.z);
      g.add(bracket);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: d.color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(d.side * 12.4, d.y, d.z + 0.3);
      glow.scale.set(d.w * 4.0, d.h * 1.3, 1);
      g.add(glow);
      const highColor = new THREE.Color(d.color);
      this.addNeonSpill('wall', d.side * 13.70, d.y, d.z, d.w * 1.25, d.h * 0.6, highColor, 0.42);
      this.addNeonSpill('ground', d.side * 9.4, 0.04, d.z, d.w * 1.5, 5.2, highColor, 0.32);
    }

    // overhead gantry text spanning the street
    const gantry = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(19, 0.22, 0.28), this.metalMat);
    bar.position.set(0, 6.4, -42);
    gantry.add(bar);
    const signTex = this._gantryTexture();
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.7), signMat);
    sign.position.set(0, 6.5, -42.2);
    gantry.add(sign);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: 0x44e7ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 6.5, -41.8);
    glow.scale.set(11, 3.2, 1);
    gantry.add(glow);
    g.add(gantry);
  };

  World.prototype._gantryTexture = function () {
    const w = 1024, h = 256;
    const c = ND.util.makeCanvas(w, h);
    const x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(80,238,255,.85)'; x.lineWidth = 5; x.shadowColor = '#3ae8ff'; x.shadowBlur = 22;
    x.strokeRect(12, 12, w - 24, h - 24);
    x.font = '700 108px "Yu Gothic","Microsoft YaHei",sans-serif';
    x.fillStyle = '#eaffff'; x.shadowColor = '#29e7ff'; x.shadowBlur = 28;
    x.textAlign = 'center'; x.fillText('第七区', w / 2 - 130, 168);
    x.font = '700 58px "Bahnschrift Condensed",sans-serif'; x.fillStyle = '#ff53b0'; x.shadowColor = '#ff2d9a';
    x.fillText('SECTOR 07', w / 2 + 205, 158);
    x.font = '400 22px "Bahnschrift",sans-serif'; x.fillStyle = 'rgba(255,255,255,.6)'; x.shadowBlur = 0;
    x.fillText('ALL AREAS // NO CURFEW // NEON FOREVER', w / 2, 215);
    return ND.Tex.canvasToTexture(c);
  };

  World.prototype._vendingTexture = function (seed) {
    const w = 512, h = 768;
    const c = ND.util.makeCanvas(w, h);
    const x = c.getContext('2d');
    const rnd = ND.util.mulberry32(seed + 77);
    const g = x.createLinearGradient(0, 0, w, h);
    const colors = [['#051723', '#0b3341'], ['#1a0718', '#3b0a2b'], ['#111106', '#292408']];
    const cs = colors[seed % colors.length];
    g.addColorStop(0, cs[0]); g.addColorStop(1, cs[1]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.3)'; x.lineWidth = 4; x.strokeRect(8, 8, w - 16, h - 16);
    x.font = '700 46px "Bahnschrift Condensed","Arial Narrow",sans-serif';
    x.fillStyle = '#bffaff'; x.shadowColor = '#55ecff'; x.shadowBlur = 15;
    x.fillText(seed % 2 ? 'SYNTH DRINKS' : 'NIGHT FOOD', 34, 64);
    x.font = '400 21px "Bahnschrift",sans-serif'; x.fillStyle = 'rgba(200,250,255,.65)'; x.fillText('SECTOR 07 / VENDING UNIT', 34, 96);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const bx = 38 + col * 112, by = 135 + row * 107;
        x.fillStyle = 'rgba(5,8,13,.85)'; x.fillRect(bx, by, 88, 82);
        const hue = Math.floor(rnd() * 360);
        x.fillStyle = 'hsla(' + hue + ',70%,45%,.9)';
        x.fillRect(bx + 18, by + 18, 52, 44);
        x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(bx + 26, by + 24, 12, 32);
        x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(bx, by + 76, 88, 6);
      }
    }
    x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(30, h - 108, 176, 62);
    x.fillStyle = '#7cf8ff'; x.fillRect(46, h - 92, 142, 27);
    x.fillStyle = '#051115'; x.font = '700 23px "Bahnschrift",sans-serif'; x.fillText('¥ 1,200', 56, h - 72);
    return ND.Tex.canvasToTexture(c);
  };

  World.prototype._wayfindingTexture = function () {
    const w = 1024, h = 384;
    const c = ND.util.makeCanvas(w, h);
    const x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(120,247,255,.85)'; x.lineWidth = 4; x.shadowColor = '#3ae8ff'; x.shadowBlur = 20;
    x.strokeRect(14, 14, w - 28, h - 28);
    x.font = '700 120px "Yu Gothic","Microsoft YaHei",sans-serif';
    x.fillStyle = '#eaffff'; x.shadowColor = '#26e7ff'; x.shadowBlur = 26;
    x.fillText('麒麟广场', 63, 175);
    x.font = '400 40px "Bahnschrift Condensed",sans-serif'; x.fillStyle = '#7df8ff';
    x.fillText('KIRIN PLAZA  ·  ↑  120m', 66, 245);
    x.fillStyle = 'rgba(70,232,255,.55)'; x.fillRect(66, 280, 520, 3);
    return ND.Tex.canvasToTexture(c);
  };

  World.prototype.buildWater = function () {
    const uniforms = {
      uTextureMatrix: { value: this.groundUniforms.uTextureMatrix.value },
      tReflection: { value: null },
      uTime: { value: 0 },
      uFogDensity: { value: this.fogDensity },
      uFogColor: { value: this.fogColor },
      uLightPos: { value: this.groundLights.map(l => l.p) },
      uLightColor: { value: this.groundLights.map(l => l.c) }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: this._groundVert,
      fragmentShader: this._waterFrag,
      depthWrite: true
    });
    this.waterMat = mat;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(16.2, 8.2, 1, 1), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.24, -61.5);
    this.scene.add(water);
    this.water = water;
    this.reflectionHidden.push(water);

    // stone pool lip and submerged light strips
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x0c0e15, roughness: 0.2, metalness: 0.7 });
    const rimW = 17.2, rimD = 9.2;
    const rims = [
      { x: 0, z: -61.5 - rimD / 2, w: rimW, d: 0.55 },
      { x: 0, z: -61.5 + rimD / 2, w: rimW, d: 0.55 },
      { x: -rimW / 2, z: -61.5, w: 0.55, d: rimD },
      { x: rimW / 2, z: -61.5, w: 0.55, d: rimD }
    ];
    for (const r of rims) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.34, r.d), rimMat);
      m.position.set(r.x, 0.17, r.z);
      this.scene.add(m);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(r.w * 0.9, 0.035, 0.045), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ee8ff).multiplyScalar(2.4), toneMapped: false }));
      strip.position.set(r.x, 0.34, r.z);
      this.scene.add(strip);
    }
    // water-side bollards
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 8), this.metalMat);
        b.position.set(sx * 8.1, 0.55, -61.5 + sz * 4.0);
        this.scene.add(b);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x78f6ff).multiplyScalar(2.1), toneMapped: false }));
        cap.position.set(sx * 8.1, 1.16, -61.5 + sz * 4.0);
        this.scene.add(cap);
      }
    }

    // submerged cold light makes the pool feel like a living body of water
    const waterLight = new THREE.PointLight(0x2ee8ff, 35, 16, 2);
    waterLight.position.set(0, 1.2, -61.5);
    this.scene.add(waterLight);
    const under = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex || (this._glowTex = ND.Tex.canvasToTexture(ND.Tex.glow(128))), color: 0x27cfe8, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false }));
    under.position.set(0, 0.55, -61.5);
    under.scale.set(20, 10, 1);
    this.scene.add(under);
  };

  World.prototype.buildAirDust = function () {
    const count = 420;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    const rnd = ND.util.mulberry32(93117);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rnd() - 0.5) * 44;
      pos[i * 3 + 1] = 0.4 + rnd() * 13;
      pos[i * 3 + 2] = (rnd() - 0.5) * 46;
      phase[i] = rnd();
      size[i] = 0.35 + rnd() * 0.9;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: ND.Tex.canvasToTexture(ND.Tex.glow(64), true) },
        uColor: { value: new THREE.Color(0.42, 0.62, 0.82) },
        uOpacity: { value: 0.11 }
      },
      vertexShader: `
        uniform float uTime;
        attribute float aPhase, aSize;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.18 + aPhase * 6.28) * 0.8;
          p.y += sin(uTime * 0.27 + aPhase * 4.2) * 0.5;
          p.z += cos(uTime * 0.16 + aPhase * 5.1) * 0.7;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(aSize * (100.0 / max(1.0, -mv.z)), 1.0, 7.0);
          vAlpha = 0.25 + 0.75 * aPhase;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          float a = t.a * uOpacity * vAlpha;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.airDustMat = mat;
    this.airDust = new THREE.Points(geo, mat);
    this.airDust.frustumCulled = false;
    this.airDust.layers.set(1);
    this.airDust.renderOrder = 17;
    this.scene.add(this.airDust);
  };

  World.prototype.buildAtmosphere = function () {
    const beamVert = `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `;
    const beamFrag = `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uSeed;
      uniform float uFogDensity;
      uniform vec3 uFogColor;
      varying vec2 vUv;
      varying float vDepth;
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }
      float beamNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float edge = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
        float vertical = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.68, 1.0, vUv.y));
        float mist = 0.72 + 0.28 * beamNoise(vec2(vUv.x * 7.0 + uSeed, vUv.y * 4.0 - uTime * 0.14));
        float flicker = 0.88 + 0.12 * sin(uTime * 2.6 + uSeed * 4.0);
        float a = edge * vertical * mist * uOpacity * flicker;
        vec3 col = uColor * (0.66 + 0.34 * (1.0 - vUv.y));
        float fogAmt = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        col = mix(col, uFogColor, fogAmt * 0.8);
        gl_FragColor = vec4(col, a);
      }
    `;
    const beams = [
      { x: -8.0, z: 17, y: 11.8, h: 18, r: 5.2, color: 0xff2d91, opacity: 0.115, rz: 0.10 },
      { x: 7.9, z: 5, y: 13.5, h: 20, r: 5.8, color: 0x2bdcff, opacity: 0.10, rz: -0.13 },
      { x: -4.5, z: -33, y: 13, h: 17, r: 4.2, color: 0xb060ff, opacity: 0.055, rz: 0.06 },
      { x: -6.4, z: 124, y: 14.5, h: 20, r: 5.0, color: 0xff9a4d, opacity: 0.065, rz: 0.09 },
      { x: 6.0, z: 154, y: 17.5, h: 23, r: 5.4, color: 0xff2d8e, opacity: 0.055, rz: -0.1 }
    ];
    this.beams = [];
    for (const b of beams) {
      const geo = new THREE.BufferGeometry();
      const wTop = b.r * 0.15;
      const wBottom = b.r;
      const verts = new Float32Array([
        -wTop, b.h / 2, 0,   wTop, b.h / 2, 0,   -wBottom, -b.h / 2, 0,   wBottom, -b.h / 2, 0
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
      geo.setIndex([0, 2, 1, 1, 2, 3]);
      geo.computeVertexNormals();
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(b.color).multiplyScalar(1.1) },
          uOpacity: { value: b.opacity },
          uTime: { value: 0 },
          uSeed: { value: b.x * 0.13 + b.z * 0.07 },
          uFogDensity: { value: this.fogDensity },
          uFogColor: { value: this.fogColor }
        },
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const shaft = new THREE.Group();
      const p1 = new THREE.Mesh(geo, mat); p1.position.set(b.x, b.y - b.h / 2, b.z); p1.rotation.z = b.rz;
      const p2 = new THREE.Mesh(geo, mat); p2.position.copy(p1.position); p2.rotation.y = Math.PI / 2; p2.rotation.z = b.rz;
      shaft.add(p1, p2);
      this.scene.add(shaft);
      this.beams.push(mat);
    }

    // big soft fog banks hugging the wet street
    const smokeTex = ND.Tex.canvasToTexture(ND.Tex.smoke(192, 7), true);
    this._fogTex = smokeTex;
    const fogDefs = [
      [-7, 1.5, 25, 35, 9, 0x492d64], [8, 1.2, 8, 31, 8, 0x374e78],
      [-5, 1.4, -18, 40, 10, 0x4b2a5e], [9, 1.5, -42, 36, 9, 0x2f4a66],
      [0, 2.0, -63, 50, 12, 0x4a2c65], [-10, 1.2, 45, 28, 8, 0x3e2d60]
    ];
    for (let i = 0; i < fogDefs.length; i++) {
      const [x, y, z, w, h, color] = fogDefs[i];
      const mat = new THREE.SpriteMaterial({
        map: smokeTex, color, transparent: true, opacity: 0.17,
        depthWrite: false, blending: THREE.NormalBlending
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, y, z);
      sp.scale.set(w, h, 1);
      sp.userData.base = { x, y, z, phase: i * 1.7 };
      this.fogCards.push(sp);
      this.scene.add(sp);
    }

    // dust and embers near the light
    const dustGeo = new THREE.BufferGeometry();
    const n = 260;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const rnd = ND.util.mulberry32(8733);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 24;
      pos[i * 3 + 1] = 1 + rnd() * 14;
      pos[i * 3 + 2] = 40 - rnd() * 110;
      const c = rnd() > 0.5 ? [0.9, 0.25, 0.55] : [0.2, 0.7, 1.0];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dustMat = new THREE.PointsMaterial({ size: 0.075, map: this._glowTex, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dust);
  };

  World.prototype.updateProps = function (dt, time) {
    for (const b of this.beams || []) b.uniforms.uTime.value = time;
    for (const f of this.fogCards) {
      const b = f.userData.base;
      f.position.x = b.x + Math.sin(time * 0.10 + b.phase) * 1.4;
      f.position.y = b.y + Math.sin(time * 0.17 + b.phase) * 0.15;
      f.material.opacity = 0.13 + 0.045 * Math.sin(time * 0.23 + b.phase);
    }
    for (const grp of this.lanternGroups || []) {
      grp.rotation.z = Math.sin(time * 0.42 + grp.userData.phase) * 0.018;
      grp.position.y = Math.sin(time * 0.55 + grp.userData.phase) * 0.04;
    }
    if (this.wayfinding) {
      this.wayfinding.position.y = 4.8 + Math.sin(time * 0.9) * 0.08;
      this.wayfinding.material.opacity = 0.75 + Math.sin(time * 3.1) * 0.12;
    }
    if (this.dust) {
      this.dust.rotation.y = time * 0.005;
      this.dust.position.y = Math.sin(time * 0.1) * 0.2;
    }
    if (this.stall) {
      const sp = this.stall.children.find(o => o.material && o.material.blending === THREE.AdditiveBlending);
      if (sp) sp.material.opacity = 0.25 + 0.07 * Math.sin(time * 2.7);
    }
  };
})();
