// Telegram adapter.
//
// Unlike WhatsApp, this one is above board. TDLib is Telegram's own client
// library, published by Telegram specifically so people can build clients, so
// there is no terms grey area and no ban risk from the client existing.
//
// Same contract as the WhatsApp adapter: Telegram types never leave this file.
// Everything emitted is already a Chat or a Message in the app's own shape.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import * as tdl from 'tdl';
import { getTdjson } from 'prebuilt-tdlib';

const DATA = path.resolve('data');
const CREDS = path.join(DATA, 'telegram.json');
const DB = path.join(DATA, 'tdlib', 'db');
const FILES = path.join(DATA, 'tdlib', 'files');

let configured = false;

export const CAPABILITIES = {
  id: 'telegram',
  label: 'Telegram',
  colour: '#2AABEE',
  official: true,          // Telegram publishes the library we are using
  text: true,
  audio: true,
  media: true,
  reactions: true,
  replies: true,
  forward: true,
  deleteForEveryone: true,
  edit: true,
  editWindowMs: 48 * 60 * 60 * 1000,
  pin: true,
  mute: true,
  archive: true,
  drafts: true,
  maxAttachmentBytes: 2 * 1024 * 1024 * 1024,   // Telegram allows 2GB
};

export function hasCredentials() {
  try {
    const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
    return Boolean(c.apiId && c.apiHash);
  } catch {
    return false;
  }
}

