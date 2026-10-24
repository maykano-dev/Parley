# Unified Messenger

A desktop messaging client that puts every network in one inbox. WhatsApp is
live; the interface and the server are already network agnostic, so a second
network is a new adapter rather than a rewrite.

## Run it

```bash
npm start
```

Then open http://localhost:5173

The server binds to `127.0.0.1` only. Nothing is reachable from your network.

## Linking WhatsApp

Two paths, both on the first screen:

- **Scan a QR code.** Phone, Settings, Linked devices, Link a device, point the
  camera at the screen. The code refreshes roughly every 20 seconds.
- **Use an 8 character code.** Type your number in full international form,
  digits only, press Get code, then on the phone choose *Link with phone number
  instead* and enter the eight characters.

Both end in the same place: this app becomes one of your account's **companion
devices**, holding its own Signal identity keys, exactly as WhatsApp Web does.
Your phone stays the primary device. There is no password and no OTP anywhere
in this flow. The number in the second path only tells WhatsApp which account
to ask.

Unlink from the phone at any time, or from the About panel in the app.

## What actually works

| | Status |
|---|---|
| Connect, reconnect with backoff, survive restarts | Working |
| QR linking | Working, verified against a live socket |
| Pairing code linking | Wired, not exercised against a real number |
| Receive text, photos, video, voice notes, documents, stickers | Working |
| Replies, group author labels, read receipts, typing indicators | Working |
| Send text | Working |
| Send voice notes | Working, transcoded to ogg/opus with ffmpeg |
| Send file attachments | Not wired |
| Search across stored messages | Working |
| Light and dark, accent, wallpaper, glass depth, radius, density | Working |
| Telegram, Discord, Slack, Signal | Rail entries only, no adapters |

## Screens

Linking (QR and code), connecting and reconnecting banner, inbox, empty inbox,
no conversation selected, conversation, search results, archived, conversation
details, appearance settings, about and limits, media lightbox, voice recording
bar, unlink confirmation. Mobile layout collapses to a single column with a
back button under 900px.

## Companion device limits, which are product constraints not bugs

- **History.** WhatsApp gives a companion a recent window, never the whole
  archive. Everything else accumulates from link time forward, so search only
  covers what this device has seen. The UI says so where it matters.
- **Four device slots.** If WhatsApp Web, the desktop app and a tablet are
  already linked, there is no slot left for this.
- **14 day leash.** If the phone never comes online for 14 days, every
  companion is unlinked and you relink.
- The phone does **not** need to be online the rest of the time.

## Account risk, stated plainly

This is an unofficial client built on a reverse engineered implementation of
the multi-device protocol. WhatsApp treats unofficial clients as a terms
violation and has restricted accounts over it, most often where the client
behaves like a bot. This one sends ordinary presence and read receipts, never
bulk sends, and keeps the protocol library current, which keeps it in normal
client territory. The risk is not zero. **Link a secondary number first if
losing the account would hurt.**

## Layout

```
server/
  index.js   http + websocket bridge, media streaming, ffmpeg transcode
  wa.js      WhatsApp adapter: Baileys in, normalised Chat/Message out
  store.js   JSON persistence, bounded per chat
web/
  index.html every screen
  app.css    design tokens, both themes, glass, custom scrollbars
  app.js     rendering, websocket client, appearance state
data/        session keys and message store, gitignored, never commit
```

The rule that keeps this extensible: **the UI never imports a protocol
library.** It only ever sees `Chat` and `Message`. `wa.js` is the only file
that knows Baileys exists. Adding Telegram means writing `server/tg.js` against
the same shape and adding it to the rail.

`CAPABILITIES` in `wa.js` declares what a network supports. Read it rather than
assuming every network can do everything; that is what stops the UI collapsing
to a lowest common denominator as networks are added.

## Security notes

- Session keys live in `data/auth`. Treat that directory like a password.
- Message content is never written to a log. The protocol logger is silent by
  default; `WA_LOG=debug npm start` turns it up for debugging only.
- Media is decrypted on demand and streamed from memory, never cached to disk.
- `data/` is gitignored. Keep it that way.

## Known rough edges

- File attachments cannot be sent yet.
- The store is JSON, which is fine at this size and will want SQLite once a
  chat list runs into the thousands.
- Reactions arrive but are not rendered yet.
- No desktop notifications yet; the next obvious step is the Notifications API
  plus a tray, which is where a web shell starts wanting to be Electron or
  Tauri.
- The old marketing site that used to be in this folder is in
  `_archive-old-site/`. It was moved rather than deleted so nothing is lost;
  delete it whenever you like.
