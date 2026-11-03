/* =========================================================================
   NEON DISTRICT — procedural ambience. No audio files, only rain and voltage.
   ========================================================================= */
(function () {
  'use strict';
  const ND = (window.ND = window.ND || {});

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.muted = false;
      this.nextThunder = 18 + Math.random() * 20;
      this.master = null;
      this.captureDest = null;
      this.rainGain = null;
      this.padGain = null;
      this.humGain = null;
      this.neonBuzzGain = null;
      this.ambient = null;
      this.ambientClock = 0;
      this.detailClock = 2.4;
      this.trainClock = 26 + Math.random() * 30;
      this.flybyClock = 14 + Math.random() * 18;
      this.sirenClock = 55 + Math.random() * 70;
      this.lastCamera = null;
    }

    async init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        return;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 16;
      comp.ratio.value = 4;
      comp.attack.value = 0.01;
      comp.release.value = 0.3;
      master.connect(comp).connect(ctx.destination);
      this.master = master;

      // shared procedural reverb impulse
      const len = ctx.sampleRate * 3.1;
      const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const env = Math.pow(1 - i / len, 2.8);
          data[i] = (Math.random() * 2 - 1) * env * (0.6 + Math.sin(i * 0.0007 + ch) * 0.1);
        }
      }
      const verb = ctx.createConvolver();
      verb.buffer = impulse;
      const verbGain = ctx.createGain();
      verbGain.gain.value = 0.22;
      verb.connect(verbGain).connect(master);
      this.verb = verb;

      const noiseBuf = ctx.createBuffer(2, ctx.sampleRate * 6, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = noiseBuf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      this.noiseBuf = noiseBuf;

      // rain — filtered stereo noise
      const rain = this._loopNoise(noiseBuf);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; hp.Q.value = 0.4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9500; lp.Q.value = 0.2;
      const rg = ctx.createGain(); rg.gain.value = 0.14;
      rain.connect(hp).connect(lp).connect(rg).connect(master);
      this.rainGain = rg;
      // distant rain body
      const rain2 = this._loopNoise(noiseBuf);
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 600;
      const rg2 = ctx.createGain(); rg2.gain.value = 0.08;
      rain2.connect(lp2).connect(rg2).connect(master);

      // city hum
      const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 49;
      const hum2 = ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 98;
      const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 180; hf.Q.value = 3;
      const hg = ctx.createGain(); hg.gain.value = 0.022;
      hum.connect(hf); hum2.connect(hf); hf.connect(hg).connect(master);
      hum.start(); hum2.start();
      this.humGain = hg;

      // minor-key synth bed
      const padGain = ctx.createGain(); padGain.gain.value = 0.028;
      const padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 760; padFilter.Q.value = 0.8;
      padFilter.connect(padGain).connect(master);
      padGain.connect(verb);
      this.padFilter = padFilter;
      const notes = [73.42, 110.0, 146.83, 174.61, 220.0];
      this.padOscs = [];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 16;
        const g = ctx.createGain(); g.gain.value = i === 0 ? 0.12 : 0.055;
        o.connect(g).connect(padFilter);
        o.start();
        this.padOscs.push(o);
      });
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 380;
      lfo.connect(lfoGain).connect(padFilter.frequency);
      lfo.start();

      // neon transformer buzz
      const buzz = ctx.createOscillator(); buzz.type = 'square'; buzz.frequency.value = 119.7;
      const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 420; bf.Q.value = 12;
      const bg = ctx.createGain(); bg.gain.value = 0.003;
      buzz.connect(bf).connect(bg).connect(master); buzz.start();
      this.neonBuzzGain = bg;

      this._buildAmbient();

      master.gain.setTargetAtTime(this.muted ? 0 : 0.55, ctx.currentTime, 1.2);
      this.ready = true;
    }

    _loopNoise(buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer; src.loop = true;
      src.start();
      return src;
    }

    _buildAmbient() {
      const ctx = this.ctx;
      const makePanner = () => {
        if (!ctx.createStereoPanner) return null;
        const p = ctx.createStereoPanner();
        p.pan.value = 0;
        p.connect(this.master);
        return p;
      };
      const makeBus = (panner) => {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(panner || this.master);
        return g;
      };
      const noiseLayer = (bus, type, freq, q, level) => {
        const src = this._loopNoise(this.noiseBuf);
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = level;
        src.connect(f).connect(g).connect(bus);
        return { src, f, g };
      };

      // night-market crowd: two bands of body noise, slowly breathing
      const crowdP = makePanner();
      const crowdG = makeBus(crowdP);
      noiseLayer(crowdG, 'bandpass', 430, 0.55, 0.55);
      noiseLayer(crowdG, 'bandpass', 1180, 0.9, 0.22);
      const crowdLfo = ctx.createOscillator(); crowdLfo.frequency.value = 0.09;
      const crowdLfoGain = ctx.createGain(); crowdLfoGain.gain.value = 0.22;
      const crowdMod = ctx.createGain(); crowdMod.gain.value = 1.0;
      crowdG.disconnect(); crowdG.connect(crowdMod).connect(crowdP || this.master);
      crowdLfo.connect(crowdLfoGain).connect(crowdMod.gain); crowdLfo.start();

      // fountain / pool water
      const waterP = makePanner();
      const waterG = makeBus(waterP);
      noiseLayer(waterG, 'highpass', 1700, 0.55, 0.5);
      noiseLayer(waterG, 'bandpass', 420, 1.1, 0.25);

      // hologram whale: sub-bass pressure + a glassy carrier
      const whaleP = makePanner();
      const whaleG = makeBus(whaleP);
      const whaleNotes = [[37.5, 0.55, 'sine'], [56.25, 0.3, 'sine'], [112.5, 0.13, 'triangle']];
      for (const [freq, level, type] of whaleNotes) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = (Math.random() - 0.5) * 7;
        const g = ctx.createGain(); g.gain.value = level;
        o.connect(g).connect(whaleG); o.start();
      }
      noiseLayer(whaleG, 'bandpass', 2600, 1.4, 0.035);
      const whaleLfo = ctx.createOscillator(); whaleLfo.frequency.value = 0.07;
      const whaleLfoGain = ctx.createGain(); whaleLfoGain.gain.value = 0.18;
      const whaleMod = ctx.createGain(); whaleMod.gain.value = 1.0;
      whaleG.disconnect(); whaleG.connect(whaleMod).connect(whaleP || this.master);
      whaleLfo.connect(whaleLfoGain).connect(whaleMod.gain); whaleLfo.start();

      // steam / vent hiss
      const steamP = makePanner();
      const steamG = makeBus(steamP);
      noiseLayer(steamG, 'highpass', 2400, 0.45, 0.6);
      noiseLayer(steamG, 'bandpass', 5200, 0.8, 0.2);

      this.ambient = {
        crowd: { g: crowdG, p: crowdP, mod: crowdMod },
        water: { g: waterG, p: waterP },
        whale: { g: whaleG, p: whaleP, mod: whaleMod },
        steam: { g: steamG, p: steamP }
      };
    }

    _spatial(x, z, camera, minDist, maxDist, y) {
      const dx = x - camera.position.x;
      const dy = (y == null ? 1.1 : y) - camera.position.y;
      const dz = z - camera.position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const t = Math.max(0, Math.min(1, (d - minDist) / Math.max(0.001, maxDist - minDist)));
      const fade = 1 - t * t * (3 - 2 * t);
      const fwd = new THREE.Vector3();
      const right = new THREE.Vector3();
      const to = new THREE.Vector3(dx, 0, dz).normalize();
      camera.getWorldDirection(fwd);
      right.crossVectors(fwd, camera.up).normalize();
      return { gain: fade * fade, pan: Math.max(-0.82, Math.min(0.82, to.dot(right))), dist: d };
    }

    _setBus(loop, level, sp) {
      if (!loop) return;
      const t = this.ctx.currentTime;
      loop.g.gain.setTargetAtTime(Math.max(0, level * sp.gain), t, 0.22);
      if (loop.p) loop.p.pan.setTargetAtTime(sp.pan, t, 0.28);
    }

    updateAmbient(dt, camera, world) {
      if (!this.ambient || !camera) return;
      this.ambientClock -= dt;
      if (this.ambientClock <= 0) {
        this.ambientClock = 0.14;
        const t = this.ctx.currentTime;
        this._setBus(this.ambient.crowd, 0.022 * (0.82 + 0.18 * Math.sin(t * 0.12)), this._spatial(0, 124, camera, 9, 58, 2.0));
        this._setBus(this.ambient.water, 0.020, this._spatial(0, -61.5, camera, 3, 36, 0.7));
        this._setBus(this.ambient.whale, 0.055, this._spatial(0, -61.5, camera, 5, 54, 16));
        let steam = null, sd = 1e9;
        for (const v of (world && world._steamVents) || []) {
          const dx = v.x - camera.position.x, dz = v.z - camera.position.z;
          const d = dx * dx + dz * dz;
          if (d < sd) { sd = d; steam = v; }
        }
        if (steam) this._setBus(this.ambient.steam, 0.013, this._spatial(steam.x, steam.z, camera, 2, 22, 0.4));
        let nd = 1e9;
        for (const s of (world && world.lifeSigns) || []) {
          const dx = s.x - camera.position.x, dz = s.z - camera.position.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < nd) nd = d;
        }
        if (this.neonBuzzGain) {
          const near = nd < 18 ? 0.0045 * (1 - nd / 18) : 0;
          this.neonBuzzGain.gain.setTargetAtTime(0.0022 + near, t, 0.3);
        }
        if (this.rainGain) {
          this.rainGain.gain.setTargetAtTime(0.135 + 0.018 * Math.sin(t * 0.16) + 0.008 * Math.sin(t * 0.53), t, 0.8);
        }
      }

      this.detailClock -= dt;
      if (this.detailClock <= 0) {
        this.detailClock = 0.95 + Math.random() * 3.2;
        this._randomDetail(camera, world);
      }
      this.trainClock -= dt;
      if (this.trainClock <= 0) { this.train(); this.trainClock = 58 + Math.random() * 52; }
      this.flybyClock -= dt;
      if (this.flybyClock <= 0) { this.flyby(); this.flybyClock = 26 + Math.random() * 30; }
      this.sirenClock -= dt;
      if (this.sirenClock <= 0) { this.siren(); this.sirenClock = 75 + Math.random() * 80; }
    }

    _randomDetail(camera, world) {
      const x = camera.position.x, z = camera.position.z;
      let nearShop = false;
      for (const s of (world && world.lifeSigns) || []) {
        if (Math.abs(s.z - z) < 20) { nearShop = true; break; }
      }
      const r = Math.random();
      if (nearShop && r < 0.46) {
        const s = world.lifeSigns[Math.floor(Math.random() * world.lifeSigns.length)];
        const sp = this._spatial(s.x, s.z, camera, 1.5, 24, 2.8);
        this.neonTick(sp.pan, 0.004 + 0.008 * sp.gain);
      } else if (Math.abs(z + 61.5) < 34 && r < 0.58) {
        const pan = (x - 0) / 30;
        this.waterPlink(Math.max(-0.7, Math.min(0.7, pan)), 0.008);
      } else {
        this.drip(Math.random() * 1.6 - 0.8, 0.006 + Math.random() * 0.006);
      }
    }

    lifeEvent(ev) {
      if (!this.ready || !ev || !this.lastCamera) return;
      if (ev.type === 'neon') {
        const sp = this._spatial(ev.x || 0, ev.z || 0, this.lastCamera, 2, 26, 3.0);
        this.neonTick(sp.pan, 0.004 + 0.010 * sp.gain);
      }
    }

    _panner(pan) {
      if (!this.ctx.createStereoPanner) return null;
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      p.connect(this.master);
      return p;
    }

    drip(pan, vol) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const out = this._panner(pan) || this.master;
      const o = ctx.createOscillator(); o.type = 'sine';
      const f0 = 1400 + Math.random() * 1200;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + 0.055);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.14);
    }

    waterPlink(pan, vol) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const out = this._panner(pan) || this.master;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(620 + Math.random() * 220, t);
      o.frequency.exponentialRampToValueAtTime(280, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.22);
      if (this.verb) { const s = ctx.createGain(); s.gain.value = 0.1; g.connect(s).connect(this.verb); }
    }

    neonTick(pan, vol) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const out = this._panner(pan) || this.master;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 118 + Math.random() * 10;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 360; bp.Q.value = 7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.065);
      o.connect(bp).connect(g).connect(out); o.start(t); o.stop(t + 0.08);
      const ns = ctx.createBufferSource(); ns.buffer = this.noiseBuf;
      const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2600;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.8, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      ns.connect(nf).connect(ng).connect(out); ns.start(t); ns.stop(t + 0.04);
    }

    train() {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const pan = Math.random() * 1.2 - 0.6;
      const out = this._panner(pan) || this.master;
      const dist = this.lastCamera ? Math.abs(this.lastCamera.position.z - 76) : 50;
      const att = Math.max(0.2, Math.min(1, 1 - dist / 170));
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(140, t); f.frequency.exponentialRampToValueAtTime(72, t + 8);
      f.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.026 * att, t + 2.2);
      g.gain.linearRampToValueAtTime(0.032 * att, t + 4.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 9.0);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 9.2);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(34, t); o.frequency.linearRampToValueAtTime(27, t + 7);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.020 * att, t + 2.5); og.gain.exponentialRampToValueAtTime(0.0001, t + 8.4);
      o.connect(og).connect(out); o.start(t); o.stop(t + 8.6);
      // brake squeal at the far end
      const sq = ctx.createBufferSource(); sq.buffer = this.noiseBuf; sq.loop = true;
      const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 980; sf.Q.value = 16;
      const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t + 5.2); sg.gain.linearRampToValueAtTime(0.0035 * att, t + 6.1); sg.gain.exponentialRampToValueAtTime(0.0001, t + 8.2);
      sq.connect(sf).connect(sg).connect(out); sq.start(t + 5.0); sq.stop(t + 8.4);
    }

    flyby() {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const pan = Math.random() * 1.5 - 0.75;
      const out = this._panner(pan) || this.master;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(280, t);
      f.frequency.exponentialRampToValueAtTime(1900, t + 1.1);
      f.frequency.exponentialRampToValueAtTime(320, t + 3.0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.026, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 3.3);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(66, t + 2.6);
      const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 420;
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.010, t + 0.7); og.gain.exponentialRampToValueAtTime(0.0001, t + 2.9);
      o.connect(of).connect(og).connect(out); o.start(t); o.stop(t + 3.0);
    }

    siren() {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const out = this._panner(Math.random() * 1.4 - 0.7) || this.master;
      const o = ctx.createOscillator(); o.type = 'triangle';
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.008, t + 0.8);
      g.gain.linearRampToValueAtTime(0.0001, t + 5.0);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      for (let i = 0; i < 4; i++) {
        o.frequency.setValueAtTime(440 + (i % 2) * 110, t + i * 1.15);
        o.frequency.linearRampToValueAtTime(560 - (i % 2) * 40, t + i * 1.15 + 0.55);
      }
      o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 5.0);
      if (this.verb) { const s = ctx.createGain(); s.gain.value = 0.2; g.connect(s).connect(this.verb); }
    }

    captureStream() {
      if (!this.ctx || !this.master) return null;
      if (!this.captureDest) {
        this.captureDest = this.ctx.createMediaStreamDestination();
        this.master.connect(this.captureDest);
      }
      return this.captureDest.stream;
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.15);
    }

    toggleMute() { this.setMuted(!this.muted); return this.muted; }

    update(dt, camera, world) {
      if (!this.ready) return;
      if (this.padFilter) {
        this.padFilter.frequency.value = 620 + Math.sin(this.ctx.currentTime * 0.05) * 220;
      }
      if (camera) {
        this.lastCamera = camera;
        this.updateAmbient(dt, camera, world);
      }
    }

    thunder(opts) {
      if (!this.ctx || !this.master) return;
      opts = opts || {};
      const ctx = this.ctx;
      const distance = opts.distance || 1400;
      const intensity = Math.max(0.15, Math.min(1, opts.intensity || 0.6));
      const pan = Math.max(-1, Math.min(1, opts.pan || 0));
      const t = ctx.currentTime;
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      let out = this.master;
      if (panner) { panner.pan.value = pan; panner.connect(this.master); out = panner; }
      const vol = 0.045 + intensity * 0.17;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(Math.max(85, 180 - distance * 0.035), t);
      f.frequency.exponentialRampToValueAtTime(70, t + 4.5);
      f.Q.value = 0.65;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.32);
      g.gain.exponentialRampToValueAtTime(vol * 0.48, t + 1.7);
      g.gain.exponentialRampToValueAtTime(vol * 0.2, t + 3.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6.2);
      src.connect(f).connect(g).connect(out);
      if (this.verb) {
        const send = ctx.createGain(); send.gain.value = 0.18;
        g.connect(send).connect(this.verb);
      }
      src.start(t);
      src.stop(t + 6.4);
      // second rolling body, slightly later
      const src2 = ctx.createBufferSource();
      src2.buffer = this.noiseBuf; src2.loop = true;
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 92; f2.Q.value = 0.7;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t + 0.55);
      g2.gain.linearRampToValueAtTime(vol * 0.45, t + 1.25);
      g2.gain.exponentialRampToValueAtTime(vol * 0.28, t + 3.0);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 6.0);
      src2.connect(f2).connect(g2).connect(out);
      src2.start(t + 0.55); src2.stop(t + 6.2);
      // sub-bass pressure
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(44, t); o.frequency.exponentialRampToValueAtTime(27, t + 3.4);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.07 + intensity * 0.055, t + 0.4);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 4.0);
      o.connect(og).connect(out); o.start(t); o.stop(t + 4.1);
    }

    enterCue() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      // synthetic riser / title sting
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(65, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.45); o.frequency.exponentialRampToValueAtTime(48, t + 1.8);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.4); f.frequency.exponentialRampToValueAtTime(300, t + 1.8);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 2.3);
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.setValueAtTime(300, t); nf.frequency.exponentialRampToValueAtTime(4000, t + 0.5);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.09, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      n.connect(nf).connect(ng).connect(this.master); n.start(t); n.stop(t + 0.8);
    }

    step() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 120 + Math.random() * 60; f.Q.value = 2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + 0.15);
    }

    zoneCue() {
      if (!this.ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      [329.63, 392.0, 523.25, 659.25].forEach((freq, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.075, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 1.1);
        o.connect(g).connect(this.master); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 1.2);
      });
    }
  }

  ND.AudioEngine = AudioEngine;
})();