export class Telegram extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.client = null;
    this.status = 'offline';        // offline | needPhone | needCode | needPassword | connecting | online
    this.me = null;
    this.hint = null;               // what the login screen should say next
    this.files = new Map();         // our message id -> telegram file id
    this.stopping = false;
  }

  creds() {
    const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
    if (!c.apiId || !c.apiHash) throw new Error('Telegram credentials are incomplete.');
    return c;
  }

  isLinked() {
    try {
      return fs.existsSync(path.join(DB, 'db.sqlite')) || fs.existsSync(path.join(DB, 'td.binlog'));
    } catch {
      return false;
    }
  }

  setStatus(s, extra = {}) {
    this.status = s;
    this.emit('status', Object.assign({ network: 'telegram', status: s, me: this.me, linked: this.isLinked() }, extra));
  }

  async start() {
    if (!hasCredentials()) {
      this.setStatus('offline', { reason: 'noCredentials' });
      return;
    }
    if (this.client) return;

    if (!configured) {
      tdl.configure({ tdjson: getTdjson() });
      configured = true;
    }
    fs.mkdirSync(DB, { recursive: true });
    fs.mkdirSync(FILES, { recursive: true });

    const { apiId, apiHash } = this.creds();
    this.stopping = false;
    this.setStatus('connecting');

    this.client = tdl.createClient({
      apiId,
      apiHash,
      databaseDirectory: DB,
      filesDirectory: FILES,
      skipOldUpdates: true,
      tdlibParameters: {
        application_version: '0.1.0',
        device_model: 'Parley Desktop',
        system_language_code: 'en',
      },
    });

    this.client.on('error', (e) => {
      // A failed auth step is a message for the user, not a crash.
      this.emit('error', 'Telegram: ' + (e?.message || String(e)));
    });

    this.client.on('update', (u) => {
      try {
        this.onUpdate(u);
      } catch (e) {
        this.emit('error', 'Telegram update failed: ' + e.message);
      }
    });

    // tdl's own login() wants interactive callbacks. We drive the state
    // machine ourselves so the UI can collect each step.
    this.client.loginAsCustom?.(() => ({
      getPhoneNumber: () => new Promise(() => {}),
      getAuthCode: () => new Promise(() => {}),
      getPassword: () => new Promise(() => {}),
    }));
  }

  // ---- auth state machine ---------------------------------------

  onUpdate(u) {
    if (u._ === 'updateAuthorizationState') return this.onAuth(u.authorization_state);
    if (u._ === 'updateNewChat') return this.ingestChat(u.chat);
    if (u._ === 'updateChatLastMessage') return this.onChatLastMessage(u);
    if (u._ === 'updateChatTitle') return this.patchChat(u.chat_id, { name: u.title });
    if (u._ === 'updateChatReadInbox') return this.patchChat(u.chat_id, { unread: u.unread_count });
    if (u._ === 'updateChatPosition') return this.onPosition(u);
    if (u._ === 'updateNewMessage') return this.ingestMessage(u.message, true);
    if (u._ === 'updateMessageContent') return this.onEdited(u);
    if (u._ === 'updateUserStatus') return this.onPresence(u);
    if (u._ === 'updateUser') return this.onUser(u.user);
  }

  async onAuth(state) {
    switch (state._) {
      case 'authorizationStateWaitPhoneNumber':
        this.hint = 'Enter the phone number for your Telegram account, with the country code.';
        this.setStatus('needPhone', { hint: this.hint });
        break;
      case 'authorizationStateWaitCode':
        this.hint = 'Telegram sent a code to your other devices. Enter it here.';
        this.setStatus('needCode', { hint: this.hint });
        break;
      case 'authorizationStateWaitPassword':
        this.hint = state.password_hint
          ? 'Two step verification is on. Hint: ' + state.password_hint
          : 'Two step verification is on. Enter your password.';
        this.setStatus('needPassword', { hint: this.hint });
        break;
      case 'authorizationStateReady': {
        this.setStatus('connecting');
        try {
          const me = await this.client.invoke({ _: 'getMe' });
          this.me = {
            id: 'tg:' + me.id,
            name: [me.first_name, me.last_name].filter(Boolean).join(' ') || me.usernames?.editable_username || 'You',
          };
        } catch { /* keep going without a display name */ }
        await this.loadChats();
        this.setStatus('online');
        break;
      }
      case 'authorizationStateLoggingOut':
      case 'authorizationStateClosed':
        this.me = null;
        if (!this.stopping) this.setStatus('offline');
        break;
      default:
        break;
    }
  }

  async submitPhone(phone) {
    if (!this.client) await this.start();
    await this.client.invoke({ _: 'setAuthenticationPhoneNumber', phone_number: String(phone).trim() });
  }

  async submitCode(code) {
    try {
      await this.client.invoke({ _: 'checkAuthenticationCode', code: String(code).trim() });
    } catch (e) {
      this.emit('authError', friendly(e));
      throw new Error(friendly(e));
    }
  }

  async submitPassword(password) {
    try {
      await this.client.invoke({ _: 'checkAuthenticationPassword', password: String(password) });
    } catch (e) {
      this.emit('authError', friendly(e));
      throw new Error(friendly(e));
    }
  }

  async logout() {
    this.stopping = true;
    try {
      await this.client?.invoke({ _: 'logOut' });
    } catch { /* may already be gone */ }
    try {
      await this.client?.close();
    } catch { /* ignore */ }
    this.client = null;
    this.me = null;
    try {
      fs.rmSync(path.join(DATA, 'tdlib'), { recursive: true, force: true });
    } catch { /* nothing to remove */ }
    this.setStatus('offline', { reason: 'unlinked' });
  }

  async stop() {
    this.stopping = true;
    try { await this.client?.close(); } catch { /* ignore */ }
    this.client = null;
    this.setStatus('offline');
  }

  // ---- chats ----------------------------------------------------

  async loadChats() {
    try {
      await this.client.invoke({ _: 'loadChats', chat_list: { _: 'chatListMain' }, limit: 100 });
    } catch { /* "no more chats" is reported as an error, which is fine */ }
    this.emit('chats', this.store.chatList());
  }

  key(chatId) { return 'tg:' + chatId; }

  ingestChat(c) {
    if (!c || !c.id) return;
    const id = this.key(c.id);
    const isGroup = ['chatTypeBasicGroup', 'chatTypeSupergroup'].includes(c.type?._);
    const chat = {
      id,
      network: 'telegram',
      name: c.title || 'Telegram chat',
      isGroup,
      unread: c.unread_count || 0,
      muted: (c.notification_settings?.mute_for || 0) > 0,
      pinned: false,
      archived: false,
    };
    if (c.photo?.small?.id) chat.photoId = c.photo.small.id;
    if (c.last_message) {
      chat.lastTs = toMs(c.last_message.date);
      chat.lastText = previewOf(c.last_message);
      chat.lastFromMe = !!c.last_message.is_outgoing;
    }
    this.emit('chat', this.store.upsertChat(chat));
  }

  patchChat(chatId, patch) {
    const id = this.key(chatId);
    if (!this.store.getChat(id)) return;
    this.emit('chat', this.store.upsertChat(Object.assign({ id }, patch)));
  }

  onPosition(u) {
    const archived = (u.position?.list?._ === 'chatListArchive');
    const pinned = !!u.position?.is_pinned;
    this.patchChat(u.chat_id, { archived, pinned });
  }

  onChatLastMessage(u) {
    if (!u.last_message) return;
    this.patchChat(u.chat_id, {
      lastTs: toMs(u.last_message.date),
      lastText: previewOf(u.last_message),
      lastFromMe: !!u.last_message.is_outgoing,
    });
  }

  onUser(user) {
    if (!user?.id) return;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    if (name) this.store.setContact('tg:' + user.id, name);
  }

  onPresence(u) {
    const online = u.status?._ === 'userStatusOnline';
    this.emit('presence', { chatId: this.key(u.user_id), state: online ? 'available' : 'unavailable' });
  }

  // ---- messages -------------------------------------------------

  ingestMessage(m, notify = false) {
    if (!m || !m.chat_id) return null;
    const chatId = this.key(m.chat_id);
    const content = m.content || {};
    const kind = kindOf(content._);
    if (kind === 'skip') return null;

    const id = chatId + ':' + m.id;
    const fromId = m.sender_id?.user_id ? 'tg:' + m.sender_id.user_id : chatId;
    const chat = this.store.getChat(chatId) || {};

    const file = fileOf(content);
    if (file) this.files.set(id, file);

    const msg = {
      id,
      chatId,
      network: 'telegram',
      fromMe: !!m.is_outgoing,
      author: m.is_outgoing ? 'You' : (this.store.contactName(fromId) || chat.name || 'Telegram user'),
      showAuthor: !!chat.isGroup && !m.is_outgoing,
      text: textOf(content),
      kind,
      ts: toMs(m.date),
      status: m.is_outgoing ? (m.sending_state ? 'pending' : 'sent') : null,
      durationSec: content.voice_note?.duration || content.audio?.duration || content.video?.duration || null,
      isVoiceNote: content._ === 'messageVoiceNote',
      mime: content.document?.mime_type || content.audio?.mime_type || content.video?.mime_type || (content._ === 'messagePhoto' ? 'image/jpeg' : null),
      fileName: content.document?.file_name || null,
      hasMedia: kind !== 'text',
      edited: !!m.edit_date,
      quoted: null,
    };

    const saved = this.store.addMessage(msg);
    const existing = this.store.getChat(chatId) || {};
    const updated = this.store.upsertChat({
      id: chatId,
      network: 'telegram',
      name: existing.name || chat.name || 'Telegram chat',
      lastTs: Math.max(existing.lastTs || 0, msg.ts),
      lastText: msg.text || labelFor(kind),
      lastFromMe: msg.fromMe,
      unread: notify && !msg.fromMe ? (existing.unread || 0) + 1 : (existing.unread || 0),
    });

    this.emit('message', saved);
    this.emit('chat', updated);
    return saved;
  }

  onEdited(u) {
    const id = this.key(u.chat_id) + ':' + u.message_id;
    const patched = this.store.updateMessage(this.key(u.chat_id), id, {
      text: textOf(u.new_content || {}),
      edited: true,
    });
    if (patched) this.emit('message', patched);
  }

  async history(chatId, limit = 50) {
    const tgId = Number(String(chatId).replace('tg:', ''));
    let got = 0;
    let from = 0;

    // TDLib returns locally cached messages and starts a download in the
    // background. The first call is routinely empty, so keep asking.
    for (let attempt = 0; attempt < 4 && got < limit; attempt++) {
      let res;
      try {
        res = await this.client.invoke({
          _: 'getChatHistory', chat_id: tgId, from_message_id: from, offset: 0, limit, only_local: false,
        });
      } catch (e) {
        this.emit('error', 'Telegram history: ' + e.message);
        break;
      }
      const batch = res?.messages || [];
      if (!batch.length) {
        await new Promise((r) => setTimeout(r, 450));   // let the fetch land
        continue;
      }
      for (const m of [...batch].reverse()) this.ingestMessage(m, false);
      got += batch.length;
      from = batch[batch.length - 1].id;                // page backwards
      if (batch.length < limit) break;
    }
    return got;
  }

  // Pin, mute and archive, so the same actions work on both networks.
  async modify(chatId, what) {
    if (this.status !== 'online') throw new Error('Telegram is not connected.');
    const tgId = Number(String(chatId).replace('tg:', ''));
    try {
      if ('pin' in what) {
        await this.client.invoke({
          _: 'toggleChatIsPinned', chat_list: { _: 'chatListMain' }, chat_id: tgId, is_pinned: !!what.pin,
        });
      }
      if ('archive' in what) {
        await this.client.invoke({
          _: 'addChatToList', chat_id: tgId,
          chat_list: { _: what.archive ? 'chatListArchive' : 'chatListMain' },
        });
      }
      if ('mute' in what) {
        await this.client.invoke({
          _: 'setChatNotificationSettings', chat_id: tgId,
          notification_settings: { _: 'chatNotificationSettings', use_default_mute_for: false, mute_for: what.mute ? 8 * 3600 : 0 },
        });
      }
      if ('unread' in what) {
        await this.client.invoke({ _: 'toggleChatIsMarkedAsUnread', chat_id: tgId, is_marked_as_unread: !!what.unread });
      }
    } catch (e) {
      throw new Error('Telegram refused that change: ' + e.message);
    }
    const next = { id: chatId };
    if ('pin' in what) next.pinned = !!what.pin;
    if ('archive' in what) next.archived = !!what.archive;
    if ('mute' in what) next.muted = !!what.mute;
    if ('unread' in what) next.unread = what.unread ? 1 : 0;
    this.emit('chat', this.store.upsertChat(next));
  }

  // ---- profile --------------------------------------------------

  async profile() {
    if (this.status !== 'online') return null;
    const me = await this.client.invoke({ _: 'getMe' });
    let full = null;
    try {
      full = await this.client.invoke({ _: 'getUserFullInfo', user_id: me.id });
    } catch { /* bio is optional */ }

    // getMe does not always carry profile_photo, so fall back through the
    // two other places TDLib keeps it before giving up.
    let photo = me.profile_photo?.big?.id || me.profile_photo?.small?.id || null;
    if (!photo) {
      try {
        const set = await this.client.invoke({ _: 'getUserProfilePhotos', user_id: me.id, offset: 0, limit: 1 });
        const sizes = set?.photos?.[0]?.sizes || [];
        photo = sizes[sizes.length - 1]?.photo?.id || null;
      } catch { /* fall through */ }
    }
    if (!photo) {
      try {
        const chat = await this.client.invoke({ _: 'getChat', chat_id: me.id });
        photo = chat?.photo?.big?.id || chat?.photo?.small?.id || null;
      } catch { /* no photo anywhere */ }
    }
    if (photo) this.files.set('tg:self', { id: photo, mime: 'image/jpeg', name: 'avatar.jpg' });

    const usernames = me.usernames?.active_usernames || [];
    return {
      id: 'tg:' + me.id,
      network: 'telegram',
      name: [me.first_name, me.last_name].filter(Boolean).join(' ') || 'You',
      firstName: me.first_name || '',
      lastName: me.last_name || '',
      username: me.usernames?.editable_username || usernames[0] || null,
      otherUsernames: usernames.slice(1),
      phone: me.phone_number ? '+' + me.phone_number : null,
      bio: full?.bio?.text || null,
      isPremium: !!me.is_premium,
      isVerified: !!me.is_verified,
      hasPhoto: !!photo,
      avatarUrl: photo ? '/avatar/tg:self' : null,
    };
  }

  // Avatars are just files, so reuse the download path.
  async avatarFor(id) {
    if (id === 'tg:self') {
      if (!this.files.has('tg:self')) await this.profile();
      return this.media('tg:self');
    }
    let photoId = this.store.getChat(id)?.photoId;
    if (!photoId) {
      // Ask Telegram directly rather than assuming the sync carried it.
      const chat = await this.client.invoke({ _: 'getChat', chat_id: Number(String(id).replace('tg:', '')) });
      photoId = chat?.photo?.small?.id || chat?.photo?.big?.id;
      if (photoId) this.store.upsertChat({ id, photoId });
    }
    if (!photoId) throw new Error('No photo for that chat.');
    this.files.set('photo:' + id, { id: photoId, mime: 'image/jpeg', name: 'avatar.jpg' });
    return this.media('photo:' + id);
  }

  // ---- actions --------------------------------------------------

  async send(chatId, text) {
    if (this.status !== 'online') throw new Error('Telegram is not connected.');
    const tgId = Number(String(chatId).replace('tg:', ''));
    await this.client.invoke({
      _: 'sendMessage',
      chat_id: tgId,
      input_message_content: { _: 'inputMessageText', text: { _: 'formattedText', text: String(text) } },
    });
  }

  async markRead(chatId) {
    if (this.status !== 'online') return;
    const tgId = Number(String(chatId).replace('tg:', ''));
    const ids = this.store.messages(chatId).slice(-20)
      .map((m) => Number(String(m.id).split(':').pop()))
      .filter(Boolean);
    if (!ids.length) return;
    try {
      await this.client.invoke({ _: 'viewMessages', chat_id: tgId, message_ids: ids, force_read: true });
    } catch { /* best effort */ }
    this.emit('chat', this.store.upsertChat({ id: chatId, unread: 0 }));
  }

  // TDLib downloads to disk, so hand back the bytes from the local copy.
  async media(id) {
    const file = this.files.get(id);
    if (!file) throw new Error('That attachment is not available on this device.');
    const got = await this.client.invoke({
      _: 'downloadFile', file_id: file.id, priority: 1, offset: 0, limit: 0, synchronous: true,
    });
    const p = got?.local?.path;
    if (!p || !fs.existsSync(p)) throw new Error('Telegram did not finish downloading that file.');
    return { buffer: fs.readFileSync(p), mime: file.mime || 'application/octet-stream', fileName: file.name || path.basename(p) };
  }
}

