// Universal media vault.
//
// Two modes, deliberately:
//
//   Reference  the default. The vault is an index over attachments that
//              already exist in your conversations. Nothing is copied. Opening
//              an item decrypts it on demand and streams it from memory.
//
//   Saved      an explicit, per-file copy into data/vault, which you own and
//              can delete. Nothing lands here unless you ask for it.
//
// The index is derived, never authoritative, so it costs nothing to rebuild
// and there is no second source of truth to drift.

import fs from 'node:fs';
import path from 'node:path';

const VAULT_DIR = path.resolve('data', 'vault');
const MANIFEST = path.join(VAULT_DIR, 'manifest.json');

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav',
  'application/pdf': 'pdf', 'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

// Buckets the UI filters by. 'link' is synthesised from message text.
const BUCKET = {
  image: 'image', sticker: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
};

// Heuristics, applied to filename and caption only. Deliberately conservative:
// a wrong auto-category is worse than no category.
const SMART = [
  ['receipts', /\b(receipt|invoice|inv[-_ ]?\d|bill|payment|paid|order\s?#?\d)/i],
  ['travel', /\b(ticket|boarding|itinerary|flight|visa|passport|booking|reservation|hotel)/i],
  ['work', /\b(report|proposal|contract|agreement|cv|resume|deck|slides?|budget|minutes|quotation|quote|spec)/i],
  ['screenshots', /(screen[\s_-]?shot|^img[-_]\d|^photo[-_]\d|^scr[-_])/i],
];

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

export class Vault {
  constructor(store) {
    this.store = store;
    fs.mkdirSync(VAULT_DIR, { recursive: true });
    this.manifest = this.readManifest();
  }

  readManifest() {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    } catch {
      return {};
    }
  }

  writeManifest() {
    try {
      fs.writeFileSync(MANIFEST, JSON.stringify(this.manifest, null, 2));
    } catch (e) {
      console.error('[vault] manifest write failed:', e.message);
    }
  }

  // ---- index ----------------------------------------------------

  // Every attachment and link across every conversation, newest first.
  index() {
    const out = [];
    const chats = this.store.data.chats || {};

    for (const [chatId, list] of Object.entries(this.store.data.messages || {})) {
      const chat = chats[chatId] || {};
      for (const m of list) {
        if (m.deleted) continue;

        const bucket = BUCKET[m.kind];
        if (bucket) {
          const name = m.fileName || suggestedName(m, bucket);
          out.push({
            id: m.id,
            kind: bucket,
            chatId,
            chatName: chat.name || chatId,
            isGroup: !!chat.isGroup,
            from: m.fromMe ? 'You' : (m.author || chat.name || 'Unknown'),
            fromMe: !!m.fromMe,
            ts: m.ts,
            name,
            caption: m.text || '',
            mime: m.mime || '',
            durationSec: m.durationSec || null,
            isVoiceNote: !!m.isVoiceNote,
            saved: !!this.manifest[m.id],
            bytes: this.manifest[m.id]?.bytes || null,
            tags: smartTags(name + ' ' + (m.text || ''), bucket),
          });
          continue;
        }

        // Links are not attachments, but they are the thing people hunt for
        // most often after files, so the vault indexes them too.
        if (m.kind === 'text' && m.text) {
          const found = m.text.match(URL_RE);
          if (!found) continue;
          for (const url of [...new Set(found)].slice(0, 4)) {
            out.push({
              id: m.id + '#' + hash(url),
              messageId: m.id,
              kind: 'link',
              chatId,
              chatName: chat.name || chatId,
              isGroup: !!chat.isGroup,
              from: m.fromMe ? 'You' : (m.author || chat.name || 'Unknown'),
              fromMe: !!m.fromMe,
              ts: m.ts,
              name: hostOf(url),
              url,
              caption: m.text.length > 160 ? m.text.slice(0, 160) + '…' : m.text,
              tags: smartTags(m.text, 'link'),
            });
          }
        }
      }
    }

    out.sort((a, b) => b.ts - a.ts);
    return out;
  }

  stats(index) {
    const by = { image: 0, video: 0, audio: 0, document: 0, link: 0 };
    for (const i of index) by[i.kind] = (by[i.kind] || 0) + 1;
    const savedIds = Object.keys(this.manifest);
    const bytes = savedIds.reduce((n, k) => n + (this.manifest[k].bytes || 0), 0);
    return { total: index.length, by, saved: savedIds.length, bytes };
  }

  // ---- saving ---------------------------------------------------

  async save(id, download) {
    if (this.manifest[id]) return this.manifest[id];
    const { buffer, mime, fileName } = await download(id);
    const ext = EXT[String(mime).split(';')[0].trim()] || guessExt(fileName) || 'bin';
    const safe = id.replace(/[^A-Za-z0-9_-]/g, '') + '.' + ext;
    fs.writeFileSync(path.join(VAULT_DIR, safe), buffer);
    this.manifest[id] = {
      file: safe,
      mime,
      name: fileName || safe,
      bytes: buffer.length,
      savedAt: Date.now(),
    };
    this.writeManifest();
    return this.manifest[id];
  }

  remove(id) {
    const entry = this.manifest[id];
    if (!entry) return false;
    try {
      fs.unlinkSync(path.join(VAULT_DIR, entry.file));
    } catch { /* already gone from disk */ }
    delete this.manifest[id];
    this.writeManifest();
    return true;
  }

  clear() {
    const n = Object.keys(this.manifest).length;
    for (const id of Object.keys(this.manifest)) this.remove(id);
    return n;
  }

  // Path of a saved copy, so it can be served without touching the network.
  localPath(id) {
    const entry = this.manifest[id];
    if (!entry) return null;
    const p = path.join(VAULT_DIR, entry.file);
    return fs.existsSync(p) ? { path: p, mime: entry.mime, name: entry.name } : null;
  }
}

// ---- helpers ----------------------------------------------------

function smartTags(text, bucket) {
  const tags = [];
  for (const [tag, re] of SMART) if (re.test(text)) tags.push(tag);
  if (!tags.length && bucket === 'image' && /screen/i.test(text)) tags.push('screenshots');
  return tags;
}

function suggestedName(m, bucket) {
  const d = new Date(m.ts);
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, '');
  if (bucket === 'audio') return (m.isVoiceNote ? 'Voice note ' : 'Audio ') + stamp;
  if (bucket === 'image') return 'Photo ' + stamp;
  if (bucket === 'video') return 'Video ' + stamp;
  return 'File ' + stamp;
}

function guessExt(name) {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : null;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
