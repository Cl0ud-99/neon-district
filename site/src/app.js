/* =========================================================================
   NEON DISTRICT — application shell, cinematic camera and game controls
   ========================================================================= */
(function () {
  'use strict';
  const ND = window.ND;
  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);

  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function smoother(t) { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (t * 6 - 15) + 10); }
  function tick() { return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); }

  const QUALITY = {
    high: { name: '高 / HIGH', dpr: 1.35, msaa: 0, sceneScale: 1.25, bloomLevels: 5, reflectionScale: 0.55, rainCount: 10000, shadowSize: 2048 },
    medium: { name: '中 / MEDIUM', dpr: 1.05, msaa: 0, sceneScale: 1.0, bloomLevels: 5, reflectionScale: 0.4, rainCount: 7000, shadowSize: 1024 },
    low: { name: '低 / LOW', dpr: 0.85, msaa: 0, sceneScale: 0.8, bloomLevels: 4, reflectionScale: 0.3, rainCount: 4500, shadowSize: 1024 }
  };

  class App {
    constructor() {
      this.state = 'boot';
      this.time = 0;
      this.stateTime = 0;
      this.clock = new THREE.Clock();
      this.freeze = false;
      this.shotMode = false;
      this.keys = {};
      this.fps = 60;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.lastHUD = 0;
      this.perfTimer = 0;
      this.renderScale = 1.0;
      this.autoScaleTimer = 0;
      this.autoScaleCooldown = 0;
      this.mouseDown = false;
      this.audio = new ND.AudioEngine();
      this.params = new URLSearchParams(location.search);
      const qualityParam = this.params.get('quality');
      this.qualityKey = QUALITY[qualityParam] ? qualityParam : (matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
      this.quality = QUALITY[this.qualityKey];

      this.player = {
        pos: new V3(0, 0, 29),
        yaw: 0,
        pitch: -0.015,
        height: 1.68,
        bob: 0,
        walkTime: 0,
        stepTimer: 0,
        moving: false
      };

      this.cineShots = [
        {
          t0: 0, t1: 7,
          p0: [-10, 34, 58], p1: [-2, 3.2, 35],
          l0: [0, 18, -45], l1: [0, 12, -72],
          f0: 58, f1: 51, focus: 38, dof: 0.32
        },
        {
          t0: 7, t1: 14,
          p0: [0.8, 1.65, 30], p1: [-1.2, 1.72, 12],
          l0: [0, 8.5, -40], l1: [-1, 10, -70],
          f0: 50, f1: 49, focus: 22, dof: 0.46
        },
        {
          t0: 14, t1: 21,
          p0: [7.8, 2.1, 8], p1: [5.5, 2.3, -4],
          l0: [-10, 6, 2], l1: [-6, 10, -24],
          f0: 52, f1: 50, focus: 18, dof: 0.58
        },
        {
          t0: 21, t1: 30,
          p0: [6.8, 2.1, -33], p1: [0.6, 2.2, -49],
          l0: [0, 9, -72], l1: [0, 9, -80],
          f0: 54, f1: 50, focus: 30, dof: 0.50
        },
        {
          t0: 30, t1: 37,
          p0: [0.5, 2.4, -55], p1: [0, 4.5, -50],
          l0: [0, 18, -83], l1: [0, 22, -84],
          f0: 58, f1: 50, focus: 34, dof: 0.55
        },
        {
          t0: 37, t1: 46,
          p0: [0, 4.0, -38], p1: [0, 24, -18],
          l0: [0, 10, -75], l1: [0, 8, -82],
          f0: 56, f1: 54, focus: 48, dof: 0.20
        }
      ];
      this.captions = [
        { t: 1.0, zh: '新九州 · 第七区', en: 'NEO-KYUSHU · SECTOR 07' },
        { t: 8.0, zh: '雨水从不睡觉。', en: 'THE RAIN NEVER SLEEPS.' },
        { t: 15.0, zh: '霓虹，是这座城的第二层皮肤。', en: 'NEON IS THE CITY\'S SECOND SKIN.' },
        { t: 22.0, zh: '欢迎来到霓虹街区。', en: 'WELCOME TO NEON DISTRICT.' },
        { t: 31.0, zh: '麒麟广场 · 第七区', en: 'KIRIN PLAZA · SECTOR 07' },
        { t: 39.0, zh: '今夜的雨，不会停。', en: 'TONIGHT, THE RAIN WILL NOT STOP.' }
      ];
      this.currentCaption = -1;
      this._bindUI();
    }

    initRenderer() {
      const canvas = $('scene');
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas, antialias: false, alpha: false, stencil: false,
          powerPreference: 'high-performance', preserveDrawingBuffer: false
        });
      } catch (err) {
        this.fail('无法创建 WebGL2 上下文 / WEBGL2 CONTEXT UNAVAILABLE', err);
        throw err;
      }
      if (!this.renderer.capabilities.isWebGL2) {
        this.fail('此演示需要 WebGL2 / THIS DEMO REQUIRES WEBGL2');
        throw new Error('WebGL2 unavailable');
      }
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.autoClear = true;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.setClearColor(0x05030b, 1);
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05030b);
      this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.08, 500);
      this.camera.position.set(0, 2.2, 28);
      this.camera.rotation.order = 'YXZ';
      this.camera.layers.enable(1);
    }

    async boot() {
      this.initRenderer();
      this.bootStep('CALIBRATING OPTICS // 校准光学', 8);
      await tick();
      this.bootStep('POURING CONCRETE // 浇筑楼体', 18);
      await tick();
      this.world = new ND.World(this.scene, this.renderer, { quality: this.quality });
      this.bootStep('LIGHTING SIGNS // 点亮招牌', 52);
      await tick();
      this.post = new ND.PostFX(this.renderer, {
        bloomLevels: this.quality.bloomLevels,
        msaa: this.quality.msaa,
        sceneScale: this.quality.sceneScale,
        reflectionScale: this.quality.reflectionScale,
        exposure: 1.34,
        bloomStrength: 1.08,
        ssr: this.qualityKey !== 'low'
      });
      this.applySizes();
      this.bootStep('SEEDING RAIN // 落雨', 74);
      await tick();
      // pre-warm the shader compiler before the title card
      this.world.update(0.016, 0);
      this.camera.position.set(0, 2.2, 28);
      this.camera.lookAt(0, 10, -70);
      this.post.render(this.scene, this.camera, this.world, 0, 0);
      this.bootStep('SYNCING SIGNAL // 接入城市', 100);
      await new Promise(r => setTimeout(r, 350));
      this.ready = true;
      this.clock.start();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
      $('boot').classList.add('gone');
      document.body.classList.add('ready');
      this.setQualityLabel();
      this.handleInitialMode();
    }

    loop() {
      requestAnimationFrame(this.loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.update(dt);
    }

    bootStep(text, pct) {
      const status = $('boot-status');
      const bar = $('boot-bar');
      if (status) status.textContent = text;
      if (bar) bar.style.width = pct + '%';
    }

    fail(msg, err) {
      console.error(err || msg);
      const el = $('boot-status');
      if (el) { el.textContent = msg; el.classList.add('error'); }
      const bar = $('boot-bar'); if (bar) bar.style.background = '#ff2d55';
    }

    handleInitialMode() {
      const shot = this.params.get('shot');
      if (shot) {
        this.shotMode = true;
        document.body.classList.add('shot-mode');
        this.state = 'shot';
        this.freeze = this.params.get('freeze') !== '0';
        const t = parseFloat(this.params.get('t') || '9');
        this.time = isFinite(t) ? t : 9;
        this.setCameraPreset(this.params.get('cam') || 'hero');
        if (shot === 'menu') {
          this.state = 'menu';
          document.body.classList.remove('shot-mode');
          this.showMenu(true);
        }
      } else if (this.params.get('autocine') === '1') {
        this.startCinematic();
      } else {
        this.state = 'menu';
        this.showMenu(true);
        $('menu').classList.add('visible');
      }
      window.__NEON_READY = true;
    }

    _bindUI() {
      $('btn-enter').addEventListener('click', e => { e.stopPropagation(); this.startPlay(); });
      $('btn-cinema').addEventListener('click', e => { e.stopPropagation(); this.startCinematic(); });
      $('btn-mute').addEventListener('click', () => this.toggleMute());
      $('btn-quality').addEventListener('click', () => this.cycleQuality());
      $('btn-resume').addEventListener('click', () => this.resumePlay());
      $('btn-pause-menu').addEventListener('click', () => this.returnToMenu());
      $('btn-cine-exit').addEventListener('click', () => this.returnToMenu());
      $('btn-help').addEventListener('click', () => this.toggleHelp());

      window.addEventListener('resize', () => this.onResize());
      document.addEventListener('pointerlockchange', () => {
        if (this.state === 'play' && document.pointerLockElement !== this.renderer.domElement) {
          this.pausePlay();
        }
      });
      document.addEventListener('mousemove', e => {
        if (this.state === 'play') {
          if (document.pointerLockElement === this.renderer.domElement || this.mouseDown) {
            this.player.yaw -= e.movementX * 0.0018;
            this.player.pitch -= e.movementY * 0.00145;
            this.player.pitch = Math.max(-1.18, Math.min(1.05, this.player.pitch));
          }
        }
      });
      const canvas = $('scene');
      canvas.addEventListener('mousedown', () => { this.mouseDown = true; });
      window.addEventListener('mouseup', () => { this.mouseDown = false; });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('keydown', e => {
        if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'].includes(e.code)) e.preventDefault();
        this.keys[e.code] = true;
        if (e.code === 'Enter' && this.state === 'menu') this.startPlay();
        if (e.code === 'KeyC' && (this.state === 'menu' || this.state === 'play' || this.state === 'pause')) this.startCinematic();
        if (e.code === 'KeyM') this.toggleMute();
        if (e.code === 'KeyH') this.toggleHelp();
        if (e.code === 'Escape') {
          if (this.state === 'cinematic') this.returnToMenu();
          else if (this.state === 'play') this.pausePlay();
          else if (this.state === 'pause') this.returnToMenu();
        }
      });
      window.addEventListener('keyup', e => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; });
    }

    showMenu(initial) {
      if (this.post) this.post.resetTAA();
      this.state = 'menu';
      this.stateTime = 0;
      document.body.dataset.state = 'menu';
      $('menu').classList.add('visible');
      $('pause').classList.remove('visible');
      $('hud').classList.remove('visible');
      $('cinema-ui').classList.remove('visible');
      $('reticle').classList.remove('visible');
      $('menu').classList.toggle('initial', !!initial);
      this.hideCaption();
    }

    startPlay() {
      this.audio.init().then(() => this.audio.enterCue());
      if (this.post) this.post.resetTAA();
      this.state = 'play';
      this.stateTime = 0;
      document.body.dataset.state = 'play';
      $('menu').classList.remove('visible');
      $('pause').classList.remove('visible');
      $('hud').classList.add('visible');
      $('reticle').classList.add('visible');
      $('cinema-ui').classList.remove('visible');
      this.hideCaption();
      this.player.pos.set(0, 0, 29);
      this.player.yaw = 0;
      this.player.pitch = -0.015;
      this.player.bob = 0;
      this.zoneReached = false;
      this.perfTimer = 0;
      this.camera.rotation.order = 'YXZ';
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      const c = $('scene');
      if (c.requestPointerLock) {
        try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) {}
      }
      this.showToast('已进入第七区 // SECTOR 07');
      setTimeout(() => this.showToast(''), 3200);
    }

    startCinematic() {
      this.audio.init().then(() => this.audio.enterCue());
      if (this.post) this.post.resetTAA();
      this.state = 'cinematic';
      this.stateTime = 0;
      this.currentCaption = -1;
      this.perfTimer = 0;
      document.body.dataset.state = 'cinematic';
      $('menu').classList.remove('visible');
      $('pause').classList.remove('visible');
      $('hud').classList.remove('visible');
      $('reticle').classList.remove('visible');
      $('cinema-ui').classList.add('visible');
      if (document.pointerLockElement) document.exitPointerLock();
      this.camera.rotation.order = 'YXZ';
      this.updateCinematic(0);
    }

    pausePlay() {
      if (this.state !== 'play') return;
      this.state = 'pause';
      document.body.dataset.state = 'pause';
      $('pause').classList.add('visible');
      $('hud').classList.remove('visible');
      $('reticle').classList.remove('visible');
      if (document.pointerLockElement) document.exitPointerLock();
    }

    resumePlay() {
      this.state = 'play';
      document.body.dataset.state = 'play';
      $('pause').classList.remove('visible');
      $('hud').classList.add('visible');
      $('reticle').classList.add('visible');
      const c = $('scene');
      if (c.requestPointerLock) { try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    }

    returnToMenu() {
      if (document.pointerLockElement) document.exitPointerLock();
      if (this.post) this.post.resetTAA();
      this.showMenu(false);
    }

    toggleMute() {
      this.audio.init();
      const muted = this.audio.toggleMute();
      $('btn-mute').classList.toggle('muted', muted);
      $('btn-mute').querySelector('.label').textContent = muted ? '静音' : '声音';
      this.showToast(muted ? '声音关闭 // AUDIO OFF' : '声音开启 // AUDIO ON');
      setTimeout(() => this.showToast(''), 2200);
    }

    cycleQuality() {
      const order = ['high', 'medium', 'low'];
      const idx = order.indexOf(this.qualityKey);
      this.qualityKey = order[(idx + 1) % order.length];
      this.quality = QUALITY[this.qualityKey];
      this.renderScale = 1.0;
      this.autoScaleTimer = 0;
      this.autoScaleCooldown = 0;
      if (this.post) {
        this.post.opts.sceneScale = this.quality.sceneScale;
        this.post.opts.msaa = this.quality.msaa;
        this.post.opts.ssr = this.qualityKey !== 'low';
        this.post.width = 0;
      }
      this.applySizes();
      this.setQualityLabel();
      this.showToast('画质：' + this.quality.name);
      setTimeout(() => this.showToast(''), 2200);
    }

    setQualityLabel() {
      const q = $('quality-label');
      if (q) q.textContent = this.quality.name;
    }

    toggleHelp() {
      const h = $('help');
      h.classList.toggle('visible');
    }

    showToast(text) {
      const t = $('toast');
      t.textContent = text;
      t.classList.toggle('visible', !!text);
    }

    hideCaption() {
      const c = $('caption');
      if (c) { c.classList.remove('visible'); c.style.opacity = 0; }
    }

    onResize() {
      if (!this.renderer) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.applySizes();
    }

    applySizes() {
      if (!this.renderer) return;
      const area = window.innerWidth * window.innerHeight;
      // Cap DPR more aggressively on 4K panels; the HDR chain is expensive.
      const cap = area > 3800 * 2100 ? Math.min(this.quality.dpr, 1.05) : this.quality.dpr;
      const dpr = Math.max(0.55, Math.min(2.0, Math.min(window.devicePixelRatio || 1, cap) * this.renderScale));
      this.dpr = dpr;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      if (this.post) this.post.setSize(window.innerWidth, window.innerHeight, dpr);
      if (this.world) this.world.setSize(window.innerWidth, window.innerHeight, dpr);
    }

    setCameraPreset(name) {
      if (this.post) this.post.resetTAA();
      const c = this.camera;
      const presets = {
        hero: { p: [0, 1.85, 28], l: [0, 12.5, -78], fov: 55 },
        street: { p: [-2.6, 1.75, 14], l: [2, 8, -62], fov: 56 },
        plaza: { p: [4.2, 2.0, -41], l: [0, 6.5, -66], fov: 51 },
        water: { p: [0.5, 2.35, -46.5], l: [0, 10.5, -70], fov: 58 },
        aerial: { p: [0, 27, 42], l: [0, 8, -72], fov: 58 },
        close: { p: [4.5, 4.4, 7], l: [-3, 12, -60], fov: 60 },
        low: { p: [0, 0.55, 21], l: [0, 15, -80], fov: 62 },
        back: { p: [0, 1.78, 96], l: [0, 7.2, 178], fov: 58 },
        menu: { p: [0, 2.2, 29], l: [0, 11, -77], fov: 52 }
      };
      const p = presets[name] || presets.hero;
      c.position.set(p.p[0], p.p[1], p.p[2]);
      c.fov = p.fov;
      c.updateProjectionMatrix();
      c.rotation.order = 'YXZ';
      c.lookAt(p.l[0], p.l[1], p.l[2]);
    }

    updateMenuCamera(dt, time) {
      const t = time * 0.055;
      this.camera.position.set(Math.sin(t) * 1.2, 2.2 + Math.sin(t * 1.4) * 0.05, 29 + Math.cos(t * 0.7) * 1.0);
      this.camera.fov = 52;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 11 + Math.sin(t * 0.6) * 0.4, -77);
    }

    updateCinematic(dt) {
      const elapsed = this.stateTime;
      let shot = this.cineShots[this.cineShots.length - 1];
      for (const s of this.cineShots) { if (elapsed >= s.t0 && elapsed <= s.t1) { shot = s; break; } }
      if (shot !== this._lastCineShot) {
        this._lastCineShot = shot;
        if (this.post) this.post.resetTAA();
      }
      let raw = (elapsed - shot.t0) / (shot.t1 - shot.t0);
      raw = Math.max(0, Math.min(1, raw));
      const k = smoother(raw);
      const p = [
        shot.p0[0] + (shot.p1[0] - shot.p0[0]) * k,
        shot.p0[1] + (shot.p1[1] - shot.p0[1]) * k,
        shot.p0[2] + (shot.p1[2] - shot.p0[2]) * k
      ];
      const l = [
        shot.l0[0] + (shot.l1[0] - shot.l0[0]) * k,
        shot.l0[1] + (shot.l1[1] - shot.l0[1]) * k,
        shot.l0[2] + (shot.l1[2] - shot.l0[2]) * k
      ];
      // gentle dolly sway
      p[0] += Math.sin(elapsed * 0.37) * 0.12;
      p[1] += Math.sin(elapsed * 0.53 + 1.2) * 0.04;
      l[0] += Math.sin(elapsed * 0.23) * 0.16;
      l[1] += Math.cos(elapsed * 0.31) * 0.08;
      this.camera.position.set(p[0], p[1], p[2]);
      this.camera.fov = shot.f0 + (shot.f1 - shot.f0) * k;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(l[0], l[1], l[2]);
      this.cineFocus = shot.focus || 24;
      this.cineDof = shot.dof || 0.35;
      this.updateCinemaText(elapsed);
    }

    updateCinemaText(elapsed) {
      let idx = -1;
      for (let i = 0; i < this.captions.length; i++) if (elapsed >= this.captions[i].t) idx = i;
      if (idx !== this.currentCaption) {
        this.currentCaption = idx;
        const cap = $('caption');
        if (idx >= 0) {
          const c = this.captions[idx];
          $('caption-zh').textContent = c.zh;
          $('caption-en').textContent = c.en;
          cap.classList.add('visible');
        } else {
          cap.classList.remove('visible');
        }
      }
      // location card at the beginning, small title at end
      $('cine-location').classList.toggle('visible', elapsed > 0.8 && elapsed < 7.5);
      $('cine-title').classList.toggle('visible', elapsed > 42.0);
    }

    updatePlayer(dt) {
      const keys = this.keys;
      let ix = 0, iz = 0;
      if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
      const len = Math.hypot(ix, iz);
      const moving = len > 0;
      this.player.moving = moving;
      if (moving) {
        ix /= len; iz /= len;
        const speed = (keys['ShiftLeft'] || keys['ShiftRight'] ? 6.4 : 3.2);
        const sin = Math.sin(this.player.yaw), cos = Math.cos(this.player.yaw);
        const dx = (ix * cos + iz * sin) * speed * dt;
        const dz = (-ix * sin + iz * cos) * speed * dt;
        let nx = this.player.pos.x + dx;
        let nz = this.player.pos.z + dz;
        nx = Math.max(-11.8, Math.min(11.8, nx));
        nz = Math.max(-78.5, Math.min(188, nz));
        // pool basin collision, leave walkway on both sides
        if (nz < -55.8 && nz > -67.2 && Math.abs(nx) < 8.9) {
          const oldInside = this.player.pos.z < -55.8 && this.player.pos.z > -67.2 && Math.abs(this.player.pos.x) < 8.9;
          if (!oldInside) {
            // slide along the rim
            if (Math.abs(this.player.pos.x) < 8.9) nz = this.player.pos.z;
          } else {
            // let the player get out toward the nearest walkway
            nx = this.player.pos.x;
            nz = this.player.pos.z;
          }
        }
        if (this.world && this.world.resolveCollision) {
          const solved = this.world.resolveCollision(nx, nz, 0.36);
          nx = solved.x; nz = solved.z;
          nx = Math.max(-11.8, Math.min(11.8, nx));
          nz = Math.max(-78.5, Math.min(188, nz));
        }
        this.player.pos.x = nx; this.player.pos.z = nz;
        this.player.walkTime += dt * (speed > 4 ? 1.35 : 1.0);
        this.player.bob = Math.sin(this.player.walkTime * 11.0) * (speed > 4 ? 0.055 : 0.035);
        this.player.stepTimer -= dt;
        if (this.player.stepTimer <= 0) { this.player.stepTimer = speed > 4 ? 0.27 : 0.43; this.audio.step(); }
      } else {
        this.player.bob *= Math.max(0, 1 - dt * 6);
      }
      const sidewalk = Math.abs(this.player.pos.x) > 9.5 ? 0.17 : 0;
      const y = sidewalk + this.player.height + this.player.bob;
      this.camera.position.set(this.player.pos.x, y, this.player.pos.z);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
      this.camera.fov = 62 + (keys['ShiftLeft'] || keys['ShiftRight'] ? 3 : 0);
      this.camera.updateProjectionMatrix();
    }

    update(dt) {
      if (!this.ready) return;
      if (!this.freeze) this.time += dt;
      this.stateTime += dt;
      this.world.update(dt, this.time);
      if (this.world.rain) this.world.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
      if (this.world.rainNear) this.world.rainNear.position.set(this.camera.position.x, 0, this.camera.position.z);
      if (this.world.airDust) this.world.airDust.position.set(this.camera.position.x, 0, this.camera.position.z);
      if (this.state === 'menu') this.updateMenuCamera(dt, this.time);
      else if (this.state === 'cinematic') { this.updateCinematic(dt); if (this.stateTime > 46.2) { this.stateTime = 0; this.currentCaption = -1; } }
      else if (this.state === 'play') {
        this.updatePlayer(dt);
        if (!this.zoneReached && this.player.pos.z < -44) {
          this.zoneReached = true;
          this.audio.zoneCue();
          this.showToast('已抵达麒麟广场 // KIRIN PLAZA REACHED');
          setTimeout(() => this.showToast(''), 3800);
        }
      }
      const look = this.post.finalMat.uniforms;
      if (this.state === 'cinematic') {
        look.uFocus.value = this.cineFocus || 28;
        look.uDof.value = this.cineDof || 0.45;
      } else {
        look.uFocus.value = this.state === 'menu' ? 24 : 20;
        look.uDof.value = this.state === 'shot' ? 0.0 : 0.12;
      }
      this.audio.update(dt);
      // FPS instrumentation
      this.fpsAccum += dt; this.fpsFrames++;
      if (this.fpsAccum > 0.6) {
        this.fps = this.fpsFrames / this.fpsAccum;
        this.fpsAccum = 0; this.fpsFrames = 0;
        this.updateHUD();
        if (this.state === 'play' || this.state === 'cinematic') {
          this.perfTimer += dt;
          if (this.fps < 47 && this.renderScale > 0.62) {
            this.autoScaleCooldown += 0.6;
            if (this.autoScaleCooldown > 2.4) {
              this.autoScaleCooldown = 0;
              this.renderScale = Math.max(0.62, this.renderScale - 0.08);
              this.applySizes();
              this.showToast('分辨率自适应 // DYNAMIC RESOLUTION');
              setTimeout(() => this.showToast(''), 2200);
            }
          } else if (this.fps > 57 && this.renderScale < 1.0) {
            this.autoScaleTimer += 0.6;
            if (this.autoScaleTimer > 5.0) {
              this.autoScaleTimer = 0;
              this.renderScale = Math.min(1.0, this.renderScale + 0.04);
              this.applySizes();
            }
          } else {
            this.autoScaleCooldown = 0;
            this.autoScaleTimer = 0;
          }
          if (this.perfTimer > 8 && this.fps < 24 && this.renderScale <= 0.66 && this.qualityKey !== 'low') {
            this.perfTimer = 0;
            this.cycleQuality();
            this.showToast('自动降低画质 // AUTO QUALITY');
            setTimeout(() => this.showToast(''), 2600);
          }
        } else {
          this.perfTimer = 0;
          this.autoScaleTimer = 0;
          this.autoScaleCooldown = 0;
        }
      }
      this.post.render(this.scene, this.camera, this.world, this.time, this.world.flash);
    }

    updateHUD() {
      const fps = $('fps'); if (fps) fps.textContent = Math.round(this.fps) + ' FPS';
      const clock = $('clock');
      if (clock) {
        const total = (23 * 3600 + 47 * 60 + Math.floor(this.time * 1.0)) % 86400;
        const hh = String(Math.floor(total / 3600)).padStart(2, '0');
        const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
        const ss = String(total % 60).padStart(2, '0');
        clock.textContent = hh + ':' + mm + ':' + ss;
      }
      const zone = $('zone-status');
      if (zone) {
        const pz = this.player.pos.z;
        zone.textContent = pz > 174 ? 'KOWLOON GATE / 九龙城门'
          : pz > 140 ? 'NIGHT RAIN HOTEL / 夜雨旅馆'
          : pz > 100 ? 'NIGHT MARKET / 九龙夜市'
          : pz > 52 ? 'OLD TOWN / 旧城'
          : pz < -45 ? 'KIRIN PLAZA / 麒麟广场'
          : 'RAIN MARKET / 雨市';
      }
      const prog = $('mission-progress');
      if (prog) {
        const p = Math.max(0, Math.min(1, (29 - this.player.pos.z) / 90));
        prog.style.width = Math.round(p * 100) + '%';
      }
    }

    toggleMuteState() {}
  }

  // Expose a tiny console / screenshot API.
  window.NEON = {
    app: null,
    get ready() { return !!(window.NEON.app && window.NEON.app.ready); },
    setPreset(name) { if (window.NEON.app) window.NEON.app.setCameraPreset(name); },
    freeze(v) { if (window.NEON.app) window.NEON.app.freeze = v; }
  };

  function launch() {
    const app = new App();
    window.NEON.app = app;
    app.boot().catch(err => {
      console.error(err);
      const b = document.getElementById('boot-status');
      if (b) { b.textContent = '初始化失败 / BOOT FAILURE: ' + (err && err.message || err); b.classList.add('error'); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch);
  else launch();
})();