// ---- helpers ----------------------------------------------------

// TDLib error strings are shouty constants. Say something a person can act on.
function friendly(e) {
  const m = String(e?.message || e);
  if (/PASSWORD_HASH_INVALID|PASSWORD_INVALID/i.test(m)) return 'That password was not accepted. Check it and try again.';
  if (/PHONE_CODE_INVALID/i.test(m)) return 'That login code is not right.';
  if (/PHONE_CODE_EXPIRED/i.test(m)) return 'That code expired. Start over to get a new one.';
  if (/FLOOD_WAIT_(\d+)/i.test(m)) {
    const s = /FLOOD_WAIT_(\d+)/i.exec(m)[1];
    return 'Telegram is rate limiting this. Wait about ' + Math.ceil(Number(s) / 60) + ' minutes.';
  }
  if (/PHONE_NUMBER_INVALID/i.test(m)) return 'Telegram does not recognise that number.';
  return m;
}

function toMs(sec) { return (Number(sec) || 0) * 1000; }

function kindOf(t) {
  switch (t) {
    case 'messageText': return 'text';
    case 'messagePhoto': return 'image';
    case 'messageSticker': return 'sticker';
    case 'messageVideo':
    case 'messageAnimation': return 'video';
    case 'messageVoiceNote':
    case 'messageAudio': return 'audio';
    case 'messageDocument': return 'document';
    case 'messageLocation':
    case 'messageVenue': return 'location';
    case 'messageContact': return 'contact';
    default: return 'skip';
  }
}

