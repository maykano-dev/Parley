// WhatsApp adapter.
//
// Speaks the multi-device companion protocol through Baileys: this process
// registers as one of the account's linked devices, exactly as WhatsApp Web
// does. The phone stays the primary. Nothing here ever sees a password.
//
// Everything leaving this file is already normalised into the app's own
// Chat/Message shape, so the UI and the rest of the server never import
// Baileys types. That is what makes a second network a new adapter rather
// than a rewrite.

import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs';
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  DisconnectReason,
  getContentType,
  jidNormalizedUser,
  isLidUser,
  isJidGroup,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';

const AUTH_DIR = path.resolve('data', 'auth');

// Quiet by default: message content must never reach a log file.
const logger = pino({ level: process.env.WA_LOG || 'silent' });

export const CAPABILITIES = {
  id: 'whatsapp',
  label: 'WhatsApp',
  colour: '#25D366',
  text: true,
  audio: true,          // every network we target supports voice notes
  media: true,
  reactions: true,
  replies: true,
  forward: true,
  deleteForEveryone: true,
  edit: true,              // WhatsApp allows ~15 minutes
  editWindowMs: 15 * 60 * 1000,
  pin: true,
  mute: true,
  archive: true,
  drafts: true,
  typing: true,
  readReceipts: true,
  maxAttachmentBytes: 64 * 1024 * 1024,
};

