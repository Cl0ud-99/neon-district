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
    high: { name: '高 / HIGH', msaa: 0, sceneScale: 1.0, bloomLevels: 4, reflectionScale: 0.26, rainCount: 16000, rainNearCount: 1400, shadowSize: 2048 },
    medium: { name: '中 / MEDIUM', msaa: 0, sceneScale: 0.9, bloomLevels: 4, reflectionScale: 0.24, rainCount: 12000, rainNearCount: 1100, shadowSize: 1024 },
    low: { name: '低 / LOW', msaa: 0, sceneScale: 0.78, bloomLevels: 4, reflectionScale: 0.18, rainCount: 8000, rainNearCount: 800, shadowSize: 1024 }
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
      this.perfTimer = 0;
      this.renderScale = 1.0;
      this.photo = null;
      this.photoReturn = 'play';
      this.photoPrevFreeze = false;
      this.autoScaleTimer = 0;
      this.autoScaleCooldown = 0;
      this.mouseDown = false;
      this.audio = new ND.AudioEngine();
      this.params = new URLSearchParams(location.search);
      const benchParam = this.params.get('bench');
      this.benchMode = benchParam !== null;
      this.benchDuration = Math.max(8, parseFloat(benchParam) || 20);
      this.benchElapsed = 0;
      this.benchDone = false;
      this.benchWarmup = 1.2;
      this.benchTimes = [];
      this.frameTimes = [];
      this.perfPanel = false;
      this.perfUpdateTimer = 0;
      this.rawDt = 0;
      this.contrast = (() => {
        const v = parseFloat(this.params.get('contrast'));
        return Number.isFinite(v) ? Math.max(0.6, Math.min(1.6, v)) : 1.04;
      })();
      this.recordMode = this.params.get('record') === '1';
      this.recordDuration = Math.max(2, parseFloat(this.params.get('recordsec')) || 67.7);
      this.recording = false;
      this.recordChunks = [];
      this.recordRecorder = null;
      this.recordCanvas = null;
      this.recordCtx = null;
      const qualityParam = this.params.get('quality');
      this.qualityKey = QUALITY[qualityParam] ? qualityParam : (matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
      this.quality = QUALITY[this.qualityKey];
      const resParam = this.params.get('res');
      let savedRes = null;
      try { savedRes = localStorage.getItem('nd-resolution'); } catch (e) {}
      this.resolutionMode = (resParam === '4k' || resParam === '2160')
        ? '4k'
        : ((resParam === '2k' || resParam === '1440')
          ? '2k'
          : (resParam === '1080' ? '1080' : (savedRes === '2k' ? '2k' : '1080')));

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
        },
        {
          t0: 46, t1: 53,
          p0: [-2.0, 2.2, 132], p1: [0.4, 3.8, 158],
          l0: [0, 9, 184], l1: [0, 13, 190],
          f0: 52, f1: 46, focus: 34, dof: 0.38
        },
        {
          t0: 53, t1: 60,
          p0: [6.5, 3.2, 100], p1: [-3.5, 2.25, 112],
          l0: [-10, 7, 124], l1: [-4, 4.5, 136],
          f0: 48, f1: 52, focus: 20, dof: 0.55
        },
        {
          t0: 60, t1: 68,
          p0: [0, 18, 118], p1: [0, 30, 138],
          l0: [0, 10, 184], l1: [0, 8, 190],
          f0: 54, f1: 58, focus: 52, dof: 0.18
        }
      ];
      this.captions = [
        { t: 1.0, zh: '新九州 · 第七区', en: 'NEO-KYUSHU · SECTOR 07' },
        { t: 8.0, zh: '雨水从不睡觉。', en: 'THE RAIN NEVER SLEEPS.' },
        { t: 15.0, zh: '霓虹，是这座城的第二层皮肤。', en: 'NEON IS THE CITY\'S SECOND SKIN.' },
        { t: 22.0, zh: '欢迎来到霓虹街区。', en: 'WELCOME TO NEON DISTRICT.' },
        { t: 31.0, zh: '麒麟广场 · 第七区', en: 'KIRIN PLAZA · SECTOR 07' },
        { t: 39.0, zh: '今夜的雨，不会停。', en: 'TONIGHT, THE RAIN WILL NOT STOP.' },
        { t: 47.0, zh: '城门之后，是另一座城。', en: 'BEYOND THE GATE, ANOTHER CITY.' },
        { t: 54.0, zh: '夜市还醒着。', en: 'THE NIGHT MARKET IS STILL AWAKE.' },
        { t: 61.0, zh: '九龙不眠。', en: 'KOWLOON NEVER SLEEPS.' }
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
      this.world.onLightning = (ev) => {
        const delayMs = Math.max(0, ev.delay) * 1000;
        setTimeout(() => { if (this.audio) this.audio.thunder(ev); }, delayMs);
      };
      this.world.onLifeEvent = (ev) => {
        if (this.audio) this.audio.lifeEvent(ev);
      };
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
      this.post.finalMat.uniforms.uContrast.value = this.contrast;
      this.applySizes();
      this.bootStep('SEEDING RAIN // 落雨', 74);
      await tick();
      // pre-warm the shader compiler before the title card
      this.world.update(0.016, 0, this.camera);
      this.camera.position.set(0, 2.2, 28);
      this.camera.lookAt(0, 10, -70);
      // Compile every material before the title card; otherwise the first
      // frames of play absorb shader compilation as a visible 100–300ms hitch.
      this.renderer.compile(this.scene, this.camera);
      this.post.render(this.scene, this.camera, this.world, 0, 0);
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
      const rawDt = this.clock.getDelta();
      this.rawDt = rawDt;
      const dt = this.recording ? Math.min(rawDt, 0.2) : Math.min(rawDt, 0.05);
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
      if (this.recordMode) this.startTrailerRecording();
      else if (this.benchMode && this.state !== 'shot') this.startBenchmark();
      else if (this.params.get('photo') === '1' && this.state !== 'shot') this.enterPhoto();
      if (this.params.get('lightning') === '1') this.world.nextLightning = 0.01;
      if (this.params.get('capture') === '4k' || this.params.get('capture') === '1') {
        this.resolutionMode = '4k';
        this.applySizes();
        this.updateResolutionLabel();
        setTimeout(() => this.captureAt(3840, 2160), 4000);
      }
      window.__NEON_READY = true;
    }

    _bindUI() {
      $('btn-enter').addEventListener('click', e => { e.stopPropagation(); this.startPlay(); });
      $('btn-cinema').addEventListener('click', e => { e.stopPropagation(); this.startCinematic(); });
      $('btn-mute').addEventListener('click', () => this.toggleMute());
      $('btn-quality').addEventListener('click', () => this.cycleQuality());
      $('btn-res').addEventListener('click', () => this.cycleResolution());
      $('btn-pause-res').addEventListener('click', () => this.cycleResolution());
      $('btn-pause-quality').addEventListener('click', () => this.cycleQuality());
      this.updateResolutionLabel();
      this.setQualityLabel();
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
        if (this.state === 'play' || this.state === 'photo') {
          const look = this.state === 'photo' ? this.photo : this.player;
          if (!look) return;
          if (document.pointerLockElement === this.renderer.domElement || this.mouseDown) {
            look.yaw -= e.movementX * 0.0018;
            look.pitch -= e.movementY * 0.00145;
            look.pitch = Math.max(-1.18, Math.min(1.05, look.pitch));
          }
        }
      });
      const canvas = $('scene');
      canvas.addEventListener('mousedown', () => { this.mouseDown = true; });
      window.addEventListener('mouseup', () => { this.mouseDown = false; });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('wheel', e => {
        if (this.state === 'photo' && this.photo) {
          e.preventDefault();
          this.photo.fov = Math.max(22, Math.min(80, this.photo.fov + e.deltaY * 0.025));
          this.updatePhotoHud();
        }
      }, { passive: false });
      window.addEventListener('keydown', e => {
        if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'].includes(e.code)) e.preventDefault();
        this.keys[e.code] = true;
        if (e.code === 'F3') {
          e.preventDefault();
          this.perfPanel = !this.perfPanel;
          $('perf-panel').classList.toggle('visible', this.perfPanel);
          return;
        }
        if (e.code === 'KeyP' && (this.state === 'play' || this.state === 'pause' || this.state === 'menu' || this.state === 'photo')) {
          e.preventDefault();
          this.togglePhoto();
          return;
        }
        if (this.shotMode && e.code === 'KeyF') {
          e.preventDefault();
          this.captureAt(3840, 2160);
          return;
        }
        if (this.state === 'photo') {
          if (e.code === 'KeyF') { e.preventDefault(); this.capturePhoto(e.shiftKey); return; }
          if (e.code === 'KeyR') { this.photo.fov = 55; this.photo.focus = 20; this.updatePhotoHud(); return; }
          if (e.code === 'BracketLeft') { this.photo.focus = Math.max(2, this.photo.focus - 2); this.updatePhotoHud(); return; }
          if (e.code === 'BracketRight') { this.photo.focus = Math.min(80, this.photo.focus + 2); this.updatePhotoHud(); return; }
          if (e.code === 'Escape') { this.exitPhoto(); return; }
        }
        if (e.code === 'KeyR' && (this.state === 'play' || this.state === 'pause' || this.state === 'menu')) {
          e.preventDefault();
          this.cycleResolution();
          return;
        }
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

    async startTrailerRecording() {
      document.body.classList.add('record-mode');
      try {
        await this.audio.init();
        if (this.audio.ctx && this.audio.ctx.state === 'suspended') await this.audio.ctx.resume();
        this.audio.enterCue();
      } catch (e) {}
      this.state = 'cinematic';
      this.stateTime = 0;
      this.currentCaption = -1;
      this.perfTimer = 0;
      document.body.dataset.state = 'cinematic';
      if (this.post) this.post.resetTAA();
      this.updateCinematic(0);

      // Record at 1:1 720p with TAA disabled: this keeps the trailer crisp
      // and avoids temporal ghosting on the slow orbit shots.
      this.quality.sceneScale = 1.0;
      this.renderScale = 1.0;
      this.applySizes();
      if (this.post) this.post.opts.taa = false;

      this.recordCanvas = document.createElement('canvas');
      this.recordCanvas.width = 1280;
      this.recordCanvas.height = 720;
      this.recordCtx = this.recordCanvas.getContext('2d');
      const stream = new MediaStream();
      const videoStream = this.recordCanvas.captureStream(30);
      videoStream.getVideoTracks().forEach(t => stream.addTrack(t));
      const audioStream = this.audio.captureStream ? this.audio.captureStream() : null;
      if (audioStream) audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
      const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
      const mime = candidates.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || 'video/webm';
      this.recordMime = mime;
      this.recordChunks = [];
      this.recordRecorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 7000000,
        audioBitsPerSecond: 128000
      });
      this.recordRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) this.recordChunks.push(ev.data); };
      this.recordRecorder.onstop = () => this.finishTrailerRecording();
      this.recording = true;
      this.recordRecorder.start(1000);
      this.drawTrailerFrame();
    }

    drawTrailerFrame() {
      if (!this.recordCtx || !this.recordCanvas) return;
      const ctx = this.recordCtx, w = this.recordCanvas.width, h = this.recordCanvas.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      try { ctx.drawImage(this.renderer.domElement, 0, 0, w, h); } catch (e) {}
      const bar = 56;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
      // letterbox edge
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(0, bar, w, 1);
      ctx.fillRect(0, h - bar - 1, w, 1);
      const t = this.stateTime;
      // Filmic location card
      if (t > 0.8 && t < 7.5) {
        ctx.globalAlpha = Math.min(1, (t - 0.8) / 0.4) * Math.min(1, (7.5 - t) / 0.5);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(244,233,242,.72)';
        ctx.font = '600 13px Bahnschrift, "Microsoft YaHei", sans-serif';
        ctx.fillText('NEO-KYUSHU / 新九州', 44, 92);
        ctx.fillStyle = 'rgba(68,231,255,.72)';
        ctx.font = '400 9px "Cascadia Mono", Consolas, monospace';
        ctx.fillText('SECTOR 07  ·  KOWLOON UNIT', 44, 109);
        ctx.globalAlpha = 1;
      }
      // Top-right technical label
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,.32)';
      ctx.font = '400 8px "Cascadia Mono", Consolas, monospace';
      ctx.fillText('REAL-TIME PROCEDURAL DEMO  /  35MM', w - 42, 30);
      // Captions
      let cap = null;
      for (const c of this.captions) if (t >= c.t) cap = c;
      if (cap && t > cap.t + 0.2) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(244,233,242,.92)';
        ctx.font = '600 21px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText(cap.zh, w / 2, h - 96);
        ctx.fillStyle = 'rgba(190,218,235,.58)';
        ctx.font = '400 10px "Cascadia Mono", Consolas, monospace';
        ctx.fillText(cap.en, w / 2, h - 76);
      }
      // Opening / closing title
      let alpha = 0;
      if (t < 3.6) alpha = Math.sin((t / 3.6) * Math.PI);
      if (t > 63.2) alpha = Math.min(1, (t - 63.2) / 1.2);
      if (alpha > 0) {
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f4e9f2';
        ctx.font = '900 52px Bahnschrift, "Arial Narrow", sans-serif';
        ctx.fillText('NEON DISTRICT', w / 2, h / 2 - 4);
        ctx.fillStyle = 'rgba(255,46,139,.85)';
        ctx.font = '400 11px "Cascadia Mono", Consolas, monospace';
        ctx.fillText('雨夜街区  ·  SECTOR 07', w / 2, h / 2 + 25);
        ctx.globalAlpha = 1;
      }
      // Tiny frame counter / timecode
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.font = '400 8px "Cascadia Mono", Consolas, monospace';
      ctx.fillText('ND—07  ' + t.toFixed(2) + ' / ' + this.recordDuration.toFixed(1) + 'S', 44, h - 28);
    }

    stopTrailerRecording() {
      if (!this.recording) return;
      this.recording = false;
      this.state = 'shot';
      this.freeze = true;
      document.body.dataset.state = 'shot';
      try {
        if (this.recordRecorder && this.recordRecorder.state !== 'inactive') this.recordRecorder.stop();
      } catch (e) {}
    }

    finishTrailerRecording() {
      const blob = new Blob(this.recordChunks, { type: this.recordMime || 'video/webm' });
      this.recordChunks = [];
      const name = 'neon-district-trailer.webm';
      window.__TRAILER_BYTES = blob.size;
      fetch('/save-trailer', { method: 'POST', headers: { 'Content-Type': this.recordMime || 'video/webm' }, body: blob })
        .then(r => {
          if (!r.ok) throw new Error('save failed');
          window.__TRAILER_SAVED = true;
          document.title = 'NEON DISTRICT — TRAILER SAVED';
        })
        .catch(() => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = name; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
          window.__TRAILER_SAVED = false;
        });
    }

    startBenchmark() {
      if (!this.post) return;
      this.state = 'play';
      this.stateTime = 0;
      this.freeze = false;
      document.body.dataset.state = 'play';
      document.body.classList.add('bench-mode');
      $('menu').classList.remove('visible');
      $('hud').classList.remove('visible');
      $('pause').classList.remove('visible');
      this.player.pos.set(0, 0, 96);
      this.player.yaw = 0;
      this.player.pitch = 0.055;
      this.player.bob = 0;
      this.keys = {};
      this.benchMode = true;
      this.benchDone = false;
      this.benchElapsed = 0;
      this.benchWarmup = 1.2;
      this.benchTimes = [];
      this.frameTimes = [];
      this.perfPanel = true;
      $('perf-panel').classList.add('visible');
      $('perf-detail').textContent = 'BENCH START · ' + this.benchDuration + 'S';
      this.post.resetTAA();
      this.updatePlayer(0);
    }

    finishBenchmark() {
      const times = this.benchTimes;
      if (!times.length) return;
      const sorted = times.slice().sort((a, b) => a - b);
      const slowCount = Math.max(1, Math.round(sorted.length * 0.01));
      const slow = sorted.slice(-slowCount);
      const slowMean = slow.reduce((s, v) => s + v, 0) / slow.length;
      const mean = times.reduce((s, v) => s + v, 0) / times.length;
      const avgFps = 1000 / mean;
      const lowFps = 1000 / slowMean;
      this.benchResult = {
        duration: this.benchDuration,
        quality: this.qualityKey,
        resolution: this.renderer.domElement.width + 'x' + this.renderer.domElement.height,
        avgFps: +avgFps.toFixed(1),
        low1Fps: +lowFps.toFixed(1),
        frames: times.length
      };
      this.benchDone = true;
      this.benchMode = false;
      $('perf-detail').textContent = 'COMPLETE · AVG ' + avgFps.toFixed(1) + ' / 1% ' + lowFps.toFixed(1);
      console.log('NEON DISTRICT BENCH', JSON.stringify(this.benchResult));
    }

    updatePerf(dt) {
      const ms = Math.max(0.1, (this.rawDt || dt) * 1000);
      this.frameTimes.push(ms);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
      if (this.benchMode && !this.benchDone) {
        if (this.benchWarmup > 0) {
          this.benchWarmup -= dt;
        } else {
          this.benchTimes.push(ms);
          this.benchElapsed += ms / 1000;
          if (this.benchElapsed >= this.benchDuration) this.finishBenchmark();
        }
      }
      if (!this.perfPanel && !this.benchMode) return;
      this.perfUpdateTimer += dt;
      if (this.perfUpdateTimer < 0.25 && !this.benchDone) return;
      this.perfUpdateTimer = 0;
      const times = (this.benchDone ? this.benchTimes : this.frameTimes);
      if (!times.length) return;
      const sorted = times.slice().sort((a, b) => a - b);
      const slowCount = Math.max(1, Math.round(sorted.length * 0.01));
      const slow = sorted.slice(-slowCount);
      const slowMean = slow.reduce((s, v) => s + v, 0) / slow.length;
      const mean = times.reduce((s, v) => s + v, 0) / times.length;
      const fps = 1000 / mean;
      const low = 1000 / slowMean;
      const dom = this.renderer.domElement;
      const info = this.renderer.info.render;
      $('perf-fps').textContent = fps.toFixed(1);
      $('perf-low').textContent = low.toFixed(1);
      $('perf-res').textContent = dom.width + '×' + dom.height;
      $('perf-quality').textContent = this.qualityKey.toUpperCase() + ' / ' + this.renderScale.toFixed(2);
      $('perf-draw').textContent = info.calls;
      $('perf-tris').textContent = (info.triangles / 1000).toFixed(0) + 'K';
      if (this.benchMode && !this.benchDone) {
        $('perf-detail').textContent = 'RUNNING · ' + this.benchElapsed.toFixed(1) + ' / ' + this.benchDuration + 'S';
      } else if (this.benchDone) {
        $('perf-detail').textContent = 'COMPLETE · AVG ' + (this.benchResult ? this.benchResult.avgFps.toFixed(1) : fps.toFixed(1)) + ' / 1% ' + (this.benchResult ? this.benchResult.low1Fps.toFixed(1) : low.toFixed(1));
      }
    }

    togglePhoto() {
      if (this.state === 'photo') this.exitPhoto();
      else if (this.state === 'play' || this.state === 'pause' || this.state === 'menu') this.enterPhoto();
    }

    enterPhoto() {
      if (!this.post) return;
      this.photoReturn = this.state;
      this.photoPrevFreeze = this.freeze;
      this.photo = {
        pos: this.camera.position.clone(),
        yaw: this.camera.rotation.y,
        pitch: this.camera.rotation.x,
        fov: this.camera.fov,
        focus: 20
      };
      this.state = 'photo';
      this.freeze = true;
      this.keys = {};
      document.body.classList.add('photo-mode');
      document.body.dataset.state = 'photo';
      const saved = $('photo-saved'); if (saved) saved.textContent = '';
      this.updatePhoto(0);
      this.post.resetTAA();
    }

    exitPhoto() {
      const ret = this.photoReturn || 'play';
      document.body.classList.remove('photo-mode');
      this.freeze = this.photoPrevFreeze;
      this.state = ret;
      this.stateTime = 0;
      document.body.dataset.state = ret;
      this.photo = null;
      this.keys = {};
      if (ret === 'play') {
        $('hud').classList.add('visible');
        $('reticle').classList.add('visible');
        const c = $('scene');
        if (c && c.requestPointerLock) { try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
        this.showToast('已退出摄影模式 // PHOTO MODE OFF');
        setTimeout(() => this.showToast(''), 2200);
      } else if (ret === 'menu') {
        $('menu').classList.add('visible');
      } else if (ret === 'pause') {
        $('pause').classList.add('visible');
      }
      if (this.post) this.post.resetTAA();
    }

    updatePhoto(dt) {
      const p = this.photo;
      if (!p) return;
      const keys = this.keys;
      const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 9.0 : 3.6;
      let f = 0, r = 0, up = 0;
      if (keys['KeyW'] || keys['ArrowUp']) f += 1;
      if (keys['KeyS'] || keys['ArrowDown']) f -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) r += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) r -= 1;
      if (keys['KeyE']) up += 1;
      if (keys['KeyQ']) up -= 1;
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      p.pos.x += (r * cy - f * sy) * speed * dt;
      p.pos.z += (-r * sy - f * cy) * speed * dt;
      p.pos.y += up * speed * dt;
      p.pos.x = Math.max(-30, Math.min(30, p.pos.x));
      p.pos.y = Math.max(0.45, Math.min(45, p.pos.y));
      p.pos.z = Math.max(-100, Math.min(215, p.pos.z));
      this.camera.position.copy(p.pos);
      this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
      this.camera.fov = p.fov;
      this.camera.updateProjectionMatrix();
      this.updatePhotoHud();
    }

    updatePhotoHud() {
      const p = this.photo;
      if (!p) return;
      const stats = $('photo-stats');
      if (stats) stats.textContent = 'FOV ' + Math.round(p.fov) + ' · FOCUS ' + Math.round(p.focus) + 'M';
    }

    capturePhoto(fourK) {
      if (!this.post || !this.post.compositeRT) return;
      if (fourK) {
        this.captureAt(3840, 2160);
      } else {
        this.readComposite();
      }
    }

    readComposite(label) {
      const rt = this.post.compositeRT;
      if (!rt) return;
      const w = rt.width, h = rt.height;
      try {
        const buf = new Uint8Array(w * h * 4);
        this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(w, h);
        const row = w * 4;
        for (let y = 0; y < h; y++) {
          img.data.set(buf.subarray((h - 1 - y) * row, (h - y) * row), y * row);
        }
        ctx.putImageData(img, 0, 0);
        c.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'neon-district-' + w + 'x' + h + '-' + Date.now() + '.png';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          const saved = $('photo-saved');
          if (saved) saved.textContent = label || ('SAVED ' + w + '×' + h);
        }, 'image/png');
      } catch (e) {
        const saved = $('photo-saved');
        if (saved) saved.textContent = 'CAPTURE FAILED';
      }
    }

    captureAt(w, h) {
      const post = this.post;
      if (!post) return;
      const prev = {
        aspect: this.camera.aspect,
        sceneScale: post.opts.sceneScale,
        msaa: post.opts.msaa,
        taa: post.opts.taa,
        ssr: post.opts.ssr
      };
      try {
        // A 4K still is rendered as a one-off full-resolution frame. TAA is
        // bypassed so we only need one 4K scene target.
        post.opts.sceneScale = 1.0;
        post.opts.msaa = 0;
        post.opts.taa = false;
        post.opts.ssr = false;
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(w, h, false);
        post.setSize(w, h, 1);
        this.world.setSize(w, h, 1);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        post.render(this.scene, this.camera, this.world, this.time, 0);
        this.readComposite('SAVED ' + w + '×' + h);
      } catch (e) {
        const saved = $('photo-saved');
        if (saved) saved.textContent = '4K CAPTURE FAILED';
      } finally {
        post.opts.sceneScale = prev.sceneScale;
        post.opts.msaa = prev.msaa;
        post.opts.taa = prev.taa;
        post.opts.ssr = prev.ssr;
        this.renderer.setPixelRatio(1);
        this.applySizes();
        this.camera.aspect = prev.aspect;
        this.camera.updateProjectionMatrix();
        post.resetTAA();
      }
    }

    toggleMute() {
      this.audio.init();
      const muted = this.audio.toggleMute();
      $('btn-mute').classList.toggle('muted', muted);
      $('btn-mute').querySelector('.label').textContent = muted ? '静音' : '声音';
      this.showToast(muted ? '声音关闭 // AUDIO OFF' : '声音开启 // AUDIO ON');
      setTimeout(() => this.showToast(''), 2200);
    }


    minRenderScale() {
      if (this.resolutionMode === '4k') return 0.5;
      return this.resolutionMode === '2k' ? 0.75 : 0.62;
    }

    updateResolutionLabel() {
      const value = this.resolutionMode === '4k' ? '4K' : (this.resolutionMode === '2k' ? '2K' : '1080P');
      const el = $('res-label');
      if (el) el.textContent = value;
      const p = $('pause-res-label');
      if (p) p.textContent = value;
    }

    cycleResolution() {
      this.resolutionMode = this.resolutionMode === '2k' ? '1080' : (this.resolutionMode === '4k' ? '1080' : '2k');
      try { localStorage.setItem('nd-resolution', this.resolutionMode); } catch (e) {}
      this.renderScale = 1.0;
      this.autoScaleTimer = 0;
      this.autoScaleCooldown = 0;
      this.applySizes();
      if (this.post) this.post.resetTAA();
      this.updateResolutionLabel();
      const label = this.resolutionMode === '2k' ? '2K 2560×1440' : '1080P 1920×1080';
      this.showToast('输出分辨率：' + label);
      setTimeout(() => this.showToast(''), 2600);
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
      const p = $('pause-quality-label');
      if (p) p.textContent = this.quality.name;
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
      const targetH = this.resolutionMode === '4k' ? 2160 : (this.resolutionMode === '2k' ? 1440 : 1080);
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      const targetW = Math.round(targetH * aspect);
      const w = Math.max(1, Math.round(targetW * this.renderScale));
      const h = Math.max(1, Math.round(targetH * this.renderScale));
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(w, h, false);
      if (this.post) this.post.setSize(w, h, 1);
      if (this.world) this.world.setSize(w, h, 1);
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
        shops: { p: [0, 2.0, -25], l: [0, 4.0, -58], fov: 72 },
        whale: { p: [0, 4.8, -47], l: [0, 16.0, -61.5], fov: 58 },
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
      $('cine-title').classList.toggle('visible', elapsed > 64.0);
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
        if (this.player.stepTimer <= 0) {
          this.player.stepTimer = speed > 4 ? 0.27 : 0.43;
          this.audio.step();
        }
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
      if (this.world) {
        this.world.cameraYaw = this.camera.rotation.y;
        this.world.lightningCameraPos.copy(this.camera.position);
      }
      const worldDt = this.state === 'photo' ? 0 : dt;
      this.world.update(worldDt, this.time, this.camera);
      if (this.world.rain) this.world.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
      if (this.world.rainNear) this.world.rainNear.position.set(this.camera.position.x, 0, this.camera.position.z);
      if (this.world.airDust) this.world.airDust.position.set(this.camera.position.x, 0, this.camera.position.z);
      if (this.state === 'menu') this.updateMenuCamera(dt, this.time);
      else if (this.state === 'cinematic') { this.updateCinematic(dt); if (this.stateTime > 68.2) { this.stateTime = 0; this.currentCaption = -1; } }
      else if (this.state === 'photo') {
        this.updatePhoto(dt);
      }
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
      if (this.state === 'photo') {
        look.uFocus.value = this.photo.focus;
        look.uDof.value = 0.18;
      } else if (this.recording) {
        // Keep the recorded trailer crisp; the cinematic still carries depth via framing.
        look.uFocus.value = this.cineFocus || 28;
        look.uDof.value = 0.03;
      } else if (this.state === 'cinematic') {
        look.uFocus.value = this.cineFocus || 28;
        look.uDof.value = this.cineDof || 0.45;
      } else {
        look.uFocus.value = this.state === 'menu' ? 24 : 20;
        look.uDof.value = this.state === 'shot' ? 0.0 : 0.12;
      }
      this.audio.update(dt, this.camera, this.world);
      // FPS instrumentation
      this.fpsAccum += dt; this.fpsFrames++;
      if (this.fpsAccum > 0.6) {
        this.fps = this.fpsFrames / this.fpsAccum;
        this.fpsAccum = 0; this.fpsFrames = 0;
        this.updateHUD();
        if ((this.state === 'play' || this.state === 'cinematic') && !this.benchMode) {
          this.perfTimer += dt;
          if (this.fps < 47 && this.renderScale > this.minRenderScale()) {
            this.autoScaleCooldown += 0.6;
            if (this.autoScaleCooldown > 2.4) {
              this.autoScaleCooldown = 0;
              this.renderScale = Math.max(this.minRenderScale(), this.renderScale - 0.08);
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
          if (this.perfTimer > 8 && this.fps < 24 && this.renderScale <= this.minRenderScale() + 0.04 && this.qualityKey !== 'low') {
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
      this.updatePerf(dt);
      this.post.render(this.scene, this.camera, this.world, this.time, this.world.flash);
      if (this.recording) {
        this.drawTrailerFrame();
        if (this.stateTime >= this.recordDuration) this.stopTrailerRecording();
      }
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