function textOf(c) {
  return c.text?.text || c.caption?.text || '';
}

function labelFor(kind) {
  return { image: 'Photo', video: 'Video', audio: 'Audio', document: 'Document', sticker: 'Sticker', location: 'Location', contact: 'Contact' }[kind] || 'Attachment';
}

function previewOf(m) {
  const c = m.content || {};
  return textOf(c) || labelFor(kindOf(c._));
}

// Pull the single file we would need to download, whatever the content type.
function fileOf(c) {
  if (c._ === 'messagePhoto') {
    const sizes = c.photo?.sizes || [];
    const best = sizes[sizes.length - 1];
    return best ? { id: best.photo.id, mime: 'image/jpeg', name: null } : null;
  }
  if (c._ === 'messageVideo') return c.video?.video ? { id: c.video.video.id, mime: c.video.mime_type, name: c.video.file_name } : null;
  if (c._ === 'messageAnimation') return c.animation?.animation ? { id: c.animation.animation.id, mime: c.animation.mime_type, name: c.animation.file_name } : null;
  if (c._ === 'messageVoiceNote') return c.voice_note?.voice ? { id: c.voice_note.voice.id, mime: c.voice_note.mime_type, name: null } : null;
  if (c._ === 'messageAudio') return c.audio?.audio ? { id: c.audio.audio.id, mime: c.audio.mime_type, name: c.audio.file_name } : null;
  if (c._ === 'messageDocument') return c.document?.document ? { id: c.document.document.id, mime: c.document.mime_type, name: c.document.file_name } : null;
  if (c._ === 'messageSticker') return c.sticker?.sticker ? { id: c.sticker.sticker.id, mime: 'image/webp', name: null } : null;
  return null;
}
