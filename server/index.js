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
import { Vault } from './vault.js';
import { Telegram, CAPABILITIES as TG_CAPS, hasCredentials as tgReady } from './tg.js';

const PORT = Number(process.env.PORT || 5173);
const HOST = '127.0.0.1';
const WEB = path.resolve('web');

const store = new Store();
const wa = new WhatsApp(store);
const vault = new Vault(store);
const tg = new Telegram(store);

// One router, so nothing downstream has to know which network a chat is on.
const adapterFor = (id) => (String(id).startsWith('tg:') ? tg : wa);

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
  if (url.pathname === '/upload' && req.method === 'POST') return receiveUpload(req, url, res);
  if (url.pathname.startsWith('/vault/')) return serveSaved(url, res);
  if (url.pathname.startsWith('/avatar/')) return serveAvatar(url, res);

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
    const { buffer, mime, fileName } = await adapterFor(id).media(id);
    const headers = { 'content-type': mime, 'content-length': buffer.length, 'cache-control': 'private, max-age=600' };
    if (fileName && url.searchParams.get('dl')) {
      headers['content-disposition'] = 'attachment; filename="' + fileName.replace(/"/g, '') + '"';
    }
    res.writeHead(200, headers).end(buffer);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(e.message);
  }
}

const MAX_UPLOAD = 64 * 1024 * 1024;

function receiveUpload(req, url, res) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_UPLOAD) {
      res.writeHead(413, { 'content-type': 'text/plain' }).end('Too large. WhatsApp caps attachments at 64MB.');
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (res.headersSent) return;
    try {
      const chatId = url.searchParams.get('chatId');
      if (!chatId) throw new Error('Missing conversation.');
      if (String(chatId).startsWith('tg:')) throw new Error('Sending attachments on Telegram is not wired yet.');
      await wa.sendMedia(chatId, Buffer.concat(chunks), {
        mime: req.headers['x-file-type'] || '',
        fileName: decodeURIComponent(req.headers['x-file-name'] || 'file'),
        caption: decodeURIComponent(url.searchParams.get('caption') || ''),
        replyToId: url.searchParams.get('replyTo') || null,
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch (e) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end(e.message);
    }
  });
}

async function serveAvatar(url, res) {
  const id = decodeURIComponent(url.pathname.slice('/avatar/'.length));
  try {
    const { buffer, mime } = await adapterFor(id).avatarFor(id);
    res.writeHead(200, { 'content-type': mime, 'content-length': buffer.length, 'cache-control': 'private, max-age=900' }).end(buffer);
  } catch {
    // A missing avatar is ordinary. 404 quietly and let the UI fall back.
    res.writeHead(404, { 'content-type': 'text/plain' }).end('no avatar');
  }
}

function serveSaved(url, res) {
  const id = decodeURIComponent(url.pathname.slice('/vault/'.length));
  const hit = vault.localPath(id);
  if (!hit) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not in the vault');
    return;
  }
  const headers = { 'content-type': hit.mime || 'application/octet-stream', 'cache-control': 'private, max-age=3600' };
  if (url.searchParams.get('dl')) {
    headers['content-disposition'] = 'attachment; filename="' + String(hit.name).replace(/"/g, '') + '"';
  }
  res.writeHead(200, headers);
  fs.createReadStream(hit.path).pipe(res);
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
    capabilities: [CAPABILITIES, TG_CAPS],
    status: wa.status,
    linked: wa.isLinked(),
    me: wa.me || store.data.me,
    telegram: { status: tg.status, linked: tg.isLinked(), configured: tgReady(), me: tg.me, hint: tg.hint },
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
          const ad = adapterFor(msg.chatId);
          await ad.markRead(msg.chatId);
          if (store.messages(msg.chatId).length < 20) {
            if (ad === tg) {
              await tg.history(msg.chatId, 40);
              ws.send(JSON.stringify({ t: 'messages', chatId: msg.chatId, messages: store.messages(msg.chatId) }));
            } else {
              wa.loadMore(msg.chatId).catch(() => {});
            }
          }
          break;
        }
        case 'loadMore':
          await wa.loadMore(msg.chatId, 50);
          break;
        case 'send':
          await adapterFor(msg.chatId).send(msg.chatId, msg.text, msg.replyTo || null);
          break;
        case 'tgStart':
          await tg.start();
          break;
        case 'tgPhone':
          await tg.submitPhone(msg.phone);
          break;
        case 'tgCode':
          await tg.submitCode(msg.code);
          break;
        case 'tgPassword':
          await tg.submitPassword(msg.password);
          break;
        case 'tgLogout':
          await tg.logout();
          break;
        case 'react':
          await wa.react(msg.chatId, msg.id, msg.emoji);
          break;
        case 'edit':
          await wa.edit(msg.chatId, msg.id, msg.text);
          break;
        case 'delete':
          await wa.remove(msg.chatId, msg.id, msg.forEveryone !== false);
          break;
        case 'forward':
          await wa.forward(msg.toChatId, msg.id);
          break;
        case 'modify':
          await adapterFor(msg.chatId).modify(msg.chatId, msg.what || {});
          break;
        case 'sendAudio': {
          const bytes = Buffer.from(msg.data || '', 'base64');
          if (!bytes.length) throw new Error('Empty recording.');
          // Browsers record webm/opus; WhatsApp expects ogg/opus for a voice
          // note, so transcode when ffmpeg is on the box and fall back to
          // sending as-is when it is not.
          const ogg = await toOggOpus(bytes).catch(() => null);
          await wa.sendMedia(msg.chatId, ogg || bytes, {
            ptt: true,
            mime: ogg ? 'audio/ogg; codecs=opus' : (msg.mime || 'audio/webm'),
            seconds: msg.seconds || 0,
            replyToId: msg.replyTo || null,
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
        case 'profile': {
          const which = msg.network === 'telegram' ? tg : wa;
          const p = await which.profile();
          ws.send(JSON.stringify({ t: 'profile', network: msg.network, profile: p }));
          break;
        }
        case 'vault': {
          const index = vault.index();
          ws.send(JSON.stringify({ t: 'vault', items: index, stats: vault.stats(index) }));
          break;
        }
        case 'vaultSave': {
          const entry = await vault.save(msg.id, (id) => wa.media(id));
          ws.send(JSON.stringify({ t: 'vaultSaved', id: msg.id, entry }));
          break;
        }
        case 'vaultRemove': {
          vault.remove(msg.id);
          ws.send(JSON.stringify({ t: 'vaultSaved', id: msg.id, entry: null }));
          break;
        }
        case 'vaultClear': {
          const n = vault.clear();
          ws.send(JSON.stringify({ t: 'error', message: 'Removed ' + n + ' saved files from the vault.' }));
          break;
        }
        case 'search':
          ws.send(JSON.stringify({ t: 'results', term: msg.term, results: store.search(msg.term || '') }));
          break;
        case 'connect':
          await wa.relink();
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
tg.on('status', (s) => broadcast('tgStatus', s));
tg.on('chats', (chats) => broadcast('chats', { chats }));
tg.on('chat', (chat) => broadcast('chat', { chat }));
tg.on('message', (message) => broadcast('message', { message }));
tg.on('presence', (p) => broadcast('presence', p));
tg.on('error', (message) => broadcast('error', { message }));
tg.on('authError', (message) => broadcast('tgAuthError', { message }));

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
if (tgReady() && tg.isLinked()) tg.start().catch((e) => console.error('[tg] start failed:', e.message));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log('\n  shutting down');
    store.flush();
    await wa.stop();
    await tg.stop();
    process.exit(0);
  });
}