export class WhatsApp extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.sock = null;
    this.status = 'offline';     // offline | connecting | linking | online
    this.qr = null;
    this.pairingCode = null;
    this.pendingPhone = null;
    this.me = null;
    this.raw = new Map();        // message id -> raw WAMessage, for media
    this.stopping = false;
    this.retry = 0;
  }

  isLinked() {
    try {
      return fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
    } catch {
      return false;
    }
  }

  setStatus(s, extra = {}) {
    this.status = s;
    this.emit('status', Object.assign({ status: s, me: this.me, linked: this.isLinked() }, extra));
  }

  async start() {
    this.stopping = false;
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined;                       // fall back to the bundled one
    }

    this.setStatus(this.isLinked() ? 'connecting' : 'linking');

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.ubuntu('Desktop'),
      printQRInTerminal: false,
      syncFullHistory: true,         // take the window WhatsApp offers at link time
      shouldSyncHistoryMessage: () => true,
      markOnlineOnConnect: false,    // leave phone notifications working
      generateHighQualityLinkPreview: false,
      emitOwnEvents: true,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u;

      if (qr) {
        this.qr = qr;
        this.setStatus('linking');
        this.emit('qr', qr);
        // If a pairing code was requested before the socket existed, do it now.
        if (this.pendingPhone) {
          const phone = this.pendingPhone;
          this.pendingPhone = null;
          this.requestPairing(phone).catch((e) => this.emit('error', e.message));
        }
      }

      if (connection === 'open') {
        this.retry = 0;
        this.qr = null;
        this.pairingCode = null;
        this.me = sock.user
          ? { id: jidNormalizedUser(sock.user.id), name: sock.user.name || sock.user.verifiedName || null }
          : null;
        this.store.data.me = this.me;
        this.store.touch();
        this.setStatus('online');
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

        if (loggedOut) {
          this.emit('loggedOut');
          this.setStatus('linking', { reason: 'loggedOut' });
          return;
        }
        if (this.stopping) {
          this.setStatus('offline');
          return;
        }
        // Backoff, capped. A companion also drops if the phone has been
        // offline for 14 days, in which case the reconnect will ask to relink.
        this.retry = Math.min(this.retry + 1, 6);
        const wait = Math.min(1000 * 2 ** this.retry, 30000);
        this.setStatus('connecting', { reason: 'reconnecting', inMs: wait });
        setTimeout(() => this.start().catch((e) => this.emit('error', e.message)), wait);
      }
    });

    // ---- history sync: the bounded window a companion is given ----
    sock.ev.on('messaging-history.set', ({ chats = [], contacts = [], messages = [] }) => {
      for (const c of contacts) {
        this.store.setContact(jidNormalizedUser(c.id), c.name || c.notify || c.verifiedName);
      }
      for (const c of chats) this.ingestChat(c);
      for (const m of messages) this.ingestMessage(m, { silent: true });
      this.emit('chats', this.store.chatList());
    });

    sock.ev.on('contacts.upsert', (cs) => {
      for (const c of cs) this.store.setContact(jidNormalizedUser(c.id), c.name || c.notify || c.verifiedName);
    });
    sock.ev.on('contacts.update', (cs) => {
      for (const c of cs) if (c.id) this.store.setContact(jidNormalizedUser(c.id), c.name || c.notify || c.verifiedName);
    });

    sock.ev.on('chats.upsert', (cs) => {
      for (const c of cs) this.ingestChat(c);
      this.emit('chats', this.store.chatList());
    });
    sock.ev.on('chats.update', (cs) => {
      for (const c of cs) if (c.id) this.ingestChat(c);
      this.emit('chats', this.store.chatList());
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      for (const m of messages) this.ingestMessage(m, { notify: type === 'notify' });
    });

    sock.ev.on('messages.update', (updates) => {
      for (const u of updates) {
        const id = u.key?.id;
        const chatId = u.key?.remoteJid;
        if (!id || !chatId) continue;
        const status = statusName(u.update?.status);
        if (!status) continue;
        const patched = this.store.updateMessage(chatId, id, { status });
        if (patched) this.emit('message', patched);
      }
    });

    sock.ev.on('messages.reaction', (reactions) => {
      for (const r of reactions) {
        const chatId = r.key?.remoteJid;
        const id = r.key?.id;
        if (!chatId || !id) continue;
        const existing = this.store.messages(chatId).find((m) => m.id === id);
        if (!existing) continue;
        const list = (existing.reactions || []).filter((x) => x.by !== (r.reaction?.senderTimestampMs ? 'them' : 'them'));
        const text = r.reaction?.text || '';
        const next = text ? list.concat([{ emoji: text, by: 'them' }]) : list;
        const patched = this.store.updateMessage(chatId, id, { reactions: next });
        if (patched) this.emit('message', patched);
      }
    });

    sock.ev.on('presence.update', ({ id, presences }) => {
      const first = presences && Object.values(presences)[0];
      if (!first) return;
      this.emit('presence', { chatId: id, state: first.lastKnownPresence || 'unavailable' });
    });

    return sock;
  }

  async stop() {
    this.stopping = true;
    try {
      this.sock?.end?.(undefined);
    } catch { /* already gone */ }
    this.setStatus('offline');
  }

  async logout() {
    this.stopping = true;                      // do not let the close handler reconnect mid-wipe
    try {
      await this.sock?.logout();
    } catch { /* socket may already be closed */ }
    try {
      this.sock?.end?.(undefined);
    } catch { /* already gone */ }
    this.sock = null;
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch { /* nothing to remove */ }
    this.store.reset();
    this.me = null;
    this.qr = null;
    this.pairingCode = null;
    this.raw.clear();
    this.setStatus('linking', { reason: 'unlinked' });
    // Without this there is no socket left to produce a QR, so the link
    // screen sits there forever waiting for a code that never comes.
    this.stopping = false;
    setTimeout(() => this.start().catch((e) => this.emit('error', e.message)), 400);
  }

  // Any client can ask for a fresh code if the screen has been sitting idle.
  async relink() {
    if (this.status === 'online') throw new Error('Already linked.');
    if (this.sock) {
      try { this.sock.end(undefined); } catch { /* ignore */ }
      this.sock = null;
    }
    this.stopping = false;
    await this.start();
  }

  // 8 character pairing code, typed into the phone. No OTP, no password:
  // the number only tells WhatsApp which account to ask.
  async requestPairing(phone) {
    const digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.length < 8) throw new Error('Enter the number in full international form, digits only.');
    if (!this.sock) {
      this.pendingPhone = digits;
      await this.start();
      return null;
    }
    if (this.sock.authState?.creds?.registered) throw new Error('This device is already linked.');
    // Baileys wants a beat after the socket opens before asking.
    await new Promise((r) => setTimeout(r, 1200));
    const code = await this.sock.requestPairingCode(digits);
    this.pairingCode = code;
    this.emit('pairing', { code, phone: digits });
    return code;
  }

  // ---- normalisation -------------------------------------------

  // Baileys keeps a LID to phone-number map once it has seen both. Use it when
  // it is there, and degrade quietly when it is not.
  phoneFor(jid) {
    try {
      const m = this.sock?.signalRepository?.lidMapping;
      return m?.getPNForLID?.(jid) || null;
    } catch {
      return null;
    }
  }

  nameFor(jid) {
    const direct = this.store.contactName(jid);
    if (direct) return direct;
    if (isLidUser(String(jid))) {
      const pn = this.phoneFor(jid);
      if (pn) return this.store.contactName(pn) || prettyJid(pn);
    }
    return prettyJid(jid);
  }

  ingestChat(c) {
    const id = c.id;
    if (!id || id === 'status@broadcast') return;
    const isGroup = id.endsWith('@g.us');
    const name = c.name || c.subject || this.nameFor(id);
    const chat = {
      id,
      network: 'whatsapp',
      name,
      isGroup,
      unread: Math.max(0, Number(c.unreadCount) || 0),
      archived: !!c.archived,
      pinned: !!c.pinned,
      muted: !!(c.muteEndTime && Number(c.muteEndTime) * 1000 > Date.now()),
    };
    if (c.conversationTimestamp) chat.lastTs = toMs(c.conversationTimestamp);
    const saved = this.store.upsertChat(chat);
    this.emit('chat', saved);
    return saved;
  }

  ingestMessage(m, { notify = false, silent = false } = {}) {
    const chatId = m.key?.remoteJid;
    if (!chatId || chatId === 'status@broadcast') return null;
    if (!m.message && !m.messageStubType) return null;

    const inner = unwrap(m.message);
    if (!inner) return null;

    const type = getContentType(inner);
    const body = type ? inner[type] : null;

    const text =
      inner.conversation ||
      inner.extendedTextMessage?.text ||
      body?.caption ||
      (type === 'audioMessage' ? '' : body?.text) ||
      '';

    const kind = kindOf(type);
    if (kind === 'skip') return null;

    const fromMe = !!m.key.fromMe;
    const isGroup = chatId.endsWith('@g.us');
    const authorJid = fromMe ? (this.me?.id || 'me') : jidNormalizedUser(m.key.participant || chatId);

    if (m.pushName && !fromMe) this.store.setContact(authorJid, m.pushName);

    const ctx = inner.extendedTextMessage?.contextInfo || body?.contextInfo;
    const quotedBody = ctx?.quotedMessage ? unwrap(ctx.quotedMessage) : null;

    const msg = {
      id: m.key.id,
      chatId,
      network: 'whatsapp',
      fromMe,
      author: fromMe ? 'You' : (this.store.contactName(authorJid) || m.pushName || this.nameFor(authorJid)),
      showAuthor: isGroup && !fromMe,
      text,
      kind,
      ts: toMs(m.messageTimestamp) || Date.now(),
      status: fromMe ? statusName(m.status) || 'sent' : null,
      durationSec: body?.seconds || null,
      isVoiceNote: type === 'audioMessage' ? !!body?.ptt : false,
      mime: body?.mimetype || null,
      fileName: body?.fileName || null,
      hasMedia: kind !== 'text',
      quoted: quotedBody
        ? {
            author: ctx.participant ? this.nameFor(jidNormalizedUser(ctx.participant)) : '',
            text: quotedBody.conversation || quotedBody.extendedTextMessage?.text || captionOf(quotedBody) || 'Attachment',
          }
        : null,
    };

    this.rememberRaw(m);

    const saved = this.store.addMessage(msg);

    // keep the chat row in step with its newest message
    const existing = this.store.getChat(chatId) || {};
    const chat = this.store.upsertChat({
      id: chatId,
      network: 'whatsapp',
      isGroup,
      name: existing.name || this.store.contactName(chatId) || (isGroup ? prettyJid(chatId) : (m.pushName || this.nameFor(chatId))),
      lastTs: Math.max(existing.lastTs || 0, msg.ts),
      lastText: previewOf(msg),
      lastFromMe: fromMe,
      unread: notify && !fromMe ? (existing.unread || 0) + 1 : (existing.unread || 0),
    });

    if (!silent) {
      this.emit('message', saved);
      this.emit('chat', chat);
    }
    return saved;
  }

  rememberRaw(m) {
    this.raw.set(m.key.id, m);
    try {
      const inner = unwrap(m.message);
      const t = inner ? getContentType(inner) : null;
      if (t && kindOf(t) !== 'text' && kindOf(t) !== 'skip') {
        this.store.rememberMedia(m.key.id, JSON.parse(JSON.stringify(m)));
      }
    } catch { /* a handle we cannot serialise is simply not persisted */ }
    if (this.raw.size > 2000) {
      const oldest = this.raw.keys().next().value;
      this.raw.delete(oldest);
    }
  }

  // ---- profile --------------------------------------------------

  async profile() {
    if (this.status !== 'online' || !this.me) return null;
    let avatar = null;
    try {
      avatar = await this.sock.profilePictureUrl(this.me.id, 'image');
    } catch { /* no picture, or privacy settings hide it */ }
    return {
      id: this.me.id,
      network: 'whatsapp',
      name: this.me.name || 'You',
      phone: '+' + String(this.me.id).split('@')[0].split(':')[0],
      hasPhoto: !!avatar,
      avatarUrl: avatar ? '/avatar/' + encodeURIComponent(this.me.id) : null,
    };
  }

  async avatarFor(id) {
    const jid = id === 'self' ? this.me?.id : id;
    if (!jid) throw new Error('Not connected.');
    const url = await this.sock.profilePictureUrl(jid, 'image');
    if (!url) throw new Error('No profile picture.');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Could not fetch that picture.');
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mime: res.headers.get('content-type') || 'image/jpeg', fileName: 'avatar.jpg' };
  }

  // ---- actions --------------------------------------------------

  async send(chatId, text) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const body = String(text || '').trim();
    if (!body) throw new Error('Nothing to send.');
    const res = await this.sock.sendMessage(chatId, { text: body });
    if (res) this.ingestMessage(res, { notify: false });
    return res?.key?.id || null;
  }

  async sendAudio(chatId, buffer, { mime = 'audio/ogg; codecs=opus', seconds = 0 } = {}) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const res = await this.sock.sendMessage(chatId, {
      audio: buffer,
      mimetype: mime,
      ptt: true,              // a voice note, not a music file
      seconds: Math.round(seconds) || undefined,
    });
    if (res) this.ingestMessage(res, { notify: false });
    return res?.key?.id || null;
  }

  async loadMore(chatId, count = 50) {
    if (!this.sock || this.status !== 'online') return 0;
    const have = this.store.messages(chatId);
    if (!have.length) return 0;                 // nothing to anchor the request to
    const oldest = have[0];
    try {
      await this.sock.fetchMessageHistory(
        count,
        { remoteJid: chatId, id: oldest.id, fromMe: !!oldest.fromMe },
        Math.floor(oldest.ts / 1000),
      );
      return 1;
    } catch (e) {
      this.emit('error', 'Could not load older messages: ' + e.message);
      return 0;
    }
  }

  raw_(id) {
    const m = this.raw.get(id);
    if (!m) throw new Error('That message is no longer cached on this device.');
    return m;
  }

  async send(chatId, text, replyToId) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const body = String(text || '').trim();
    if (!body) throw new Error('Nothing to send.');
    const opts = replyToId ? { quoted: this.raw_(replyToId) } : {};
    const res = await this.sock.sendMessage(chatId, { text: body }, opts);
    if (res) this.ingestMessage(res, { notify: false });
    return res?.key?.id || null;
  }

  // One entry point for every attachment. The kind is decided from the mime
  // type so the UI never has to care which Baileys field to fill.
  async sendMedia(chatId, buffer, { mime = '', fileName = '', caption = '', replyToId = null, ptt = false, seconds = 0 } = {}) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const opts = replyToId ? { quoted: this.raw_(replyToId) } : {};
    let content;
    if (ptt || /^audio\//.test(mime)) {
      content = { audio: buffer, mimetype: ptt ? 'audio/ogg; codecs=opus' : (mime || 'audio/mpeg'), ptt: !!ptt };
      if (seconds) content.seconds = Math.round(seconds);
    } else if (/^image\/webp$/.test(mime)) {
      content = { sticker: buffer };
    } else if (/^image\//.test(mime)) {
      content = { image: buffer, caption: caption || undefined, mimetype: mime };
    } else if (/^video\//.test(mime)) {
      content = { video: buffer, caption: caption || undefined, mimetype: mime };
    } else {
      content = { document: buffer, mimetype: mime || 'application/octet-stream', fileName: fileName || 'file' };
      if (caption) content.caption = caption;
    }
    const res = await this.sock.sendMessage(chatId, content, opts);
    if (res) this.ingestMessage(res, { notify: false });
    return res?.key?.id || null;
  }

  async react(chatId, messageId, emoji) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const key = this.raw_(messageId).key;
    await this.sock.sendMessage(chatId, { react: { text: emoji || '', key } });
    const patched = this.store.updateMessage(chatId, messageId, { myReaction: emoji || '' });
    if (patched) this.emit('message', patched);
  }

  async edit(chatId, messageId, text) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const m = this.raw_(messageId);
    if (!m.key.fromMe) throw new Error('You can only edit your own messages.');
    await this.sock.sendMessage(chatId, { text: String(text), edit: m.key });
    const patched = this.store.updateMessage(chatId, messageId, { text: String(text), edited: true });
    if (patched) this.emit('message', patched);
  }

  async remove(chatId, messageId, forEveryone = true) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const key = this.raw_(messageId).key;
    if (forEveryone) await this.sock.sendMessage(chatId, { delete: key });
    const patched = this.store.updateMessage(chatId, messageId, {
      kind: 'text', text: 'This message was deleted', deleted: true, hasMedia: false,
    });
    if (patched) this.emit('message', patched);
  }

  async forward(toChatId, messageId) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const res = await this.sock.sendMessage(toChatId, { forward: this.raw_(messageId) });
    if (res) this.ingestMessage(res, { notify: false });
    return res?.key?.id || null;
  }

  async modify(chatId, what) {
    if (!this.sock || this.status !== 'online') throw new Error('Not connected yet.');
    const recent = this.store.messages(chatId).slice(-1).map((m) => ({
      key: { remoteJid: chatId, id: m.id, fromMe: !!m.fromMe },
      messageTimestamp: Math.floor(m.ts / 1000),
    }));
    const patch = {};
    if ('archive' in what) Object.assign(patch, { archive: !!what.archive, lastMessages: recent });
    if ('pin' in what) patch.pin = !!what.pin;
    if ('mute' in what) patch.mute = what.mute ? 8 * 60 * 60 * 1000 : null;
    if ('unread' in what) Object.assign(patch, { markRead: !what.unread, lastMessages: recent });
    try {
      await this.sock.chatModify(patch, chatId);
    } catch (e) {
      throw new Error('WhatsApp refused that change: ' + e.message);
    }
    const next = { id: chatId };
    if ('archive' in what) next.archived = !!what.archive;
    if ('pin' in what) next.pinned = !!what.pin;
    if ('mute' in what) next.muted = !!what.mute;
    if ('unread' in what) next.unread = what.unread ? 1 : 0;
    this.emit('chat', this.store.upsertChat(next));
  }

  async markRead(chatId) {
    if (!this.sock || this.status !== 'online') return;
    const list = this.store.messages(chatId).filter((m) => !m.fromMe).slice(-12);
    const keys = list.map((m) => ({ remoteJid: chatId, id: m.id, participant: undefined }));
    if (keys.length) {
      try { await this.sock.readMessages(keys); } catch { /* best effort */ }
    }
    const chat = this.store.upsertChat({ id: chatId, unread: 0 });
    this.emit('chat', chat);
  }

  async setTyping(chatId, on) {
    if (!this.sock || this.status !== 'online') return;
    try {
      await this.sock.sendPresenceUpdate(on ? 'composing' : 'paused', chatId);
    } catch { /* best effort */ }
  }

  async media(id) {
    const m = this.raw.get(id) || this.store.mediaHandle(id);
    if (!m) throw new Error('That attachment is no longer available on this device.');
    const buffer = await downloadMediaMessage(
      m,
      'buffer',
      {},
      { logger, reuploadRequest: this.sock.updateMediaMessage },
    );
    const inner = unwrap(m.message);
    const t = getContentType(inner);
    const body = t ? inner[t] : {};
    return { buffer, mime: body?.mimetype || 'application/octet-stream', fileName: body?.fileName || null };
  }
}

