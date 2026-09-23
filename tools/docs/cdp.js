'use strict';
/* A tiny Chrome DevTools Protocol client, with no dependencies.
 *
 * Two builders need to drive a real Chrome: tools/docs/build_pdf.js (print the
 * documentation) and tools/docs/shoot_game.js (capture the game's screens for
 * that documentation). Both need the same four things -- find Chrome, launch it
 * headless, open a WebSocket to it, talk JSON -- so those live here once rather
 * than in two copies that drift apart.
 *
 * The WebSocket is hand-rolled on purpose: this project installs nothing for its
 * tooling. The handshake is HTTP, a frame is a 2-14 byte header plus payload,
 * and the only frames Chrome sends are text (1), continuation (0), ping (9) and
 * close (8).
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const VERBOSE = process.argv.includes('--verbose');
function log(msg) { if (VERBOSE) console.error('[cdp] ' + msg); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// --- WebSocket ---------------------------------------------------------------

function encodeFrame(data, op) {
  const len = data.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeUInt32BE(Math.floor(len / 4294967296), 2);
    head.writeUInt32BE(len >>> 0, 6);
  }
  head[0] = 0x80 | op;
  head[1] |= 0x80;                    // client-to-server frames must be masked
  const mask = crypto.randomBytes(4);
  const out = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) out[i] = data[i] ^ mask[i & 3];
  return Buffer.concat([head, mask, out]);
}

function readFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const op = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = buf.readUInt32BE(2) * 4294967296 + buf.readUInt32BE(6);
    offset = 10;
  }
  let mask = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;
  const payload = Buffer.from(buf.subarray(offset, offset + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  return { fin, op, payload, rest: buf.subarray(offset + len) };
}

function wrapSocket(socket) {
  const handlers = { message: [], close: [] };
  let buf = Buffer.alloc(0);
  let fragments = [];
  let fragOp = 0;

  function emit(payload, op) {
    if (op !== 0x1) return;
    const text = payload.toString('utf8');
    handlers.message.forEach((f) => f(text));
  }

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const frame = readFrame(buf);
      if (!frame) return;
      buf = frame.rest;
      if (frame.op === 0x9) { socket.write(encodeFrame(frame.payload, 0xa)); continue; }
      if (frame.op === 0x8) { handlers.close.forEach((f) => f()); socket.end(); return; }
      if (frame.op === 0x0) {
        fragments.push(frame.payload);
        if (frame.fin) { const all = Buffer.concat(fragments); fragments = []; emit(all, fragOp); }
      } else if (frame.fin) {
        emit(frame.payload, frame.op);
      } else {
        fragOp = frame.op;
        fragments = [frame.payload];
      }
    }
  });
  socket.on('error', () => handlers.close.forEach((f) => f()));
  socket.on('close', () => handlers.close.forEach((f) => f()));

  return {
    send(obj) { socket.write(encodeFrame(Buffer.from(JSON.stringify(obj), 'utf8'), 0x1)); },
    onMessage(fn) { handlers.message.push(fn); },
    onClose(fn) { handlers.close.push(fn); },
    close() { socket.end(); }
  };
}

function wsConnect(url, timeoutMs) {
  const m = /^ws:\/\/([^:/]+):(\d+)(\/.*)$/.exec(url);
  if (!m) return Promise.reject(new Error('bad websocket url: ' + url));
  const [, host, port, wsPath] = m;
  const key = crypto.randomBytes(16).toString('base64');

  return new Promise((resolve, reject) => {
    const req = http.request({
      host, port: Number(port), path: wsPath, method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'
      }
    });
    req.setTimeout(timeoutMs || 8000, () => req.destroy(new Error('websocket handshake timed out')));
    req.on('upgrade', (res, socket) => resolve(wrapSocket(socket)));
    req.on('error', reject);
    req.on('response', (res) => reject(new Error('handshake refused: HTTP ' + res.statusCode)));
    req.end();
  });
}

// --- Chrome ------------------------------------------------------------------

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.setTimeout(4000, () => req.destroy(new Error('http timeout: ' + url)));
    req.on('error', reject);
  });
}

async function waitForPort(profileDir, timeoutMs) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const first = fs.readFileSync(file, 'utf8').split('\n')[0];
      if (first) return Number(first.trim());
    }
    await sleep(120);
  }
  throw new Error('chrome never wrote DevToolsActivePort');
}

async function firstPageTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await httpGetJson('http://127.0.0.1:' + port + '/json/list');
      const page = (list || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (err) { /* chrome still starting */ }
    await sleep(150);
  }
  throw new Error('no page target appeared');
}

