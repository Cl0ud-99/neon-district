import fs from 'node:fs';
import path from 'node:path';

const CDP_PORT = process.env.CDP_PORT || 9333;

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.waiters = new Map(); this.events = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waiters.has(m.id)) {
        const { resolve, reject } = this.waiters.get(m.id);
        this.waiters.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.waiters.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.waiters.has(id)) { this.waiters.delete(id); reject(new Error('timeout ' + method)); }
      }, 120000);
    });
  }
}

async function newTarget() {
  return await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
}

export async function capture(cfg) {
  const {
    url, width = 1600, height = 900, settle = 2200, timeout = 120000,
    out, evalBefore, evalAfter, mobile = false
  } = cfg;
  const target = await newTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  const consoleLines = [];
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__errors=[];addEventListener('error',e=>window.__errors.push(String(e.message||e)));addEventListener('unhandledrejection',e=>window.__errors.push('rej:'+String(e.reason)));`
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    if (evalBefore) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: evalBefore });
    await cdp.send('Page.navigate', { url });
    const start = Date.now();
    let ready = false;
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 450));
      const r = await cdp.send('Runtime.evaluate', { expression: '!!window.__NEON_READY', returnByValue: true }).catch(() => null);
      if (r && r.result && r.result.value) { ready = true; break; }
    }
    if (!ready) consoleLines.push('WARN: ready flag not set in ' + timeout + 'ms');
    await new Promise(r => setTimeout(r, settle));
    let evalResult = null;
    if (evalAfter) {
      const r = await cdp.send('Runtime.evaluate', { expression: evalAfter, returnByValue: true, awaitPromise: true });
      evalResult = r.result && r.result.value;
      await new Promise(r2 => setTimeout(r2, 700));
    }
    const png = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.resolve(out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
    const status = await cdp.send('Runtime.evaluate', {
      expression: `(()=>{const a=window.NEON&&window.NEON.app;return JSON.stringify({state:a&&a.state,time:a&&a.time,fps:a&&a.fps,quality:a&&a.qualityKey,ready:window.__NEON_READY,errors:window.__errors||[],body:document.body.className});})()`,
      returnByValue: true
    }).catch(() => null);
    const logs = cdp.events.filter(e => ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(e.method));
    const errs = logs.filter(l => {
      if (l.method === 'Runtime.exceptionThrown') return true;
      if (l.method === 'Runtime.consoleAPICalled' && l.params.type === 'error') return true;
      if (l.method === 'Log.entryAdded' && l.params.entry.level === 'error') return true;
      return false;
    });
    return { file, ready, evalResult, status: status && status.result && status.result.value, errors: errs.slice(0, 12), consoleLines };
  } finally {
    try { ws.close(); } catch {}
    try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`); } catch {}
  }
}

if (process.argv[1] && process.argv[1].endsWith('capture.mjs')) {
  const cfg = JSON.parse(process.argv[2] || '{}');
  capture(cfg).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}
