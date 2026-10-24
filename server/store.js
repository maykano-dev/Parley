// Persistence. Baileys 6.7 dropped makeInMemoryStore, so the app owns its
// own chat/message store. JSON on disk, debounced writes, bounded per chat.

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('data');
const FILE = path.join(DIR, 'store.json');
const MAX_PER_CHAT = 400;
const MAX_MEDIA = 900;

const empty = () => ({ chats: {}, messages: {}, contacts: {}, media: {}, me: null });

export class Store {
  constructor() {
    fs.mkdirSync(DIR, { recursive: true });
    this.data = empty();
    this.dirty = false;
    this.timer = null;
    this.load();
    setInterval(() => this.flush(), 4000).unref();
  }

  load() {
    try {
      const raw = fs.readFileSync(FILE, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = Object.assign(empty(), parsed);
    } catch {
      this.data = empty();
    }
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.writeFileSync(FILE, JSON.stringify(this.data));
    } catch (e) {
      console.error('[store] write failed:', e.message);
    }
  }

  touch() {
    this.dirty = true;
  }

  reset() {
    this.data = empty();
    this.dirty = true;
    this.flush();
  }

  // ---- contacts -------------------------------------------------

  setContact(jid, name) {
    if (!jid || !name) return;
    if (this.data.contacts[jid] === name) return;
    this.data.contacts[jid] = name;
    this.touch();
  }

  contactName(jid) {
    return this.data.contacts[jid] || null;
  }

  // ---- chats ----------------------------------------------------

  upsertChat(chat) {
    const prev = this.data.chats[chat.id] || {};
    const next = Object.assign({}, prev, chat);
    // never let a blank name overwrite a real one
    if (!chat.name && prev.name) next.name = prev.name;
    this.data.chats[chat.id] = next;
    this.touch();
    return next;
  }

  getChat(id) {
    return this.data.chats[id] || null;
  }

  chatList() {
    return Object.values(this.data.chats)
      .filter((c) => !c.hidden)
      .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
  }

  // ---- media handles --------------------------------------------
  // Decryption needs the original message. Holding it only in memory meant a
  // restart orphaned every attachment, so the reference mode of the vault
  // would break on relaunch. Persist a bounded set instead.

  rememberMedia(id, raw) {
    const m = (this.data.media ||= {});
    if (m[id]) return;
    m[id] = { at: Date.now(), raw };
    const ids = Object.keys(m);
    if (ids.length > MAX_MEDIA) {
      ids.sort((a, b) => (m[a].at || 0) - (m[b].at || 0));
      for (const old of ids.slice(0, ids.length - MAX_MEDIA)) delete m[old];
    }
    this.touch();
  }

  mediaHandle(id) {
    return this.data.media?.[id]?.raw || null;
  }

  // ---- messages -------------------------------------------------

  addMessage(msg) {
    const list = (this.data.messages[msg.chatId] ||= []);
    const at = list.findIndex((m) => m.id === msg.id);
    if (at >= 0) {
      list[at] = Object.assign({}, list[at], msg);
    } else {
      list.push(msg);
      list.sort((a, b) => a.ts - b.ts);
      if (list.length > MAX_PER_CHAT) list.splice(0, list.length - MAX_PER_CHAT);
    }
    this.touch();
    return msg;
  }

  updateMessage(chatId, id, patch) {
    const list = this.data.messages[chatId];
    if (!list) return null;
    const at = list.findIndex((m) => m.id === id);
    if (at < 0) return null;
    list[at] = Object.assign({}, list[at], patch);
    this.touch();
    return list[at];
  }

  findMessage(id) {
    for (const [chatId, list] of Object.entries(this.data.messages)) {
      const hit = list.find((m) => m.id === id);
      if (hit) return { chatId, message: hit };
    }
    return null;
  }

  messages(chatId) {
    return this.data.messages[chatId] || [];
  }

  search(term) {
    const q = term.trim().toLowerCase();
    if (q.length < 2) return [];
    const out = [];
    for (const [chatId, list] of Object.entries(this.data.messages)) {
      const chat = this.getChat(chatId);
      for (const m of list) {
        if (m.text && m.text.toLowerCase().includes(q)) {
          out.push({ chatId, chatName: chat ? chat.name : chatId, message: m });
          if (out.length > 80) return out;
        }
      }
    }
    return out.sort((a, b) => b.message.ts - a.message.ts);
  }
}
