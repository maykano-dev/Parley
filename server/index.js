// Local server: serves the UI, bridges the adapter to the browser over a
// WebSocket, and streams decrypted media. Binds to loopback only; nothing
// here is reachable from the network.

import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { Store } from './store.js';
import { WhatsApp, CAPABILITIES } from './wa.js';

const PORT = Number(process.env.PORT || 5173);
const HOST = '127.0.0.1';
const WEB = path.resolve('web');

const store = new Store();
const wa = new WhatsApp(store);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/media/')) return serveMedia(url, res);

  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(WEB, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(WEB)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
});

async function serveMedia(url, res) {
  const id = decodeURIComponent(url.pathname.slice('/media/'.length));
  try {
    const { buffer, mime, fileName } = await wa.media(id);
    const headers = { 'content-type': mime, 'content-length': buffer.length, 'cache-control': 'private, max-age=600' };
    if (fileName && url.searchParams.get('dl')) {
      headers['content-disposition'] = 'attachment; filename="' + fileName.replace(/"/g, '') + '"';
    }
    res.writeHead(200, headers).end(buffer);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(e.message);
  }
}

// ---- websocket bridge -------------------------------------------

const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

function broadcast(t, payload) {
  const frame = JSON.stringify({ t, ...payload });
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(frame);
  }
}

async function sendHello(ws) {
  const qrPng = wa.qr ? await QRCode.toDataURL(wa.qr, qrOpts) : null;
  ws.send(JSON.stringify({
    t: 'hello',
    capabilities: [CAPABILITIES],
    status: wa.status,
    linked: wa.isLinked(),
    me: wa.me || store.data.me,
    qr: qrPng,
    pairingCode: wa.pairingCode,
    chats: store.chatList(),
  }));
}

const qrOpts = { margin: 1, width: 464, color: { dark: '#0B0B12', light: '#FFFFFF' }, errorCorrectionLevel: 'H' };

wss.on('connection', (ws) => {
  clients.add(ws);
  sendHello(ws).catch(() => {});

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    try {
      switch (msg.t) {
        case 'open': {
          ws.send(JSON.stringify({ t: 'messages', chatId: msg.chatId, messages: store.messages(msg.chatId) }));
          await wa.markRead(msg.chatId);
          break;
        }
        case 'send':
          await wa.send(msg.chatId, msg.text);
          break;
        case 'sendAudio': {
          const bytes = Buffer.from(msg.data || '', 'base64');
          if (!bytes.length) throw new Error('Empty recording.');
          // Browsers record webm/opus; WhatsApp expects ogg/opus for a voice
          // note, so transcode when ffmpeg is on the box and fall back to
          // sending as-is when it is not.
          const ogg = await toOggOpus(bytes).catch(() => null);
          await wa.sendAudio(msg.chatId, ogg || bytes, {
            mime: ogg ? 'audio/ogg; codecs=opus' : (msg.mime || 'audio/webm'),
            seconds: msg.seconds || 0,
          });
          break;
        }
        case 'typing':
          await wa.setTyping(msg.chatId, !!msg.on);
          break;
        case 'pair': {
          const code = await wa.requestPairing(msg.phone);
          if (code) ws.send(JSON.stringify({ t: 'pairing', code, phone: msg.phone }));
          break;
        }
        case 'search':
          ws.send(JSON.stringify({ t: 'results', term: msg.term, results: store.search(msg.term || '') }));
          break;
        case 'connect':
          await wa.start();
          break;
        case 'logout':
          await wa.logout();
          break;
        default:
          break;
      }
    } catch (e) {
      ws.send(JSON.stringify({ t: 'error', message: e.message }));
    }
  });

  ws.on('close', () => clients.delete(ws));
});

// Transcode to ogg/opus via ffmpeg, reading and writing on pipes.
function toOggOpus(buf) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1',
      '-f', 'ogg', 'pipe:1',
    ]);
    const out = [];
    let err = '';
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0 && out.length) resolve(Buffer.concat(out));
      else reject(new Error(err || ('ffmpeg exited ' + code)));
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(buf);
  });
}

// ---- adapter events out to every client -------------------------

wa.on('status', (s) => broadcast('status', s));
wa.on('chats', (chats) => broadcast('chats', { chats }));
wa.on('chat', (chat) => broadcast('chat', { chat }));
wa.on('message', (message) => broadcast('message', { message }));
wa.on('presence', (p) => broadcast('presence', p));
wa.on('pairing', ({ code, phone }) => broadcast('pairing', { code, phone }));
wa.on('loggedOut', () => broadcast('error', { message: 'WhatsApp unlinked this device. Link it again to continue.' }));
wa.on('error', (message) => broadcast('error', { message }));
wa.on('qr', async (qr) => {
  try {
    broadcast('qr', { qr: await QRCode.toDataURL(qr, qrOpts) });
  } catch { /* ignore a render failure, the next qr lands in 20s */ }
});

// ---- boot --------------------------------------------------------

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Parley');
  console.log('  UI        http://' + HOST + ':' + PORT);
  console.log('  Linked    ' + (wa.isLinked() ? 'yes, reconnecting' : 'no, open the UI to link a device'));
  console.log('');
});

wa.start().catch((e) => console.error('[wa] start failed:', e.message));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log('\n  shutting down');
    store.flush();
    await wa.stop();
    process.exit(0);
  });
}