/** Launch headless Chrome and attach to its first page target. */
async function launch(opts) {
  opts = opts || {};
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome/Edge found (set CHROME_PATH)');
  log('chrome: ' + chrome);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-chrome-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--allow-file-access-from-files', '--mute-audio',
    '--user-data-dir=' + profileDir, '--remote-debugging-port=0',
    '--window-size=' + (opts.width || 1600) + ',' + (opts.height || 900)
  ];
  if (opts.url) args.push(opts.url); else args.push('about:blank');

  const child = spawn(chrome, args, { stdio: 'ignore' });
  const port = await waitForPort(profileDir, 30000);
  const target = await firstPageTarget(port, 15000);
  const ws = await wsConnect(target.webSocketDebuggerUrl);
  const session = makeSession(ws);

  async function close() {
    try { await session.cmd('Browser.close', {}, 4000); } catch (e) { /* ignore */ }
    try { ws.close(); } catch (e) { /* ignore */ }
    try { child.kill(); } catch (e) { /* ignore */ }
    await sleep(200);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  return { session, close, target, debuggerPort: port };
}

// --- session -----------------------------------------------------------------

function makeSession(ws) {
  let id = 0;
  const pending = new Map();
  const waiters = [];

  ws.onMessage((text) => {
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === msg.method) {
          const w = waiters.splice(i, 1)[0];
          clearTimeout(w.timer);
          w.resolve(msg.params);
        }
      }
    }
  });

  return {
    closed: false,
    cmd(method, params, timeoutMs) {
      const mid = ++id;
      log('-> ' + method);
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        ws.send({ id: mid, method, params: params || {} });
        setTimeout(() => {
          if (pending.has(mid)) {
            pending.delete(mid);
            reject(new Error('timeout after ' + (timeoutMs || 30000) + 'ms: ' + method));
          }
        }, timeoutMs || 30000);
      });
    },
    wait(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('never saw ' + method)), timeoutMs);
        waiters.push({ method, resolve, timer });
      });
    },
    /** Load a URL and wait for load, then settle for images. */
    async goto(url, settleMs) {
      const loaded = this.wait('Page.loadEventFired', 45000);
      await this.cmd('Page.navigate', { url });
      await loaded;
      await sleep(settleMs == null ? 700 : settleMs);
    },
    /** Evaluate an expression in the page and return its value. */
    async eval(expression) {
      const res = await this.cmd('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true
      }, 60000);
      if (res.exceptionDetails) {
        throw new Error('page threw: ' + (res.exceptionDetails.exception
          ? res.exceptionDetails.exception.description : res.exceptionDetails.text));
      }
      return res.result ? res.result.value : undefined;
    },
    /** Capture the viewport to a PNG file. */
    async shoot(file) {
      const res = await this.cmd('Page.captureScreenshot', { format: 'png', fromSurface: true }, 30000);
      const bytes = Buffer.from(res.data, 'base64');
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.writeFileSync(file, bytes);
      return bytes.length;
    },
    /** press a real key (keyCode + code), one press. */
    async key(key, code, keyCode, modifiers) {
      const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
      await this.cmd('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', modifiers: modifiers || 0 }, base));
      await this.cmd('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp', modifiers: modifiers || 0 }, base));
    }
  };
}

module.exports = { launch, findChrome, sleep, log };