// ---- helpers ----------------------------------------------------

function unwrap(message) {
  if (!message) return null;
  let m = message;
  for (let i = 0; i < 4; i++) {
    if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
    if (m.viewOnceMessage?.message) { m = m.viewOnceMessage.message; continue; }
    if (m.viewOnceMessageV2?.message) { m = m.viewOnceMessageV2.message; continue; }
    if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
    break;
  }
  return m;
}

function kindOf(type) {
  switch (type) {
    case 'conversation':
    case 'extendedTextMessage':
      return 'text';
    case 'imageMessage': return 'image';
    case 'videoMessage': return 'video';
    case 'audioMessage': return 'audio';
    case 'documentMessage': return 'document';
    case 'stickerMessage': return 'sticker';
    case 'contactMessage':
    case 'contactsArrayMessage': return 'contact';
    case 'locationMessage': return 'location';
    default: return 'skip';
  }
}

function captionOf(inner) {
  const t = getContentType(inner);
  return t ? (inner[t]?.caption || '') : '';
}

function previewOf(msg) {
  if (msg.kind === 'text') return msg.text;
  const label = {
    image: 'Photo', video: 'Video', audio: msg.isVoiceNote ? 'Voice note' : 'Audio',
    document: msg.fileName || 'Document', sticker: 'Sticker',
    contact: 'Contact', location: 'Location',
  }[msg.kind] || 'Attachment';
  return msg.text ? label + ': ' + msg.text : label;
}

function statusName(n) {
  switch (Number(n)) {
    case 1: return 'pending';
    case 2: return 'sent';
    case 3: return 'delivered';
    case 4: return 'read';
    case 5: return 'played';
    default: return null;
  }
}

function toMs(ts) {
  if (ts == null) return 0;
  const n = typeof ts === 'object' && ts.low != null ? ts.low : Number(ts);
  if (!n) return 0;
  return n < 1e12 ? n * 1000 : n;
}

function prettyJid(jid) {
  if (!jid) return 'Unknown';
  const s = String(jid);
  const user = s.split('@')[0];
  if (isJidGroup(s)) return 'Group ' + user.slice(-4);
  // A LID is an opaque identity, not a dialable number. Showing it with a
  // plus sign in front invents a phone number that is not real.
  if (isLidUser(s)) return 'WhatsApp user';
  return '+' + user;
}
