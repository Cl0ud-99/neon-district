/* =========================================================================
   NEON DISTRICT — street furniture, water, lanterns and atmosphere
   ========================================================================= */
(function () {
  'use strict';
  const ND = window.ND;
  const World = ND.World;
  const TAU = Math.PI * 2;

  function rndRange(rnd, a, b) { return a + rnd() * (b - a); }

  World.prototype.buildStreetDetails = function () {
    const rnd = ND.util.mulberry32(44031);
    const g = new THREE.Group();
    this.detailGroup = g;
    this.scene.add(g);

    // raised curbs, wet stone and gutter mouths
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x181720, roughness: 0.32, metalness: 0.42 });
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 152), curbMat);
      curb.position.set(side * 9.72, 0.12, -17);
      g.add(curb);
      const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 152), new THREE.MeshStandardMaterial({ color: 0x06070b, roughness: 0.18, metalness: 0.8 }));
      gutter.position.set(side * 9.4, 0.03, -17);
      g.add(gutter);
    }

    // street lamps with drooping cables and cold sodium heads
    const lampPositions = [
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
    }

    // long black cables sagging across the canyon
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.75, metalness: 0.4 });
    const cableZs = [48, 36, 26, 14, 3, -9, -17, -31, -40, -53, -64, -73];
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
    for (const z of [39, 18, -4, -27, -51]) {
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
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: i % 2 ? 0xff53ac : 0x55e9ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(x - Math.sign(x) * 0.55, 1.2, z);
      glow.scale.set(3.8, 3.1, 1);
      g.add(glow);
    }

    // stacked crates, bins and gas canisters
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x17182a, roughness: 0.62, metalness: 0.35 });
    const crateGeo = new THREE.BoxGeometry(1, 1, 1);
    const crates = new THREE.InstancedMesh(crateGeo, crateMat, 70);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 70; i++) {
      const side = rnd() > 0.5 ? 1 : -1;
      const x = side * (10.2 + rnd() * 3.1);
      const z = -75 + rnd() * 125;
      const s = 0.3 + rnd() * 0.75;
      dummy.position.set(x, s * 0.5 + (rnd() > 0.75 ? s : 0), z);
      dummy.rotation.set(0, rnd() * TAU, 0);
      dummy.scale.set(s, s * (0.5 + rnd()), s * (0.6 + rnd() * 0.9));
      dummy.updateMatrix();
      crates.setMatrixAt(i, dummy.matrix);
    }
    crates.instanceMatrix.needsUpdate = true;
    g.add(crates);

    // a tiny ramen stall tucked against the west wall
    const stall = new THREE.Group();
    const stallBody = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.5, 4.2), new THREE.MeshStandardMaterial({ color: 0x1a1112, roughness: 0.62, metalness: 0.2 }));
    stallBody.position.set(-11.1, 1.35, -3.5);
    stall.add(stallBody);
    const norenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb61728).multiplyScalar(1.7), toneMapped: false, side: THREE.DoubleSide });
    const noren = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), norenMat);
    noren.position.set(-9.26, 2.15, -3.5);
    noren.rotation.y = Math.PI / 2;
    stall.add(noren);
    const stallLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: 0xffa64f, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    stallLight.position.set(-9.1, 2.1, -3.5);
    stallLight.scale.set(6.5, 4.5, 1);
    stall.add(stallLight);
    this.stall = stall;
    g.add(stall);

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

  World.prototype._addStorefronts = function (g) {
    const textures = [];
    for (let i = 0; i < 6; i++) textures.push(this._storefrontTexture(i));
    const rnd = ND.util.mulberry32(314159);
    for (const side of [-1, 1]) {
      let z = 50 - rnd() * 2;
      while (z > -78) {
        const width = 3.4 + rnd() * 2.4;
        const variant = Math.floor(rnd() * 6);
        const sh = 2.35 + rnd() * 0.85;
        const open = rnd() > 0.17;
        const tex = textures[variant];
        const brightness = open ? 0.84 + rnd() * 0.48 : 0.15;
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(brightness, brightness, brightness), side: THREE.FrontSide });
        const sf = new THREE.Mesh(new THREE.PlaneGeometry(width, sh), mat);
        sf.position.set(side * 13.55, 0.12 + sh / 2, z - width / 2);
        sf.rotation.y = -side * Math.PI / 2;
        g.add(sf);
        // awning
        const awn = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, width + 0.15), new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.45, metalness: 0.55 }));
        awn.position.set(side * 13.05, 0.11 + sh + 0.07, z - width / 2);
        g.add(awn);
        if (open) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, width * 0.86), new THREE.MeshBasicMaterial({ color: new THREE.Color(variant % 2 ? 0x62ecff : 0xff63b2).multiplyScalar(1.55), toneMapped: false }));
          strip.position.set(side * 12.6, 0.1 + sh, z - width / 2);
          g.add(strip);
        }
        // door frame / divider
        for (const dz of [0, width]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, sh + 0.1, 0.16), this.metalMat);
          post.position.set(side * 13.42, 0.12 + sh / 2, z - dz);
          g.add(post);
        }
        // occasional doorway spill glow
        if (open && rnd() > 0.62) {
          const col = variant % 2 ? 0x44e4ff : 0xff5aa9;
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, color: col, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
          glow.position.set(side * 12.8, 0.11 + sh * 0.55, z - width / 2);
          glow.scale.set(3.4, 2.6, 1);
          g.add(glow);
        }
        z -= width + 0.35 + rnd() * 0.6;
      }
    }
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
      ['ホテル', 'HOTEL', 0xff4da4], ['電脳', 'CYBER', 0x3ee8ff], ['拉麺', 'RAMEN', 0xffb04d],
      ['薬', 'PHARMA', 0x9eff83], ['酒', 'SAKE', 0xff4c5e], ['未来', 'FUTURE', 0x5d9cff],
      ['質', 'PAWN', 0xffca4e], ['龍', 'DRAGON', 0xff2c98], ['カラオケ', 'KARAOKE', 0xd25dff],
      ['24H', 'OPEN', 0xff8a4c], ['義体', 'AUGMENT', 0x4ff1ff], ['夜', 'NIGHT', 0xff445f]
    ];
    const rnd = ND.util.mulberry32(88221);
    for (let i = 0; i < defs.length; i++) {
      const [txt, sub, color] = defs[i];
      const side = i % 2 ? 1 : -1;
      const z = 48 - i * 10.2 - rnd() * 3.2;
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
      uniform float uFogDensity;
      uniform vec3 uFogColor;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float fade = pow(1.0 - vUv.y, 1.5) * smoothstep(0.0, 0.14, vUv.y);
        float flicker = 0.86 + 0.14 * sin(uTime * 3.4 + vUv.y * 11.0);
        float a = edge * fade * uOpacity * flicker;
        vec3 col = uColor * (0.7 + 0.3 * (1.0 - vUv.y));
        float fogAmt = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        col = mix(col, uFogColor, fogAmt * 0.8);
        gl_FragColor = vec4(col, a);
      }
    `;
    const beams = [
      { x: -8.0, z: 17, y: 11.8, h: 18, r: 3.2, color: 0xff2d91, opacity: 0.032, rz: 0.12 },
      { x: 7.9, z: 5, y: 13.5, h: 20, r: 3.6, color: 0x2bdcff, opacity: 0.028, rz: -0.16 },
      { x: -4.5, z: -33, y: 13, h: 17, r: 3.0, color: 0xb060ff, opacity: 0.022, rz: 0.08 }
    ];
    this.beams = [];
    for (const b of beams) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(b.color).multiplyScalar(1.2) },
          uOpacity: { value: b.opacity },
          uTime: { value: 0 },
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
      const cone = new THREE.Mesh(new THREE.ConeGeometry(b.r, b.h, 36, 1, true), mat);
      cone.position.set(b.x, b.y - b.h / 2, b.z);
      cone.rotation.z = b.rz;
      this.scene.add(cone);
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
