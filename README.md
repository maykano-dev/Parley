# Parley

**One inbox for every messaging network.** A desktop client that brings your
conversations together without asking you to give up your accounts.

Parley connects to each network the way that network intends. Telegram through
TDLib, which Telegram publishes for exactly this. WhatsApp as a companion
device, the same mechanism WhatsApp Web uses. Your phone stays the primary
device, no password is ever handled, and nothing is routed through a server we
control, because there isn't one.

![Accounts](docs/screenshots/accounts.png)

---

## Status

Early, honest about it, and usable.

| Network | State | Risk |
|---|---|---|
| **Telegram** | Connected through TDLib. Chats, history, send, receive, media. | None. Telegram supports third party clients. |
| **WhatsApp** | Connected as a companion device. Chats, history, send, receive, all media types, voice notes, reactions, replies, edit, delete, forward. | Unofficial client. See [Account risk](#account-risk). |
| Discord | Not built. Bot accounts only, by design. | Personal accounts through the API are selfbots, which Discord bans. |
| Slack | Not built. | Official API, needs a workspace app and OAuth. |
| Signal | Not built. | Possible via signal-cli as a linked device. Adds a Java dependency. |

---

## Install

### From a release

Download the file for your platform from
[Releases](https://github.com/maykano-dev/Parley/releases).

| Platform | File | How to run |
|---|---|---|
| **Linux** | `Parley-x.y.z.AppImage` | `chmod +x Parley-*.AppImage && ./Parley-*.AppImage` |
| **Linux (Debian, Ubuntu)** | `parley_x.y.z_amd64.deb` | `sudo apt install ./parley_*.deb` |
| **Linux (Fedora, RHEL)** | `parley-x.y.z.x86_64.rpm` | `sudo dnf install ./parley-*.rpm` |
| **Windows** | `Parley-x.y.z-x64.exe` | Run the installer, or use the portable build |
| **macOS** | `Parley-x.y.z-x64.dmg` | Open the dmg and drag Parley to Applications |

On macOS the build is unsigned, so the first launch needs
**right click, Open** rather than a double click. On Linux, voice notes want
`ffmpeg` on your `PATH`; without it they still send, just in a format some
clients will not play.

### From source

Needs **Node 20 or newer**.

```bash
git clone https://github.com/maykano-dev/Parley.git
cd Parley
npm install
npm start
```

`npm start` opens the desktop app. `npm run serve` runs the bridge alone and
serves the interface at `http://127.0.0.1:5173` if you would rather use a
browser.

### Build installers yourself

```bash
npm run dist:linux     # AppImage, deb, rpm
npm run dist           # whatever your current platform supports
npm run dist:all       # linux, windows and macos targets
```

Cross building to macOS from Linux produces an unsigned artifact. Windows and
Linux targets cross build fine.

---

## Connecting an account

Open **Accounts** in the left rail.

### Telegram

Telegram issues credentials per application. Go to
[my.telegram.org](https://my.telegram.org), **API development tools**, create an
app, then put the pair in `data/telegram.json`:

```json
{
  "apiId": 0,
  "apiHash": ""
}
```

Restart Parley, press **Connect**, and sign in with your phone number, the
login code Telegram sends to your other devices, and your two step password if
you have one.

> Keep `api_hash` private. `data/` is excluded from git. Never commit it.

### WhatsApp

Press **Link a device** and either scan the QR code, or switch to
**Use an 8 character code**, enter your number, and type the code into
**Linked devices, Link a device, Link with phone number instead** on your
phone.

![Linking WhatsApp](docs/screenshots/link-whatsapp.png)

---

## What it does

**Unified inbox.** Conversations from every connected network in one list,
sorted by recency, filterable by unread, groups, direct, or network.

**The interaction layer you expect.** Drag and drop files anywhere in a
conversation, paste screenshots straight from the clipboard, right click any
message for reply, react, copy, save, forward, edit and delete, right click any
chat for pin, mute, archive and mark unread. Per chat drafts that survive
switching. Up arrow in an empty composer edits your last message.

**Voice notes.** Record in the app; it transcodes to ogg/opus with ffmpeg so
the other side can actually play it.

**Media vault.** Every attachment and link across every conversation, indexed
in one place.

![Vault](docs/screenshots/vault.png)

- Filter by images, video, documents, audio, links, or saved
- Search across filename, caption, sender, chat and auto tags
- Conservative auto tagging: receipts, travel, work, screenshots
- **Reference mode by default.** Nothing is copied. The vault is an index over
  files that already exist in your conversations
- **Save to vault** is explicit, per file, with a running total and a one click
  purge

**Appearance.** Light and dark, seven accents, six wallpapers, glass depth,
corner radius and density, all applied live.

![Appearance](docs/screenshots/appearance.png)

---

## Account risk

Read this before linking WhatsApp.

Parley talks to WhatsApp through a reverse engineered implementation of the
multi-device companion protocol. WhatsApp treats unofficial clients as a terms
violation and **has restricted accounts over it**, including a ban wave in May
2025 that hit people doing nothing but reading and replying normally.

Most bans follow behaviour: bulk sending, mass group invites, high velocity
messaging to strangers, bot style auto replies. Parley does none of that. It
sends ordinary presence and read receipts, one message at a time, only when you
press send. That puts you in normal client territory, which is the biggest
factor in your favour.

It does not make you safe. Meta can also fingerprint the client itself, and no
amount of good behaviour prevents that. A ban hits the **whole account**, not
just Parley.

**Link a secondary number first if losing the account would hurt.**

Telegram has none of this. TDLib is Telegram's own library and third party
clients are explicitly supported.

---

## Companion device limits

These are properties of WhatsApp, not bugs:

- **History is a window.** A companion gets recent history at link time, never
  your whole archive. Search only covers what this device has seen.
- **Four device slots.** WhatsApp Web, the desktop app and a tablet all compete
  for the same four.
- **14 day leash.** If your phone stays offline for 14 days, every companion is
  unlinked.
- Your phone does **not** need to be online the rest of the time.

---

## Privacy

- Everything runs on your machine. The bridge binds to `127.0.0.1` only.
- There is no Parley server. Nothing is relayed, nothing is collected.
- Session keys live in `data/`. Treat that directory like a password.
- Message content is never written to a log. The protocol logger is silent by
  default; `WA_LOG=debug npm run serve` turns it up for debugging only.
- Media is decrypted on demand and streamed from memory unless you explicitly
  save it to the vault.

---

## Layout

```
server/
  index.js   http and websocket bridge, uploads, media, ffmpeg transcode
  wa.js      WhatsApp adapter      Baileys in, normalised events out
  tg.js      Telegram adapter      TDLib in, normalised events out
  vault.js   media index and the saved file store
  store.js   bounded JSON persistence
web/
  index.html every screen
  app.css    design tokens, both themes, glass, custom scrollbars
  app.js     rendering, websocket client, interaction layer
electron/
  main.cjs   desktop shell: tray, single instance, unread badge, updates
scripts/
  screenshots.cjs   regenerates the images in this README
```

**The rule that keeps this extensible: the interface never imports a protocol
library.** It only ever sees `Chat` and `Message`. One router picks the adapter
from the chat id prefix. Each adapter exports a `CAPABILITIES` object declaring
what its network supports, so the UI greys out what a network cannot do instead
of flattening every network to a lowest common denominator.

Adding a network is a new file in `server/`, not a rewrite.

---

## Screenshots

The images here are generated, not curated:

```bash
npm run shots
```

Views that need a connected account are skipped when nothing is linked, so this
never produces a screenshot of data that does not exist.

---

## Known gaps

- Sending attachments on Telegram is not wired; receiving works
- Reactions arrive on both networks but are only sendable on WhatsApp
- No desktop notifications yet
- The store is JSON, which will want SQLite once chat lists run to thousands
- WhatsApp calls and Status are not available to companion devices at all

---

## Licence

MIT. See [LICENSE](LICENSE).

Parley is not affiliated with, endorsed by, or connected to WhatsApp, Meta,
Telegram, Discord, Slack or Signal. All trademarks belong to their owners.
