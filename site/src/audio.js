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
      this.rainGain = null;
      this.padGain = null;
      this.humGain = null;
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
      const bg = ctx.createGain(); bg.gain.value = 0.006;
      buzz.connect(bf).connect(bg).connect(master); buzz.start();

      master.gain.setTargetAtTime(this.muted ? 0 : 0.55, ctx.currentTime, 1.2);
      this.ready = true;
    }

    _loopNoise(buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer; src.loop = true;
      src.start();
      return src;
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.15);
    }

    toggleMute() { this.setMuted(!this.muted); return this.muted; }

    update(dt) {
      if (!this.ready) return;
      this.nextThunder -= dt;
      if (this.nextThunder <= 0) {
        this.nextThunder = 18 + Math.random() * 26;
        this.thunder();
      }
      if (this.padFilter) {
        this.padFilter.frequency.value = 620 + Math.sin(this.ctx.currentTime * 0.05) * 220;
      }
    }

    thunder() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 190; f.Q.value = 0.6;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.045, t + 1.4);
      g.gain.exponentialRampToValueAtTime(0.001, t + 4.0);
      src.connect(f).connect(g).connect(this.master);
      src.start(t); src.stop(t + 4.2);
      // sub rumble
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(52, t); o.frequency.exponentialRampToValueAtTime(28, t + 2.5);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.12, t); og.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
      o.connect(og).connect(this.master); o.start(t); o.stop(t + 2.8);
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
