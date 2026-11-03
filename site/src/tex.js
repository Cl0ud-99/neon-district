/* =========================================================================
   NEON DISTRICT — procedural texture atelier
   Every pixel in this demo is painted at runtime. No external image assets.
   ========================================================================= */
(function () {
  'use strict';
  const ND = (window.ND = window.ND || {});
  const T = {};

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgba(hex, a) {
    const [r, g, b] = hexRgb(hex);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function noiseLayer(ctx, w, h, seed, amount, mono) {
    const rnd = mulberry32(seed);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * amount;
      if (mono) {
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      } else {
        d[i] += n; d[i + 1] += n * 0.8; d[i + 2] += n * 1.1;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function scanlines(ctx, w, h, spacing, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    for (let y = 0; y < h; y += spacing) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }

  function vignette(ctx, w, h, strength) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, 'rgba(0,0,0,' + strength * 0.3 + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  function grain(ctx, w, h, seed, strength) {
    const rnd = mulberry32(seed);
    const count = Math.floor(w * h * 0.025);
    ctx.save();
    for (let i = 0; i < count; i++) {
      const x = rnd() * w, y = rnd() * h;
      const a = rnd() * strength;
      ctx.fillStyle = rnd() > 0.45 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a * 1.6 + ')';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  function barcode(ctx, x, y, w, h, seed) {
    const rnd = mulberry32(seed);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    let px = x;
    while (px < x + w) {
      const bw = Math.max(1, Math.floor(rnd() * 4));
      if (rnd() > 0.36) ctx.fillRect(px, y, bw, h);
      px += bw + Math.max(1, Math.floor(rnd() * 3));
    }
    ctx.restore();
  }

  function neonText(ctx, text, x, y, size, color, font, align, blur) {
    ctx.save();
    ctx.font = '700 ' + size + 'px ' + (font || '"Bahnschrift Condensed","Arial Narrow","Microsoft YaHei",sans-serif');
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = blur == null ? size * 0.55 : blur;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = blur == null ? size * 0.2 : blur * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function label(ctx, text, x, y, size, color, tracking, alpha) {
    ctx.save();
    ctx.font = '400 ' + size + 'px "Bahnschrift","Arial Narrow",sans-serif';
    ctx.fillStyle = color || 'rgba(255,255,255,.72)';
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const chars = String(text).split('');
    let px = x;
    for (const ch of chars) { ctx.fillText(ch, px, y); px += ctx.measureText(ch).width + (tracking || 0); }
    ctx.restore();
  }

  /* -----------------------------------------------------------------------
     Building facades. 512 x 1024 window grids with grime, blinds, cables.
     ----------------------------------------------------------------------- */
  T.facade = function (seed, palette) {
    const W = 512, H = 1024;
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    const rnd = mulberry32(seed);
    const pal = palette || ['#ffb066', '#ffd28f', '#66e6ff', '#ff5dbb'];

    const base = x.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#17131d');
    base.addColorStop(0.5, '#0b0b13');
    base.addColorStop(1, '#1a151f');
    x.fillStyle = base; x.fillRect(0, 0, W, H);

    // large concrete panels
    for (let i = 0; i < 7; i++) {
      const px = (i / 7) * W + (rnd() - 0.5) * 18;
      x.fillStyle = 'rgba(255,255,255,' + (0.01 + rnd() * 0.025) + ')';
      x.fillRect(px, 0, 1, H);
    }
    for (let i = 0; i < 10; i++) {
      const py = rnd() * H;
      x.fillStyle = 'rgba(0,0,0,.24)'; x.fillRect(0, py, W, 1);
    }

    // window grid — tall, slightly asymmetric tenement windows
    const cols = 7, rows = 17;
    const mx = 24, my = 24;
    const cw = (W - mx * 2) / cols;
    const ch = (H - my * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const wx = mx + col * cw + cw * 0.18;
        const wy = my + r * ch + ch * 0.18;
        const ww = cw * 0.64;
        const wh = ch * 0.56;

        // recess / frame
        x.fillStyle = 'rgba(2,3,7,.92)';
        x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        x.fillStyle = 'rgba(160,180,205,.055)';
        x.fillRect(wx - 3, wy - 3, ww + 6, 1);

        const lit = rnd();
        const colPick = pal[Math.floor(rnd() * pal.length)];
        if (lit > 0.48) {
          const g = x.createLinearGradient(wx, wy, wx, wy + wh);
          const cool = colPick === '#66e6ff';
          g.addColorStop(0, cool ? 'rgba(78,190,220,.78)' : rgba(colPick, 0.82));
          g.addColorStop(0.7, cool ? 'rgba(16,48,70,.66)' : 'rgba(55,32,38,.74)');
          g.addColorStop(1, 'rgba(6,7,14,.92)');
          x.fillStyle = g; x.fillRect(wx, wy, ww, wh);

          // window interior silhouettes / blinds
          if (rnd() > 0.55) {
            x.fillStyle = 'rgba(6,4,9,.50)';
            const blindY = wy + wh * (0.18 + rnd() * 0.5);
            for (let b = blindY; b < wy + wh; b += 3) x.fillRect(wx, b, ww, 1);
          }
          if (rnd() > 0.74) {
            x.fillStyle = 'rgba(0,0,0,.42)';
            x.fillRect(wx + ww * (0.15 + rnd() * 0.5), wy + wh * 0.45, ww * 0.25, wh * 0.55);
          }
          x.save();
          x.globalCompositeOperation = 'lighter';
          x.shadowColor = colPick; x.shadowBlur = 15;
          x.fillStyle = rgba(colPick, 0.17);
          x.fillRect(wx, wy, ww, wh);
          x.restore();
        } else {
          const g = x.createLinearGradient(wx, wy, wx, wy + wh);
          g.addColorStop(0, 'rgba(14,20,31,.9)');
          g.addColorStop(1, 'rgba(3,5,10,.95)');
          x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
          x.fillStyle = 'rgba(100,168,220,.08)';
          x.fillRect(wx + ww * 0.1, wy + wh * 0.1, ww * 0.22, wh * 0.8);
          // broken pane
          if (rnd() > 0.9) {
            x.strokeStyle = 'rgba(120,165,190,.35)'; x.lineWidth = 1;
            x.beginPath(); x.moveTo(wx + ww * 0.2, wy); x.lineTo(wx + ww * 0.55, wy + wh * 0.6); x.lineTo(wx + ww * 0.35, wy + wh); x.stroke();
          }
        }
        // mullions
        x.fillStyle = 'rgba(2,3,7,.7)';
        x.fillRect(wx + ww * 0.5, wy, 1.5, wh);
        x.fillRect(wx, wy + wh * 0.55, ww, 1);

        // grime drips
        if (rnd() > 0.68) {
          x.fillStyle = 'rgba(0,0,0,.14)';
          x.fillRect(wx + rnd() * ww, wy + wh, 1 + rnd() * 2, 8 + rnd() * 30);
        }
      }
      // floor ledges
      const ly = my + r * ch;
      x.fillStyle = 'rgba(255,255,255,.03)'; x.fillRect(0, ly, W, 1.5);
      x.fillStyle = 'rgba(0,0,0,.34)'; x.fillRect(0, ly + 2, W, 2);
    }

    // vertical conduits and cable clutter
    for (let i = 0; i < 9; i++) {
      const px = rnd() * W;
      x.strokeStyle = 'rgba(8,9,14,.8)'; x.lineWidth = 1 + rnd() * 3;
      x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + 6, H * 0.3, px - 5, H * 0.7, px + 2, H); x.stroke();
      x.strokeStyle = 'rgba(155,170,190,.07)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(px - 1, 0); x.lineTo(px + 1, H); x.stroke();
    }
    // random vent boxes
    for (let i = 0; i < 13; i++) {
      const bx = rnd() * W, by = rnd() * H;
      x.fillStyle = 'rgba(10,11,16,.9)'; x.fillRect(bx, by, 22, 15);
      x.strokeStyle = 'rgba(180,195,210,.1)'; x.strokeRect(bx + 0.5, by + 0.5, 21, 14);
      for (let l = 2; l < 13; l += 3) { x.fillStyle = 'rgba(90,100,118,.18)'; x.fillRect(bx + 2, by + l, 18, 1); }
    }
    // grime gradient near roof / base
    const grime = x.createLinearGradient(0, 0, 0, H);
    grime.addColorStop(0, 'rgba(4,4,8,.4)');
    grime.addColorStop(0.15, 'rgba(0,0,0,0)');
    grime.addColorStop(0.82, 'rgba(8,4,8,0)');
    grime.addColorStop(1, 'rgba(0,0,0,.5)');
    x.fillStyle = grime; x.fillRect(0, 0, W, H);

    noiseLayer(x, W, H, seed + 3, 16, true);
    return c;
  };

  // A grayscale height field matching the 7 x 17 window grid. Used as a
  // bump map on distant facades so mullions and sill shadows catch the neon.
  T.facadeBump = function () {
    const W = 256, H = 512;
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    x.fillStyle = '#b4b4b4'; x.fillRect(0, 0, W, H);
    const cols = 7, rows = 17, mx = 12, my = 12;
    const cw = (W - mx * 2) / cols, ch = (H - my * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const wx = mx + col * cw + cw * 0.18;
        const wy = my + r * ch + ch * 0.18;
        const ww = cw * 0.64, wh = ch * 0.56;
        x.fillStyle = '#252525'; x.fillRect(wx, wy, ww, wh);
        x.fillStyle = '#555555'; x.fillRect(wx + ww * 0.5, wy, 1.5, wh);
        x.fillStyle = '#555555'; x.fillRect(wx, wy + wh * 0.55, ww, 1.5);
      }
      const ly = my + r * ch;
      x.fillStyle = '#d0d0d0'; x.fillRect(0, ly, W, 1.5);
      x.fillStyle = '#666666'; x.fillRect(0, ly + 2, W, 2);
    }
    x.fillStyle = '#e0e0e0'; x.fillRect(0, 0, W, 4);
    x.fillStyle = '#4a4a4a'; x.fillRect(0, H - 5, W, 5);
    return c;
  };

  // Soft vertical streak sprite for the foreground rain point layer.
  T.rainStreak = function () {
    const W = 64, H = 256;
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(190,225,255,0)');
    g.addColorStop(0.18, 'rgba(210,238,255,.9)');
    g.addColorStop(0.72, 'rgba(170,220,255,.65)');
    g.addColorStop(1, 'rgba(120,180,255,0)');
    x.fillStyle = g;
    x.fillRect(25, 0, 14, H);
    x.globalCompositeOperation = 'lighter';
    x.shadowColor = 'rgba(130,210,255,.85)'; x.shadowBlur = 14;
    x.fillStyle = 'rgba(220,245,255,.55)'; x.fillRect(29, 0, 6, H);
    return c;
  };

  /* -----------------------------------------------------------------------
     Billboard artwork. Built around bold silhouettes and type so they read
     even after being blurred by bloom and rain.
     ----------------------------------------------------------------------- */
  function posterBase(w, h, seed, colorA, colorB) {
    const c = makeCanvas(w, h);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, colorA); g.addColorStop(1, colorB);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const rnd = mulberry32(seed);
    // smoked glass / paper texture
    for (let i = 0; i < 18; i++) {
      const rg = x.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, w * (0.15 + rnd() * 0.4));
      rg.addColorStop(0, 'rgba(255,255,255,' + (0.01 + rnd() * 0.035) + ')');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg; x.fillRect(0, 0, w, h);
    }
    return { c, x, rnd };
  }

  function finishPoster(c, x, w, h, seed, opts) {
    opts = opts || {};
    if (opts.scan !== false) scanlines(x, w, h, 3, 0.13);
    if (opts.border !== false) {
      x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = Math.max(2, w * 0.003);
      x.strokeRect(w * 0.035, h * 0.035, w * 0.93, h * 0.93);
    }
    grain(x, w, h, seed + 1, 0.055);
    vignette(x, w, h, 0.5);
    return c;
  }

  function drawCircuit(x, rnd, w, h, color) {
    x.save();
    x.strokeStyle = color; x.globalAlpha = 0.45; x.lineWidth = 1.2;
    for (let i = 0; i < 22; i++) {
      let px = rnd() * w, py = rnd() * h;
      x.beginPath(); x.moveTo(px, py);
      for (let s = 0; s < 4; s++) {
        px += (rnd() - 0.5) * w * 0.14;
        py += (rnd() - 0.5) * h * 0.08;
        x.lineTo(px, py);
      }
      x.stroke();
      x.fillStyle = color; x.fillRect(px - 2, py - 2, 4, 4);
    }
    x.restore();
  }

  T.ad = function (kind, w, h, seed) {
    w = w || 720; h = h || 1000;
    const S = Math.min(w, h);
    const seedv = seed || 1;
    const rnd0 = mulberry32(seedv * 31 + 7);
    let P, x, c;

    if (kind === 'kitsune') {
      P = posterBase(w, h, seedv, '#120318', '#26052d'); x = P.x; c = P.c;
      const g = x.createRadialGradient(w * 0.54, h * 0.32, 0, w * 0.54, h * 0.32, S * 0.48);
      g.addColorStop(0, 'rgba(255,48,150,.58)'); g.addColorStop(0.45, 'rgba(83,18,110,.24)'); g.addColorStop(1, 'rgba(5,2,12,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,220,255,.06)'; x.beginPath(); x.arc(w * 0.52, h * 0.34, S * 0.31, 0, TAU); x.fill();
      // fox mask
      x.save(); x.translate(w * 0.52, h * 0.39);
      const sc = S / 720;
      x.scale(sc, sc);
      x.beginPath();
      x.moveTo(0, 138); x.lineTo(-42, 240); x.lineTo(-148, 260); x.lineTo(-118, 126);
      x.lineTo(-154, 22); x.lineTo(-76, 76); x.lineTo(0, 38); x.lineTo(76, 76);
      x.lineTo(154, 22); x.lineTo(118, 126); x.lineTo(148, 260); x.lineTo(42, 240); x.closePath();
      const mg = x.createLinearGradient(-150, -50, 150, 260);
      mg.addColorStop(0, 'rgba(235,244,255,.85)'); mg.addColorStop(0.5, 'rgba(255,186,225,.56)'); mg.addColorStop(1, 'rgba(255,42,145,.34)');
      x.fillStyle = mg; x.fill();
      x.strokeStyle = '#ff73c4'; x.lineWidth = 4; x.shadowColor = '#ff2e9a'; x.shadowBlur = 24; x.stroke();
      // eyes
      x.shadowColor = '#5df6ff'; x.shadowBlur = 20;
      x.fillStyle = '#7df8ff';
      x.beginPath(); x.moveTo(-110, 120); x.lineTo(-40, 104); x.lineTo(-62, 136); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(110, 120); x.lineTo(40, 104); x.lineTo(62, 136); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 1.2;
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 18, 124); x.lineTo(i * 23, 210); x.stroke(); }
      x.restore();
      neonText(x, '狐', w * 0.08, h * 0.33, S * 0.19, '#ffd9ef', '"Yu Gothic","Microsoft YaHei",serif', 'left', S * 0.06);
      neonText(x, 'KITSUNE', w * 0.08, h * 0.76, S * 0.105, '#ff4fae', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 22);
      label(x, 'SYNTHETIC SPIRITS / 合成魂', w * 0.085, h * 0.815, S * 0.024, 'rgba(255,220,245,.72)', 2.4);
      label(x, 'NEO-KOWLOON  ·  2099', w * 0.085, h * 0.85, S * 0.018, 'rgba(255,255,255,.44)', 3);
      barcode(x, w * 0.08, h * 0.89, w * 0.28, h * 0.025, seedv + 4);
      drawCircuit(x, P.rnd, w, h, 'rgba(255,110,190,.9)');
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'axiom') {
      P = posterBase(w, h, seedv, '#02070f', '#061a26'); x = P.x; c = P.c;
      // android profile
      x.save(); x.translate(w * 0.5, h * 0.48);
      const sc = S / 720; x.scale(sc, sc);
      x.beginPath();
      x.moveTo(-110, -250); x.bezierCurveTo(-220, -170, -205, -20, -150, 110);
      x.lineTo(-80, 230); x.lineTo(0, 260); x.lineTo(80, 230); x.lineTo(150, 110);
      x.bezierCurveTo(205, -20, 220, -170, 110, -250); x.lineTo(40, -300); x.lineTo(0, -270); x.lineTo(-40, -300); x.closePath();
      const fg = x.createLinearGradient(-180, -280, 180, 240);
      fg.addColorStop(0, 'rgba(190,245,255,.72)'); fg.addColorStop(0.38, 'rgba(95,150,190,.45)'); fg.addColorStop(1, 'rgba(5,12,25,.84)');
      x.fillStyle = fg; x.fill();
      x.strokeStyle = 'rgba(103,244,255,.75)'; x.lineWidth = 3; x.shadowColor = '#22e7ff'; x.shadowBlur = 22; x.stroke();
      // visor
      x.fillStyle = 'rgba(255,26,126,.82)'; x.shadowColor = '#ff1a7e'; x.shadowBlur = 28;
      x.fillRect(-130, -92, 260, 31);
      x.fillStyle = 'rgba(255,240,255,.9)'; x.fillRect(-102, -87, 34, 5);
      // jaw vents
      x.shadowBlur = 0; x.strokeStyle = 'rgba(170,240,255,.45)';
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 20, 115); x.lineTo(i * 23, 168); x.stroke(); }
      x.restore();
      neonText(x, 'AXIOM', w * 0.1, h * 0.13, S * 0.13, '#6af4ff', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 24);
      label(x, 'ANDROID SYSTEMS  /  MODEL 07', w * 0.105, h * 0.17, S * 0.02, 'rgba(205,250,255,.62)', 2.6);
      neonText(x, '超越人类', w * 0.1, h * 0.83, S * 0.075, '#ff3d94', '"Yu Gothic","Microsoft YaHei",sans-serif', 'left', 18);
      label(x, 'BEYOND HUMAN — AXIOM.CORP', w * 0.105, h * 0.87, S * 0.019, 'rgba(255,255,255,.46)', 2.8);
      drawCircuit(x, P.rnd, w, h, 'rgba(89,230,255,.8)');
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'geisha') {
      P = posterBase(w, h, seedv, '#14030e', '#2b0618'); x = P.x; c = P.c;
      const rad = x.createRadialGradient(w * 0.5, h * 0.4, 10, w * 0.5, h * 0.42, S * 0.44);
      rad.addColorStop(0, 'rgba(255,68,138,.4)'); rad.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rad; x.fillRect(0, 0, w, h);
      x.save(); x.translate(w * 0.51, h * 0.42); const sc = S / 760; x.scale(sc, sc);
      // neck + face
      x.fillStyle = 'rgba(238,218,218,.82)';
      x.beginPath(); x.moveTo(-48, 180); x.lineTo(-28, 286); x.lineTo(28, 286); x.lineTo(48, 180); x.closePath(); x.fill();
      const fg = x.createRadialGradient(-30, -80, 10, 0, 0, 220);
      fg.addColorStop(0, 'rgba(255,245,244,.96)'); fg.addColorStop(0.72, 'rgba(232,203,206,.82)'); fg.addColorStop(1, 'rgba(115,76,94,.52)');
      x.fillStyle = fg;
      x.beginPath(); x.ellipse(0, -20, 140, 195, 0, 0, TAU); x.fill();
      // hair
      x.fillStyle = 'rgba(8,5,12,.96)';
      x.beginPath(); x.ellipse(0, -125, 150, 128, 0, Math.PI, TAU); x.fill();
      x.beginPath(); x.ellipse(-120, -20, 40, 160, 0.16, 0, TAU); x.fill();
      x.beginPath(); x.ellipse(120, -20, 40, 160, -0.16, 0, TAU); x.fill();
      // neon hair pin
      x.strokeStyle = '#ff4fa8'; x.shadowColor = '#ff2a8f'; x.shadowBlur = 20; x.lineWidth = 5;
      x.beginPath(); x.moveTo(-120, -170); x.lineTo(-40, -240); x.stroke();
      x.fillStyle = '#8ff8ff'; x.shadowColor = '#5af4ff'; x.beginPath(); x.arc(-39, -241, 8, 0, TAU); x.fill();
      // eyes and lips
      x.shadowBlur = 0; x.strokeStyle = 'rgba(18,8,16,.9)'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(-82, -38); x.quadraticCurveTo(-55, -55, -26, -38); x.stroke();
      x.beginPath(); x.moveTo(26, -38); x.quadraticCurveTo(55, -55, 82, -38); x.stroke();
      x.fillStyle = 'rgba(20,6,12,.92)'; x.beginPath(); x.ellipse(-55, -24, 6, 9, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(55, -24, 6, 9, 0, 0, TAU); x.fill();
      x.fillStyle = '#d11f5a'; x.beginPath(); x.ellipse(0, 62, 24, 9, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.arc(-14, 59, 3, 0, TAU); x.fill();
      x.restore();
      neonText(x, '芸者', w * 0.09, h * 0.5, S * 0.18, '#ffc7dc', '"Yu Gothic","Microsoft YaHei",serif', 'left', 26);
      neonText(x, 'GEISHA // 2099', w * 0.08, h * 0.82, S * 0.072, '#ff5cad', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 20);
      label(x, 'THE LAST FACE OF OLD KOWLOON', w * 0.085, h * 0.865, S * 0.018, 'rgba(255,225,240,.52)', 2.2);
      drawCircuit(x, P.rnd, w, h, 'rgba(255,120,190,.7)');
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'car') {
      P = posterBase(w, h, seedv, '#030814', '#0b081b'); x = P.x; c = P.c;
      // sun disc and grid horizon
      x.fillStyle = 'rgba(255,35,135,.25)'; x.beginPath(); x.arc(w * 0.55, h * 0.32, S * 0.27, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,93,179,.45)'; x.lineWidth = 1;
      for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(0, h * 0.56 + i * i * 1.5); x.lineTo(w, h * 0.56 + i * i * 1.5); x.stroke(); }
      for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(w * 0.5 + i * w * 0.06, h * 0.55); x.lineTo(w * 0.5 + i * w * 0.22, h); x.stroke(); }
      // car silhouette
      x.save(); x.translate(w * 0.5, h * 0.62); const sc = S / 800; x.scale(sc, sc);
      const cg = x.createLinearGradient(0, -90, 0, 100);
      cg.addColorStop(0, 'rgba(255,120,225,.95)'); cg.addColorStop(0.44, 'rgba(130,72,190,.92)'); cg.addColorStop(1, 'rgba(18,20,42,.96)');
      x.fillStyle = cg;
      x.beginPath();
      x.moveTo(-280, 30); x.lineTo(-216, -20); x.lineTo(-124, -36); x.lineTo(-58, -108); x.lineTo(74, -112);
      x.lineTo(152, -32); x.lineTo(244, -16); x.lineTo(294, 30); x.lineTo(280, 72); x.lineTo(-270, 72); x.closePath();
      x.fill();
      x.strokeStyle = '#ff8dea'; x.lineWidth = 3; x.shadowColor = '#ff3fae'; x.shadowBlur = 26; x.stroke();
      // cabin
      x.fillStyle = 'rgba(12,20,38,.92)';
      x.beginPath(); x.moveTo(-48, -96); x.lineTo(62, -98); x.lineTo(122, -36); x.lineTo(-95, -36); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(133,243,255,.72)'; x.lineWidth = 2; x.stroke();
      // wheels
      for (const wx of [-176, 190]) {
        x.fillStyle = '#05060c'; x.beginPath(); x.arc(wx, 66, 48, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(255,95,190,.9)'; x.lineWidth = 3; x.shadowColor = '#ff2f9a'; x.shadowBlur = 14; x.beginPath(); x.arc(wx, 66, 43, 0, TAU); x.stroke();
      }
      // underglow
      const ug = x.createLinearGradient(0, 66, 0, 140); ug.addColorStop(0, 'rgba(83,244,255,.8)'); ug.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = ug; x.fillRect(-250, 72, 500, 65);
      x.restore();
      neonText(x, 'NOVA', w * 0.09, h * 0.12, S * 0.17, '#8ef7ff', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 30);
      label(x, 'GT // ELECTRIC DREAMS', w * 0.095, h * 0.17, S * 0.021, 'rgba(235,220,255,.68)', 3);
      neonText(x, 'NOVA GT', w * 0.09, h * 0.86, S * 0.08, '#ff53b5', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 20);
      label(x, '0—300 IN 2.1 SECONDS', w * 0.095, h * 0.9, S * 0.019, 'rgba(255,240,255,.46)', 2.7);
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'ramen') {
      P = posterBase(w, h, seedv, '#190804', '#2b0d05'); x = P.x; c = P.c;
      const rg = x.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.5, S * 0.5);
      rg.addColorStop(0, 'rgba(255,158,68,.4)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(0, 0, w, h);
      // lanterns
      for (let i = 0; i < 2; i++) {
        const lx = w * (0.16 + i * 0.68), ly = h * 0.18 + i * h * 0.05;
        x.fillStyle = 'rgba(255,45,50,.92)'; x.shadowColor = '#ff3338'; x.shadowBlur = 22;
        x.beginPath(); x.ellipse(lx, ly, S * 0.045, S * 0.062, 0, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(255,224,150,.7)'; x.lineWidth = 2;
        x.beginPath(); x.ellipse(lx, ly, S * 0.045, S * 0.062, 0, 0, TAU); x.stroke();
        x.fillStyle = 'rgba(255,207,111,.9)'; x.fillRect(lx - 1, ly - S * 0.085, 2, S * 0.02);
      }
      // bowl
      x.save(); x.translate(w * 0.5, h * 0.54); const sc = S / 700; x.scale(sc, sc);
      x.shadowColor = '#ff9d4a'; x.shadowBlur = 20;
      x.fillStyle = 'rgba(22,14,16,.95)'; x.beginPath(); x.arc(0, 0, 210, 0.08, Math.PI - 0.08); x.lineTo(-115, 190); x.quadraticCurveTo(0, 245, 115, 190); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,192,100,.75)'; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 210, 0.08, Math.PI - 0.08); x.stroke();
      x.fillStyle = 'rgba(255,194,102,.9)'; x.fillRect(-207, -8, 414, 12);
      // noodles
      x.strokeStyle = 'rgba(255,227,151,.92)'; x.lineWidth = 5;
      for (let i = -5; i <= 5; i++) { x.beginPath(); x.moveTo(i * 22, -18); x.bezierCurveTo(i * 40, 30, i * 8, 60, i * 30, 105); x.stroke(); }
      // egg + chashu
      x.fillStyle = 'rgba(255,231,155,.95)'; x.beginPath(); x.ellipse(-85, -22, 53, 38, -0.25, 0, TAU); x.fill();
      x.fillStyle = '#ff9d33'; x.beginPath(); x.arc(-83, -20, 18, 0, TAU); x.fill();
      x.fillStyle = 'rgba(101,42,36,.95)'; x.beginPath(); x.ellipse(80, -15, 64, 42, 0.22, 0, TAU); x.fill();
      // steam
      x.strokeStyle = 'rgba(255,240,220,.5)'; x.lineWidth = 7; x.shadowColor = '#fff'; x.shadowBlur = 10;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(-60 + i * 62, -210); x.bezierCurveTo(-30 + i * 70, -300, -95 + i * 65, -340, -30 + i * 70, -410); x.stroke(); }
      x.restore();
      neonText(x, '拉麺', w * 0.09, h * 0.12, S * 0.18, '#ffc46b', '"Yu Gothic","Microsoft YaHei",serif', 'left', 26);
      neonText(x, 'RAMEN 24H', w * 0.09, h * 0.81, S * 0.085, '#ff6b4f', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 20);
      label(x, 'HOT BOWLS · COLD RAIN · SECTOR 07', w * 0.095, h * 0.855, S * 0.02, 'rgba(255,230,200,.6)', 2.4);
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'eye') {
      P = posterBase(w, h, seedv, '#02080d', '#04151b'); x = P.x; c = P.c;
      const cx = w * 0.5, cy = h * 0.4;
      for (let i = 11; i > 0; i--) {
        x.strokeStyle = 'rgba(78,244,255,' + (0.035 + i * 0.012) + ')';
        x.lineWidth = 1.5;
        x.beginPath(); x.arc(cx, cy, S * (0.12 + i * 0.025), 0, TAU); x.stroke();
      }
      const eyeG = x.createRadialGradient(cx, cy, 2, cx, cy, S * 0.23);
      eyeG.addColorStop(0, 'rgba(255,255,255,.95)'); eyeG.addColorStop(0.18, 'rgba(128,255,255,.92)'); eyeG.addColorStop(0.55, 'rgba(18,112,154,.9)'); eyeG.addColorStop(1, 'rgba(2,9,16,.9)');
      x.fillStyle = eyeG; x.beginPath(); x.arc(cx, cy, S * 0.23, 0, TAU); x.fill();
      x.fillStyle = '#031018'; x.beginPath(); x.arc(cx, cy, S * 0.085, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.arc(cx - S * 0.04, cy - S * 0.05, S * 0.022, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(112,246,255,.55)'; x.lineWidth = 2;
      for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; x.beginPath(); x.moveTo(cx + Math.cos(a) * S * 0.24, cy + Math.sin(a) * S * 0.24); x.lineTo(cx + Math.cos(a) * S * (0.26 + (i % 5) * 0.012), cy + Math.sin(a) * S * (0.26 + (i % 5) * 0.012)); x.stroke(); }
      drawCircuit(x, P.rnd, w, h, 'rgba(89,245,255,.9)');
      neonText(x, 'OPTIC', w * 0.09, h * 0.1, S * 0.12, '#6ff6ff', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 24);
      neonText(x, '视觉', w * 0.09, h * 0.78, S * 0.12, '#ff5ba9', '"Yu Gothic","Microsoft YaHei",sans-serif', 'left', 22);
      label(x, 'AUGMENTED PERCEPTION / V.9', w * 0.095, h * 0.84, S * 0.019, 'rgba(200,250,255,.55)', 2.6);
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'koi') {
      P = posterBase(w, h, seedv, '#020d16', '#061727'); x = P.x; c = P.c;
      const rad = x.createRadialGradient(w * 0.5, h * 0.4, 10, w * 0.5, h * 0.4, S * 0.5);
      rad.addColorStop(0, 'rgba(28,226,255,.23)'); rad.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rad; x.fillRect(0, 0, w, h);
      x.save(); x.translate(w * 0.51, h * 0.4); x.rotate(-0.28); const sc = S / 720; x.scale(sc, sc);
      x.shadowColor = '#43e9ff'; x.shadowBlur = 30; x.strokeStyle = 'rgba(95,245,255,.9)'; x.lineWidth = 4;
      // body
      x.beginPath(); x.moveTo(-220, 0); x.bezierCurveTo(-120, -120, 130, -150, 230, -10); x.bezierCurveTo(110, 130, -110, 120, -220, 0); x.closePath();
      x.fillStyle = 'rgba(25,110,145,.24)'; x.fill(); x.stroke();
      // tail
      x.beginPath(); x.moveTo(-210, 0); x.bezierCurveTo(-310, -90, -380, -50, -390, 15); x.bezierCurveTo(-320, 15, -295, 90, -210, 40); x.stroke();
      // fins
      x.beginPath(); x.moveTo(-20, -100); x.bezierCurveTo(35, -190, 115, -170, 90, -90); x.stroke();
      x.beginPath(); x.moveTo(-10, 100); x.bezierCurveTo(25, 180, 105, 170, 75, 90); x.stroke();
      // scales
      for (let i = 0; i < 7; i++) for (let j = -3; j <= 3; j++) {
        x.beginPath(); x.arc(-130 + i * 52, j * 24 + (i % 2) * 10, 19, 0.3, Math.PI - 0.3); x.strokeStyle = 'rgba(130,245,255,.28)'; x.lineWidth = 1; x.stroke();
      }
      // head eye
      x.fillStyle = '#ff4fa4'; x.shadowColor = '#ff2b8e'; x.shadowBlur = 18; x.beginPath(); x.arc(165, -20, 12, 0, TAU); x.fill();
      x.restore();
      neonText(x, '錦鯉', w * 0.08, h * 0.11, S * 0.15, '#8ff8ff', '"Yu Gothic","Microsoft YaHei",serif', 'left', 26);
      neonText(x, 'KIRIN', w * 0.08, h * 0.8, S * 0.12, '#ff5bad', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 24);
      label(x, 'LUCKY SIGNAL / 幸运信号', w * 0.085, h * 0.855, S * 0.02, 'rgba(210,250,255,.6)', 2.5);
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'city') {
      P = posterBase(w, h, seedv, '#10051c', '#250a2e'); x = P.x; c = P.c;
      // big magenta sun
      const sg = x.createLinearGradient(0, h * 0.16, 0, h * 0.66);
      sg.addColorStop(0, '#ffd0e0'); sg.addColorStop(0.35, '#ff4d9d'); sg.addColorStop(1, '#5e1377');
      x.fillStyle = sg; x.beginPath(); x.arc(w * 0.5, h * 0.39, S * 0.27, 0, TAU); x.fill();
      for (let i = 0; i < 10; i++) { x.fillStyle = i % 2 ? 'rgba(18,4,25,.6)' : 'rgba(18,4,25,.2)'; x.fillRect(0, h * (0.4 + i * 0.022), w, h * 0.009); }
      // skyline silhouettes
      x.fillStyle = 'rgba(7,4,16,.92)';
      let px = 0;
      const rnd = P.rnd;
      while (px < w) {
        const bw = 20 + rnd() * 70, bh = h * (0.05 + rnd() * 0.22);
        x.fillRect(px, h * 0.58 - bh, bw, bh + h * 0.3);
        x.fillStyle = 'rgba(255,116,198,.5)';
        for (let wy = h * 0.58 - bh + 10; wy < h * 0.86; wy += 16) for (let wx = px + 6; wx < px + bw - 4; wx += 10) if (rnd() > 0.65) x.fillRect(wx, wy, 2.5, 2.5);
        x.fillStyle = 'rgba(7,4,16,.92)';
        px += bw + 5 + rnd() * 18;
      }
      // wet street reflection streaks
      for (let i = 0; i < 40; i++) {
        x.fillStyle = 'rgba(' + (120 + rnd() * 135) + ',' + (20 + rnd() * 80) + ',' + (140 + rnd() * 115) + ',' + (0.06 + rnd() * 0.18) + ')';
        x.fillRect(rnd() * w, h * 0.78 + rnd() * h * 0.2, 2 + rnd() * 4, 10 + rnd() * 90);
      }
      neonText(x, 'NEO KOWLOON', w * 0.075, h * 0.105, S * 0.085, '#ff85cc', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 20);
      label(x, 'THE CITY THAT NEVER DRIES', w * 0.08, h * 0.89, S * 0.02, 'rgba(255,225,245,.55)', 3);
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'void') {
      P = posterBase(w, h, seedv, '#03060b', '#07151c'); x = P.x; c = P.c;
      const cx = w * 0.5, cy = h * 0.42;
      const glow = x.createRadialGradient(cx, cy, 0, cx, cy, S * 0.32);
      glow.addColorStop(0, 'rgba(125,245,255,.8)'); glow.addColorStop(0.5, 'rgba(30,130,180,.2)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = glow; x.beginPath(); x.arc(cx, cy, S * 0.32, 0, TAU); x.fill();
      // can
      x.save(); x.translate(cx, cy); const sc = S / 700; x.scale(sc, sc);
      const cg = x.createLinearGradient(-95, 0, 95, 0); cg.addColorStop(0, 'rgba(13,35,48,.95)'); cg.addColorStop(0.35, 'rgba(188,255,255,.9)'); cg.addColorStop(0.55, 'rgba(34,80,100,.95)'); cg.addColorStop(1, 'rgba(3,12,20,.98)');
      x.fillStyle = cg; x.fillRect(-95, -240, 190, 470);
      x.fillStyle = 'rgba(125,248,255,.9)'; x.beginPath(); x.ellipse(0, -240, 95, 23, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(9,15,25,.9)'; x.fillRect(-96, -30, 192, 80);
      x.fillStyle = 'rgba(255,255,255,.95)'; x.font = '700 50px "Bahnschrift Condensed",sans-serif'; x.textAlign = 'center'; x.fillText('VOID', 0, 25);
      x.strokeStyle = 'rgba(160,250,255,.9)'; x.lineWidth = 3; x.strokeRect(-95, -240, 190, 470);
      // lightning
      x.strokeStyle = 'rgba(220,255,255,.9)'; x.shadowColor = '#5ff4ff'; x.shadowBlur = 20; x.lineWidth = 4;
      x.beginPath(); x.moveTo(-230, -210); x.lineTo(-160, -110); x.lineTo(-210, -94); x.lineTo(-128, 10); x.stroke();
      x.restore();
      neonText(x, 'VOID', w * 0.09, h * 0.1, S * 0.14, '#9dfbff', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 26);
      label(x, 'ZERO CALORIE ENERGY / 零度能量', w * 0.095, h * 0.155, S * 0.019, 'rgba(205,255,255,.6)', 2.5);
      neonText(x, '虚空能量', w * 0.09, h * 0.81, S * 0.085, '#ff56a8', '"Yu Gothic","Microsoft YaHei",sans-serif', 'left', 18);
      return finishPoster(c, x, w, h, seedv);

    } else if (kind === 'type') {
      P = posterBase(w, h, seedv, '#08030b', '#15051b'); x = P.x; c = P.c;
      // oversized typographic poster
      x.save();
      x.translate(w * 0.5, h * 0.5);
      x.rotate(-0.04);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '900 ' + (S * 0.72) + 'px "Yu Gothic","Microsoft YaHei",sans-serif';
      x.fillStyle = 'rgba(255,30,120,.88)'; x.fillText('雨', 10, 0);
      x.fillStyle = 'rgba(85,245,255,.8)'; x.fillText('雨', -10, 4);
      x.fillStyle = 'rgba(255,245,255,.95)'; x.fillText('雨', 0, 0);
      x.restore();
      x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 1;
      for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(0, i * h / 12); x.lineTo(w, i * h / 12); x.stroke(); }
      neonText(x, 'RAIN', w * 0.08, h * 0.08, S * 0.09, '#ff65b6', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 16);
      label(x, '永不停止 / NEVER STOPS', w * 0.085, h * 0.91, S * 0.02, 'rgba(255,230,245,.6)', 2.4);
      return finishPoster(c, x, w, h, seedv);

    } else {
      // 'mecha'
      P = posterBase(w, h, seedv, '#090a0c', '#17110c'); x = P.x; c = P.c;
      x.save(); x.translate(w * 0.5, h * 0.42); const sc = S / 720; x.scale(sc, sc);
      x.fillStyle = 'rgba(34,39,50,.95)';
      x.beginPath(); x.moveTo(-130, -100); x.lineTo(-90, -240); x.lineTo(90, -240); x.lineTo(130, -100); x.lineTo(90, 120); x.lineTo(0, 185); x.lineTo(-90, 120); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,130,50,.8)'; x.lineWidth = 3; x.shadowColor = '#ff6e2e'; x.shadowBlur = 18; x.stroke();
      x.fillStyle = '#ff3d24'; x.shadowColor = '#ff2e16'; x.shadowBlur = 24; x.fillRect(-74, -60, 148, 20);
      x.fillStyle = 'rgba(255,214,165,.7)'; x.fillRect(-60, -56, 38, 5);
      x.strokeStyle = 'rgba(255,160,80,.4)'; x.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 24, 40); x.lineTo(i * 28, 100); x.stroke(); }
      x.restore();
      neonText(x, 'TYPE—07', w * 0.08, h * 0.1, S * 0.105, '#ff9a4d', '"Bahnschrift Condensed","Arial Narrow",sans-serif', 'left', 22);
      label(x, 'KOWLOON DEFENSE INDUSTRIES', w * 0.085, h * 0.155, S * 0.019, 'rgba(255,230,205,.55)', 2.5);
      neonText(x, '钢铁', w * 0.08, h * 0.81, S * 0.12, '#ff4d2a', '"Yu Gothic","Microsoft YaHei",sans-serif', 'left', 20);
      label(x, 'HEAVY INDUSTRY / 重工业', w * 0.085, h * 0.875, S * 0.019, 'rgba(255,230,205,.55)', 2.6);
      drawCircuit(x, P.rnd, w, h, 'rgba(255,140,60,.8)');
      return finishPoster(c, x, w, h, seedv);
    }
  };

  /* Soft radial glow used by light shafts, lamps and particles. */
  T.glow = function (size, inner, outer) {
    size = size || 128;
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner || 'rgba(255,255,255,1)');
    g.addColorStop(0.18, inner || 'rgba(255,255,255,.8)');
    g.addColorStop(0.5, outer || 'rgba(255,255,255,.20)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  };

  /* Soft contact shadow blob for characters and street props. */
  T.shadowBlob = function (size) {
    size = size || 128;
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,.72)');
    g.addColorStop(0.35, 'rgba(0,0,0,.5)');
    g.addColorStop(0.72, 'rgba(0,0,0,.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(size / 2, size / 2, size / 2, 0, TAU); x.fill();
    return c;
  };

  /* Soft smoke puff for steam vents and low fog. */
  T.smoke = function (size, seed) {
    size = size || 128;
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const rnd = mulberry32(seed || 5);
    for (let i = 0; i < 15; i++) {
      const px = size * (0.25 + rnd() * 0.5), py = size * (0.25 + rnd() * 0.5);
      const rad = size * (0.12 + rnd() * 0.33);
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.04 + rnd() * 0.08) + ')');
      g.addColorStop(0.55, 'rgba(255,255,255,' + (0.02 + rnd() * 0.04) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, TAU); x.fill();
    }
    // feather the edge
    const vg = x.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = vg; x.fillRect(0, 0, size, size);
    return c;
  };

  T.bokeh = function (size) {
    size = size || 64;
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  };

  T.environment = function () {
    const W = 1024, H = 512;
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#020308');
    bg.addColorStop(0.44, '#09071a');
    bg.addColorStop(0.62, '#1b0b2c');
    bg.addColorStop(0.8, '#160820');
    bg.addColorStop(1, '#050309');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    const rnd = mulberry32(44221);
    const glows = [
      [210, 286, 120, 'rgba(255,38,145,.28)'],
      [686, 310, 150, 'rgba(54,230,255,.22)'],
      [880, 280, 110, 'rgba(255,154,54,.24)'],
      [460, 330, 170, 'rgba(130,65,255,.16)']
    ];
    for (const [gx, gy, gr, col] of glows) {
      const gg = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, col); gg.addColorStop(0.4, col.replace(/,([0-9.]+)\)$/, ',0.06)')); gg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gg; x.fillRect(0, 0, W, H);
    }
    // vertical neon smear under the horizon
    for (let i = 0; i < 60; i++) {
      const px = rnd() * W;
      const py = 280 + rnd() * 180;
      const h = 40 + rnd() * 170;
      const col = ['rgba(255,61,160,.13)', 'rgba(45,225,255,.11)', 'rgba(255,168,62,.10)', 'rgba(138,88,255,.10)'][i % 4];
      const g = x.createLinearGradient(px, py, px, py + h);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(px, py, 1 + rnd() * 5, h);
    }
    // cloud haze
    for (let i = 0; i < 20; i++) {
      const gx = rnd() * W, gy = rnd() * H * 0.55, gr = 40 + rnd() * 160;
      const g = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, 'rgba(120,110,170,.035)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    noiseLayer(x, W, H, 773, 10, true);
    return c;
  };

  T.shutter = function (seed) {
    const W = 512, H = 512;
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    const rnd = mulberry32(seed || 1);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c1a1e'); g.addColorStop(0.5, '#111015'); g.addColorStop(1, '#07070b');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 12) {
      x.fillStyle = y % 24 === 0 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.28)';
      x.fillRect(0, y, W, 3);
    }
    x.strokeStyle = 'rgba(255,255,255,.09)'; x.lineWidth = 3; x.strokeRect(9, 9, W - 18, H - 18);
    // tags and rust blooms
    const colors = ['rgba(255,52,145,.38)', 'rgba(53,221,255,.32)', 'rgba(255,177,70,.32)'];
    for (let i = 0; i < 5; i++) {
      const px = rnd() * W, py = 70 + rnd() * H * 0.8;
      x.strokeStyle = colors[i % colors.length]; x.lineWidth = 6 + rnd() * 8; x.lineCap = 'round';
      x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + 30, py - 20, px + 48, py + 28, px + 95, py + 10); x.stroke();
    }
    x.fillStyle = 'rgba(7,4,8,.72)'; x.fillRect(30, 210, 190, 60);
    x.font = '400 25px "Bahnschrift",sans-serif'; x.fillStyle = 'rgba(255,93,142,.75)'; x.fillText('CLOSED', 52, 248);
    for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, H - 10 - i * 2, W, 3); }
    noiseLayer(x, W, H, seed + 33, 16, true);
    return c;
  };

  T.interior = function (seed, warm) {
    const W = 256, H = 256;
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    const rnd = mulberry32(seed || 3);
    const g = x.createLinearGradient(0, 0, 0, H);
    if (warm) {
      g.addColorStop(0, '#ffbf7a'); g.addColorStop(0.4, '#ae633d'); g.addColorStop(1, '#28151a');
    } else {
      g.addColorStop(0, '#7be9ff'); g.addColorStop(0.4, '#236679'); g.addColorStop(1, '#07131d');
    }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // back wall / shelves
    x.fillStyle = 'rgba(2,4,8,.35)'; x.fillRect(0, H * 0.65, W, H * 0.35);
    x.fillStyle = 'rgba(20,12,12,.7)'; x.fillRect(18, H * 0.62, W - 36, 7);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = 'rgba(' + (80 + rnd() * 100 | 0) + ',' + (50 + rnd() * 80 | 0) + ',' + (35 + rnd() * 50 | 0) + ',.5)';
      x.fillRect(24 + i * 26, H * 0.62 - 18 - rnd() * 28, 8 + rnd() * 9, 18 + rnd() * 28);
    }
    // dark interior silhouette
    x.fillStyle = 'rgba(3,4,8,.62)';
    x.beginPath(); x.arc(W * (0.2 + rnd() * 0.6), H * 0.62, 26, 0, TAU); x.fill();
    x.fillRect(W * (0.2 + rnd() * 0.6) - 20, H * 0.62, 40, 70);
    // curtains
    x.fillStyle = 'rgba(6,8,15,.42)';
    x.beginPath(); x.moveTo(0, 0); x.lineTo(W * 0.19, 0); x.quadraticCurveTo(W * 0.26, H * 0.38, W * 0.12, H); x.lineTo(0, H); x.fill();
    x.beginPath(); x.moveTo(W, 0); x.lineTo(W * 0.81, 0); x.quadraticCurveTo(W * 0.74, H * 0.38, W * 0.88, H); x.lineTo(W, H); x.fill();
    // window mullions
    x.strokeStyle = 'rgba(12,14,20,.75)'; x.lineWidth = 7;
    x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
    x.beginPath(); x.moveTo(0, H * 0.45); x.lineTo(W, H * 0.45); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(W / 2 - 3, 0); x.lineTo(W / 2 - 3, H); x.stroke();
    // glass sheen
    const sheen = x.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, 'rgba(255,255,255,.02)'); sheen.addColorStop(0.45, 'rgba(255,255,255,.16)'); sheen.addColorStop(0.55, 'rgba(255,255,255,.04)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sheen; x.fillRect(0, 0, W, H);
    noiseLayer(x, W, H, seed + 9, 10, true);
    return c;
  };

  T.holoKoi = function () {
    const W = 1024, H = 512;
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    const grad = x.createLinearGradient(120, 0, 900, 0);
    grad.addColorStop(0, 'rgba(54,240,255,.9)');
    grad.addColorStop(0.45, 'rgba(85,255,255,.65)');
    grad.addColorStop(0.74, 'rgba(255,55,178,.8)');
    grad.addColorStop(1, 'rgba(255,210,245,.95)');
    x.save();
    x.shadowColor = 'rgba(55,235,255,.9)';
    x.shadowBlur = 34;

    // flowing tail
    x.strokeStyle = 'rgba(102,245,255,.65)';
    x.lineWidth = 8;
    x.beginPath(); x.moveTo(205, 262);
    x.bezierCurveTo(150, 190, 70, 168, 32, 120);
    x.bezierCurveTo(92, 205, 92, 250, 150, 278);
    x.stroke();
    x.beginPath(); x.moveTo(205, 262);
    x.bezierCurveTo(112, 290, 74, 365, 44, 414);
    x.bezierCurveTo(92, 340, 130, 300, 188, 296);
    x.stroke();
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(255,130,225,.45)';
    x.beginPath(); x.moveTo(205, 262);
    x.bezierCurveTo(130, 240, 82, 220, 38, 188); x.stroke();
    x.beginPath(); x.moveTo(205, 262);
    x.bezierCurveTo(130, 285, 92, 328, 45, 360); x.stroke();

    // body silhouette
    x.beginPath();
    x.moveTo(760, 258);
    x.bezierCurveTo(710, 164, 580, 140, 460, 170);
    x.bezierCurveTo(360, 194, 284, 226, 206, 258);
    x.bezierCurveTo(285, 296, 365, 334, 465, 350);
    x.bezierCurveTo(580, 370, 706, 338, 760, 258);
    x.closePath();
    const bodyFill = x.createLinearGradient(200, 0, 760, 0);
    bodyFill.addColorStop(0, 'rgba(33,212,235,.25)');
    bodyFill.addColorStop(0.55, 'rgba(50,235,255,.48)');
    bodyFill.addColorStop(1, 'rgba(255,64,180,.45)');
    x.fillStyle = bodyFill; x.fill();

    // pale belly
    x.beginPath();
    x.moveTo(760, 260);
    x.bezierCurveTo(690, 328, 560, 352, 420, 342);
    x.bezierCurveTo(540, 320, 670, 300, 760, 260);
    x.fillStyle = 'rgba(255,230,250,.20)'; x.fill();

    // ghost outline, doubled for hologram bloom
    x.strokeStyle = 'rgba(103,247,255,.9)'; x.lineWidth = 6;
    x.stroke();
    x.strokeStyle = 'rgba(255,120,220,.45)'; x.lineWidth = 2; x.stroke();

    // top and side fins
    x.strokeStyle = 'rgba(93,244,255,.72)'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(470, 170); x.bezierCurveTo(405, 100, 360, 52, 304, 34); x.bezierCurveTo(355, 98, 390, 145, 430, 184); x.stroke();
    x.beginPath(); x.moveTo(475, 348); x.bezierCurveTo(440, 404, 405, 448, 360, 470); x.bezierCurveTo(390, 404, 405, 372, 430, 342); x.stroke();
    x.beginPath(); x.moveTo(590, 342); x.bezierCurveTo(590, 402, 630, 444, 684, 460); x.bezierCurveTo(652, 402, 638, 366, 634, 344); x.stroke();

    // scales
    x.lineWidth = 1.5;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 9; col++) {
        const px = 290 + col * 47 + (row % 2) * 22;
        const py = 220 + row * 24;
        x.beginPath(); x.arc(px, py, 22, 0.18, Math.PI - 0.18);
        x.strokeStyle = 'rgba(145,252,255,' + (0.10 + row * 0.035) + ')'; x.stroke();
      }
    }
    // gill line
    x.beginPath(); x.arc(650, 255, 70, -1.1, 1.1); x.strokeStyle = 'rgba(255,185,240,.42)'; x.lineWidth = 2.5; x.stroke();

    // eye and whiskers
    x.shadowColor = '#ff54be'; x.shadowBlur = 24;
    x.fillStyle = 'rgba(255,239,250,.95)';
    x.beginPath(); x.arc(690, 232, 14, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,45,156,.95)';
    x.beginPath(); x.arc(693, 233, 7, 0, TAU); x.fill();
    x.shadowBlur = 10; x.strokeStyle = 'rgba(110,246,255,.65)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(756, 238); x.bezierCurveTo(822, 222, 870, 198, 913, 176); x.stroke();
    x.beginPath(); x.moveTo(756, 272); x.bezierCurveTo(818, 290, 864, 316, 900, 342); x.stroke();

    // digital scan slices
    x.globalCompositeOperation = 'source-atop';
    for (let y = 20; y < H; y += 7) {
      x.fillStyle = 'rgba(5,8,16,' + (0.10 + Math.random() * 0.12) + ')';
      x.fillRect(0, y, W, 2);
    }
    x.globalCompositeOperation = 'source-over';

    // rim dust
    x.shadowBlur = 8; x.fillStyle = 'rgba(210,255,255,.7)';
    for (let i = 0; i < 55; i++) {
      const px = 180 + Math.random() * 700, py = 150 + Math.random() * 220;
      x.fillRect(px, py, 1.5, 1.5);
    }
    x.restore();
    return c;
  };

  T.canvasToTexture = function (canvas, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };

  ND.Tex = T;
  ND.util = {
    makeCanvas, mulberry32, clamp, lerp, rgba, noiseLayer
  };
})();
