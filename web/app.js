import { COUNTRIES, flagOf, guessCountry } from '/countries.js';

// Client. Talks to the local bridge over a WebSocket, renders the unified
// inbox, and owns all appearance state. Knows nothing about Baileys: it only
// ever sees the app's own Chat/Message shape.

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const NETWORKS = {
  whatsapp: {
    label: 'WhatsApp', colour: '#25D366', live: true,
    path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
  },
  telegram: { label: 'Telegram', colour: '#2AABEE', live: false, path: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z' },
  slack:    { label: 'Slack',    colour: '#E01E5A', live: false, path: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z' },
  matrix:   { label: 'Matrix',   colour: '#000000', live: false, path: 'M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.481.314.448.208.785.582 1.02 1.108.254-.374.6-.706 1.034-.992.434-.287.95-.43 1.546-.43.453 0 .872.056 1.26.167.388.11.716.286.993.53.276.245.489.559.646.951.152.392.23.863.23 1.417v5.728h-2.349V11.52c0-.286-.01-.559-.032-.812a1.755 1.755 0 0 0-.18-.66 1.106 1.106 0 0 0-.438-.448c-.194-.11-.457-.166-.785-.166-.332 0-.6.064-.803.189a1.38 1.38 0 0 0-.48.499 1.946 1.946 0 0 0-.231.696 5.56 5.56 0 0 0-.06.785v4.768h-2.35v-4.8c0-.254-.004-.503-.018-.752a2.074 2.074 0 0 0-.143-.688 1.052 1.052 0 0 0-.415-.503c-.194-.125-.476-.19-.854-.19-.111 0-.259.024-.439.074-.18.051-.36.143-.53.282-.171.138-.319.337-.439.595-.12.259-.18.6-.18 1.02v4.966H5.46V7.81zm15.693 15.64V.55H21.72V0H24v24h-2.28v-.55z' },
  signal:   { label: 'Signal',   colour: '#3A76F0', live: false, path: 'M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm0 2.4a9.6 9.6 0 1 1 0 19.2 9.6 9.6 0 0 1 0-19.2z' },
};

const PALETTE = ['#0A84FF', '#BF5AF2', '#FF375F', '#FF9F0A', '#30D158', '#64D2FF', '#AC8E68'];
const WALLS = {
  Nebula: {
    dark: 'radial-gradient(60% 55% at 22% 18%, #3b2a7a 0%, rgba(59,42,122,0) 60%), radial-gradient(50% 50% at 82% 26%, #1b5e8f 0%, rgba(27,94,143,0) 62%), radial-gradient(55% 60% at 62% 88%, #7a2a63 0%, rgba(122,42,99,0) 60%), linear-gradient(160deg, #0d0b1c 0%, #0a0a12 60%, #0b1220 100%)',
    light: 'radial-gradient(55% 52% at 18% 16%, #FFD6BE 0%, rgba(255,214,190,0) 62%), radial-gradient(52% 50% at 84% 22%, #C9E4FF 0%, rgba(201,228,255,0) 64%), radial-gradient(55% 58% at 66% 90%, #E2D2FF 0%, rgba(226,210,255,0) 62%), linear-gradient(155deg, #FBF7FF 0%, #F1ECFB 55%, #EAF2FD 100%)',
  },
  Harmattan: {
    dark: 'radial-gradient(60% 55% at 20% 20%, #7a4a12 0%, rgba(122,74,18,0) 62%), radial-gradient(55% 50% at 80% 30%, #8f3b1b 0%, rgba(143,59,27,0) 62%), linear-gradient(160deg,#1a1208,#120d08 60%,#1c1409)',
    light: 'radial-gradient(55% 52% at 20% 18%, #FFE4C4 0%, rgba(255,228,196,0) 62%), radial-gradient(52% 50% at 82% 26%, #FFD2B0 0%, rgba(255,210,176,0) 64%), linear-gradient(155deg,#FFFAF2,#FDF2E6 60%,#FCEFE0)',
  },
  'Deep sea': {
    dark: 'radial-gradient(60% 55% at 24% 22%, #0d4a5e 0%, rgba(13,74,94,0) 62%), radial-gradient(52% 50% at 80% 28%, #123a6b 0%, rgba(18,58,107,0) 62%), linear-gradient(160deg,#061018,#040d14 60%,#061420)',
    light: 'radial-gradient(55% 52% at 20% 18%, #CFF0F5 0%, rgba(207,240,245,0) 62%), radial-gradient(52% 50% at 82% 26%, #CCE0FF 0%, rgba(204,224,255,0) 64%), linear-gradient(155deg,#F4FCFE,#EAF6FB 60%,#E6F0FC)',
  },
  Moss: {
    dark: 'radial-gradient(60% 55% at 22% 20%, #1d5236 0%, rgba(29,82,54,0) 62%), radial-gradient(52% 50% at 82% 30%, #2d5e22 0%, rgba(45,94,34,0) 62%), linear-gradient(160deg,#0a1410,#07100c 60%,#0a1610)',
    light: 'radial-gradient(55% 52% at 20% 18%, #D6F2DF 0%, rgba(214,242,223,0) 62%), radial-gradient(52% 50% at 82% 26%, #E4F3C8 0%, rgba(228,243,200,0) 64%), linear-gradient(155deg,#F7FDF8,#EEF8F0 60%,#F1F9E9)',
  },
  Plum: {
    dark: 'radial-gradient(60% 55% at 22% 20%, #5a1d55 0%, rgba(90,29,85,0) 62%), radial-gradient(52% 50% at 82% 30%, #3a1a6e 0%, rgba(58,26,110,0) 62%), linear-gradient(160deg,#150a18,#100812 60%,#140b1e)',
    light: 'radial-gradient(55% 52% at 20% 18%, #F6D9F0 0%, rgba(246,217,240,0) 62%), radial-gradient(52% 50% at 82% 26%, #DCD2FA 0%, rgba(220,210,250,0) 64%), linear-gradient(155deg,#FDF7FC,#F7F0FB 60%,#F3EEFD)',
  },
  Graphite: {
    dark: 'radial-gradient(60% 55% at 24% 20%, #2a2a30 0%, rgba(42,42,48,0) 64%), linear-gradient(160deg,#121214,#0c0c0e 60%,#121216)',
    light: 'radial-gradient(55% 52% at 22% 18%, #EAEAEF 0%, rgba(234,234,239,0) 64%), linear-gradient(155deg,#FBFBFD,#F4F4F7 60%,#F7F7FA)',
  },
};

// ---------------- state ----------------

const S = {
  ws: null,
  status: 'offline',
  linked: false,
  me: null,
  chats: [],
  messages: new Map(),
  active: null,
  filter: 'all',
  view: 'inbox',          // inbox | archived | results
  results: [],
  presence: new Map(),
  typingTimer: null,
  netFilter: null,
  pinnedAccounts: false,
  tg: { status: 'offline', linked: false, configured: false, hint: null, me: null },
  settings: load('settings', {
    theme: 'dark', accent: '#0A84FF', glass: 40, radius: 18,
    density: 'comfortable', wall: 'Nebula',
  }),
};

function load(k, fb) {
  try { return Object.assign({}, fb, JSON.parse(localStorage.getItem(k) || '{}')); }
  catch { return fb; }
}
function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
}

// ---------------- appearance ----------------

function applySettings() {
  const s = S.settings;
  const root = document.documentElement;
  root.dataset.theme = s.theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : s.theme;
  root.dataset.density = s.density;
  root.style.setProperty('--accent', s.accent);
  root.style.setProperty('--accent-deep', s.accent + 'cc');
  root.style.setProperty('--accent-glow', s.accent + '88');
  root.style.setProperty('--glass', s.glass + 'px');
  root.style.setProperty('--radius', s.radius + 'px');
  const wall = WALLS[s.wall] || WALLS.Nebula;
  root.style.setProperty('--wall', root.dataset.theme === 'light' ? wall.light : wall.dark);
  save('settings', s);
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (S.settings.theme === 'auto') applySettings();
});

// ---------------- helpers ----------------

const HUES = ['#FF9F0A,#FF6B35', '#BF5AF2,#6D5AE0', '#30D158,#0A84FF', '#FF375F,#FF9F0A', '#5E5CE6,#AF52DE', '#64D2FF,#0A84FF'];
function hue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}
function initials(name) {
  const parts = String(name || '?').replace(/^\+/, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function avatar(node, name, id, size, net) {
  node.className = 'avatar av';
  node.style.width = node.style.height = size + 'px';
  node.style.fontSize = Math.round(size * 0.34) + 'px';
  node.style.background = 'linear-gradient(145deg,' + hue(id || name || 'x') + ')';
  node.textContent = initials(name);
  if (net) {
    const dot = el('span', 'net-dot');
    dot.style.background = NETWORKS[net]?.colour || 'var(--accent)';
    dot.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="' + (NETWORKS[net]?.path || '') + '"/></svg>';
    node.appendChild(dot);
  }
  return node;
}
function clockTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function listTime(ts) {
  if (!ts) return '';
  const d = new Date(ts); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return clockTime(ts);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  if (now - d < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function dayLabel(ts) {
  const d = new Date(ts); const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ---------------- websocket ----------------

function connect() {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  S.ws = ws;
  ws.onopen = () => banner('Connected to the local bridge', 'ok', 1400);
  ws.onclose = () => {
    banner('Bridge offline. Is the server still running?', 'bad');
    setTimeout(connect, 2500);
  };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    handle(m);
  };
}
function sendWS(obj) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj));
}

function handle(m) {
  switch (m.t) {
    case 'hello':
      S.status = m.status; S.linked = m.linked; S.me = m.me;
      S.chats = m.chats || [];
      if (m.telegram) { S.tg = Object.assign({}, S.tg, m.telegram); NETWORKS.telegram.live = m.telegram.status === 'online'; }
      if (m.qr) showQR(m.qr);
      if (m.pairingCode) showCode(m.pairingCode);
      paintStatus(); renderChats(); renderMe();
      break;
    case 'status':
      S.status = m.status; S.linked = m.linked;
      if (m.me) { S.me = m.me; renderMe(); }
      paintStatus();
      break;
    case 'qr': showQR(m.qr); break;
    case 'pairing': showCode(m.code); break;
    case 'chats': S.chats = m.chats || []; renderChats(); break;
    case 'chat': {
      const i = S.chats.findIndex((c) => c.id === m.chat.id);
      if (i >= 0) S.chats[i] = Object.assign({}, S.chats[i], m.chat);
      else S.chats.push(m.chat);
      S.chats.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
      renderChats();
      if (S.active === m.chat.id) paintThreadHead();
      break;
    }
    case 'messages':
      S.messages.set(m.chatId, m.messages || []);
      if (S.active === m.chatId) renderThread();
      break;
    case 'message': {
      const list = S.messages.get(m.message.chatId) || [];
      const at = list.findIndex((x) => x.id === m.message.id);
      if (at >= 0) list[at] = Object.assign({}, list[at], m.message);
      else list.push(m.message);
      list.sort((a, b) => a.ts - b.ts);
      S.messages.set(m.message.chatId, list);
      if (S.active === m.message.chatId) renderThread();
      break;
    }
    case 'presence':
      S.presence.set(m.chatId, m.state);
      if (S.active === m.chatId) paintThreadHead();
      break;
    case 'results': S.results = m.results || []; S.view = 'results'; renderChats(); break;
    case 'tgStatus': {
      S.tg = Object.assign({}, S.tg, m);
      NETWORKS.telegram.live = S.tg.status === 'online';
      renderRail();
      if (['needPhone', 'needCode', 'needPassword'].includes(m.status) && $('#overlay').classList.contains('on')) openTelegram();
      if (m.status === 'online') banner('Telegram connected', 'ok', 2500);
      break;
    }
    case 'vault': V.items = m.items || []; V.stats = m.stats; V.loaded = true; renderVault(); break;
    case 'vaultSaved': {
      const hit = V.items.find((i) => i.id === m.id);
      if (hit) { hit.saved = !!m.entry; hit.bytes = m.entry?.bytes || null; }
      sendWS({ t: 'vault' });
      break;
    }
    case 'error': banner(m.message, 'bad', 6000); break;
  }
}

// ---------------- status + banner ----------------

let bannerTimer = null;
function banner(text, kind, ms) {
  const b = $('#banner');
  $('#banner-text').textContent = text;
  b.className = 'on ' + (kind || '');
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => { b.className = ''; }, ms);
}

function paintStatus() {
  const linking = !S.linked || S.status === 'linking';
  NETWORKS.whatsapp.live = S.status === 'online';
  renderRail();
  renderLinkSteps();
  renderAccounts();

  // Land on Accounts when nothing at all is connected, so the app is never
  // held hostage by one network's login screen.
  const anyLive = S.status === 'online' || S.tg.status === 'online';
  if (!anyLive && !document.body.classList.contains('in-link') && !document.body.classList.contains('in-vault')) {
    showAccounts();
  }
  if (anyLive && document.body.classList.contains('in-accounts') && !S.pinnedAccounts) {
    document.body.classList.remove('in-accounts');
  }

  if (S.status === 'online') banner('WhatsApp connected', 'ok', 1800);
  else if (S.status === 'connecting') banner('WhatsApp reconnecting', '', 0);
  else if (linking) banner('WhatsApp is not linked', '', 0);
}

function showView(name) {
  document.body.classList.remove('in-link', 'in-vault', 'in-accounts');
  if (name) document.body.classList.add('in-' + name);
  S.pinnedAccounts = name === 'accounts';
}
function showAccounts() { showView('accounts'); renderAccounts(); }
function showLink() { showView('link'); renderLinkSteps(); }

function renderAccounts() {
  const host = $('#accounts-body');
  if (!host) return;
  host.innerHTML = '';

  const rows = [
    {
      id: 'whatsapp',
      live: S.status === 'online',
      status: S.status === 'online' ? 'Connected' + (S.me ? ' as ' + (S.me.name || S.me.id.split('@')[0]) : '')
        : S.status === 'connecting' ? 'Reconnecting'
        : 'Not linked',
      note: 'Companion device, like WhatsApp Web. Unofficial client, so there is some account risk.',
      action: S.status === 'online' ? ['Manage', openAbout] : ['Link a device', showLink],
    },
    {
      id: 'telegram',
      live: S.tg.status === 'online',
      status: S.tg.status === 'online' ? 'Connected' + (S.tg.me ? ' as ' + S.tg.me.name : '')
        : S.tg.configured ? (S.tg.status === 'offline' ? 'Not connected' : 'Signing in')
        : 'Needs an api_id and api_hash',
      note: 'Built on TDLib, published by Telegram for third party clients. No ban risk.',
      action: [S.tg.status === 'online' ? 'Manage' : 'Connect', openTelegram],
    },
  ];

  for (const r of rows) {
    const net = NETWORKS[r.id];
    const row = el('div', 'acct');
    const mark = el('span', 'mark');
    mark.style.background = net.colour;
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="' + net.path + '"/></svg>';
    const cell = el('div', 'cell');
    cell.appendChild(el('div', 'nm', net.label));
    const st = el('div', 'st');
    const dot = el('span', 'dot');
    dot.style.background = r.live ? '#30D158' : 'var(--ink-3)';
    st.append(dot, document.createTextNode(r.status));
    cell.appendChild(st);
    cell.appendChild(el('div', 'st', r.note));
    const btn = el('button', r.live ? 'btn' : 'btn primary', r.action[0]);
    btn.onclick = r.action[1];
    row.append(mark, cell, btn);
    host.appendChild(row);
  }

  for (const id of ['signal', 'matrix', 'slack']) {
    const net = NETWORKS[id];
    const row = el('div', 'acct');
    row.style.opacity = '.55';
    const mark = el('span', 'mark');
    mark.style.background = net.colour;
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="' + net.path + '"/></svg>';
    const cell = el('div', 'cell');
    cell.appendChild(el('div', 'nm', net.label));
    cell.appendChild(el('div', 'st', {
      signal: 'Links as a legitimate secondary device through signal-cli. Signal is open source and does not ban for it.',
      matrix: 'An open protocol with no gatekeeper. Nothing to violate, nothing to be banned from.',
      slack: 'Official API. Safe, but needs a workspace app and an admin to approve it.',
    }[id]));
    row.append(mark, cell, el('span', 'tag alt', 'not built'));
    host.appendChild(row);
  }
}

function renderMe() {
  const n = $('#me-av');
  if (!S.me) return;
  avatar(n, S.me.name || 'You', S.me.id || 'me', 32, null);
  n.title = (S.me.name || '') + ' ' + (S.me.id ? '(' + S.me.id.split('@')[0] + ')' : '');
}

// ---------------- rail ----------------

function renderRail() {
  const host = $('#rail-nets');
  host.innerHTML = '';

  const all = el('button', 'rail-btn');
  all.setAttribute('aria-pressed', 'true');
  all.setAttribute('aria-label', 'All networks');
  all.title = 'All networks';
  const allMark = el('span', 'mark');
  allMark.style.background = 'var(--accent)';
  allMark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13.5h4.2l1.6 2.6h6.4l1.6-2.6H21"/><path d="M5.6 5h12.8l2.6 8.5v4A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-4z"/></svg>';
  all.appendChild(allMark);
  host.appendChild(all);

  for (const [id, net] of Object.entries(NETWORKS)) {
    const b = el('button', 'rail-btn');
    b.setAttribute('aria-label', net.label + (net.live ? '' : ', not connected'));
    b.title = net.live ? net.label : net.label + ' — adapter not built yet';
    const mark = el('span', 'mark');
    mark.style.background = net.colour;
    mark.style.opacity = net.live ? '1' : '.34';
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="' + net.path + '"/></svg>';
    b.appendChild(mark);
    if (net.live) {
      const unread = S.chats.reduce((n, c) => n + (c.network === id ? (c.unread || 0) : 0), 0);
      if (unread) {
        const bd = el('span', 'badge', unread > 99 ? '99+' : String(unread));
        b.appendChild(bd);
      }
    }
    b.onclick = () => {
      if (id === 'telegram') { openTelegram(); return; }
      if (id === 'whatsapp' && !net.live) { showLink(); return; }
      if (!net.live) { showAccounts(); return; }
      closeVault();
      S.view = 'inbox';
      S.netFilter = S.netFilter === id ? null : id;
      renderChats();
    };
    host.appendChild(b);
  }
}

// ---------------- chat list ----------------

function visibleChats() {
  let list = S.chats.filter((c) => (S.view === 'archived' ? c.archived : !c.archived));
  if (S.netFilter) list = list.filter((c) => c.network === S.netFilter);
  if (S.filter === 'unread') list = list.filter((c) => (c.unread || 0) > 0);
  if (S.filter === 'groups') list = list.filter((c) => c.isGroup);
  if (S.filter === 'direct') list = list.filter((c) => !c.isGroup);
  return list;
}

function renderChats() {
  renderRail();
  const host = $('#chats');
  host.innerHTML = '';
  $('#list-title').textContent = S.view === 'archived' ? 'Archived' : S.view === 'results' ? 'Search' : 'All messages';

  if (S.view === 'results') {
    if (!S.results.length) {
      host.appendChild(emptyNote('Nothing found', 'A companion device only receives a recent window of history, so older messages may simply not be on this device yet.'));
      return;
    }
    for (const r of S.results) {
      const b = el('button', 'row');
      const av = el('div'); avatar(av, r.chatName, r.chatId, 40, 'whatsapp'); b.appendChild(av);
      const cell = el('div', 'cell');
      const top = el('div', 'top');
      top.appendChild(el('span', 'name', r.chatName));
      top.appendChild(el('span', 'time', listTime(r.message.ts)));
      cell.appendChild(top);
      const bot = el('div', 'bot');
      bot.appendChild(el('span', 'prev', r.message.text));
      cell.appendChild(bot);
      b.appendChild(cell);
      b.onclick = () => openChat(r.chatId);
      host.appendChild(b);
    }
    return;
  }

  const list = visibleChats();
  if (!list.length) {
    host.appendChild(emptyNote(
      S.status === 'online' ? 'No conversations yet' : 'Waiting for sync',
      S.status === 'online'
        ? 'Send or receive a message and it will appear here. History sync only gives a companion device a recent window, not your whole archive.'
        : 'Still syncing with your phone. This takes a moment after linking.',
    ));
    return;
  }

  const activeIdx = list.findIndex((c) => c.id === S.active);
  list.forEach((c, i) => {
    const b = el('button', 'row' + ((c.unread || 0) > 0 ? ' unread' : '') + (i === activeIdx - 1 ? ' no-sep' : ''));
    b.setAttribute('aria-current', String(c.id === S.active));

    const av = el('div');
    avatar(av, c.name, c.id, 40, c.network);
    b.appendChild(av);

    const cell = el('div', 'cell');
    const top = el('div', 'top');
    top.appendChild(el('span', 'name', c.name));
    if (c.muted) {
      const m = el('span');
      m.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;color:var(--ink-3)"><path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
      top.appendChild(m);
    }
    if (c.lastTs) top.appendChild(el('span', 'time', listTime(c.lastTs)));
    cell.appendChild(top);

    const bot = el('div', 'bot');
    const preview = c.lastText
      ? (c.lastFromMe ? 'You: ' : '') + c.lastText
      : (c.unread ? c.unread + ' unread, not synced to this device yet' : 'No messages on this device yet');
    const prev = el('span', 'prev', preview);
    if (!c.lastText) prev.style.fontStyle = 'italic';
    bot.appendChild(prev);
    if (c.unread) bot.appendChild(el('span', 'count', c.unread > 99 ? '99+' : String(c.unread)));
    cell.appendChild(bot);

    b.appendChild(cell);
    b.onclick = () => openChat(c.id);
    b.oncontextmenu = (e) => { e.preventDefault(); openChatMenu(e.clientX, e.clientY, c); };
    host.appendChild(b);
  });
}

function emptyNote(title, body) {
  const d = el('div');
  d.style.cssText = 'padding:34px 18px;text-align:center';
  const h = el('div', null, title);
  h.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:6px';
  const p = el('div', null, body);
  p.style.cssText = 'font-size:12.5px;color:var(--ink-3);line-height:1.55';
  d.append(h, p);
  return d;
}

// ---------------- thread ----------------

function openChat(id) {
  showView(null);
  S.active = id;
  document.body.classList.add('in-thread');
  $('#thread-empty').style.display = 'none';
  $('#thread').style.display = 'flex';
  $('#btn-back').style.display = window.innerWidth <= 900 ? 'grid' : 'none';
  const chat = S.chats.find((c) => c.id === id);
  if (chat) chat.unread = 0;
  cancelCompose();
  draft.value = drafts[id] || '';
  syncComposer();
  sendWS({ t: 'open', chatId: id });
  paintThreadHead();
  renderThread();
  renderChats();
  $('#draft').focus();
}

function paintThreadHead() {
  const c = S.chats.find((x) => x.id === S.active);
  if (!c) return;
  avatar($('#th-av'), c.name, c.id, 38, c.network);
  $('#th-name').textContent = c.name;
  const net = NETWORKS[c.network] || NETWORKS.whatsapp;
  const tag = $('#th-net');
  tag.textContent = net.label;
  tag.style.color = net.colour;
  tag.style.background = net.colour + '1f';

  const pres = S.presence.get(c.id);
  const st = $('#th-status');
  st.innerHTML = '';
  if (pres === 'composing') {
    st.append(dotSpan('#30D158'), document.createTextNode('typing'));
  } else if (pres === 'available') {
    st.append(dotSpan('#30D158'), document.createTextNode('online'));
  } else {
    st.textContent = c.isGroup ? 'Group' : 'Tap for details';
  }
}
function dotSpan(colour) {
  const s = el('span');
  s.style.cssText = 'width:6px;height:6px;border-radius:50%;background:' + colour;
  return s;
}

function renderThread() {
  const host = $('#messages');
  const nearBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 140;
  host.innerHTML = '';
  const list = S.messages.get(S.active) || [];

  if (!list.length) {
    const wrap = el('div', 'center');
    const inner = el('div', 'inner');
    const g = el('div', 'glyph');
    g.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>';
    const h = el('h2', null, 'Nothing on this device yet');
    const p = el('p', null, 'WhatsApp hands a companion device a window of recent history when it is first linked, and this one was linked before that was switched on. New messages will arrive here from now on. To pull in past conversations, unlink and link again from the About panel.');
    const btn = el('button', 'btn primary', 'Try loading older messages');
    btn.style.marginTop = '18px';
    btn.onclick = () => { sendWS({ t: 'loadMore', chatId: S.active }); banner('Asked your phone for older messages', '', 3000); };
    inner.append(g, h, p, btn);
    wrap.appendChild(inner);
    host.appendChild(wrap);
    return;
  }

  // Scrollback control, once there is something to anchor on.
  const more = el('button', 'btn', 'Load older messages');
  more.style.cssText = 'align-self:center;margin-bottom:6px';
  more.onclick = () => { sendWS({ t: 'loadMore', chatId: S.active }); more.textContent = 'Asking your phone'; };
  host.appendChild(more);

  let lastDay = '';
  for (const m of list) {
    const day = dayLabel(m.ts);
    if (day !== lastDay) {
      host.appendChild(el('div', 'daysep', day));
      lastDay = day;
    }
    host.appendChild(bubble(m));
  }

  if (S.presence.get(S.active) === 'composing') {
    const t = el('div', 'msg in');
    const b = el('div', 'typing');
    b.innerHTML = '<i></i><i></i><i></i>';
    t.appendChild(b);
    host.appendChild(t);
  }

  if (nearBottom || list.length <= 1) host.scrollTop = host.scrollHeight;
}

function bubble(m) {
  const row = el('div', 'msg ' + (m.fromMe ? 'out' : 'in'));
  row.dataset.id = m.id;
  const wrap = el('div', 'bubble-wrap');
  const b = el('div', 'bubble');

  if (m.showAuthor) b.appendChild(el('span', 'author', m.author));

  if (m.quoted) {
    const q = el('div', 'quote');
    q.appendChild(el('b', null, m.quoted.author || 'Reply'));
    q.appendChild(document.createTextNode(m.quoted.text || ''));
    b.appendChild(q);
  }

  if (m.kind === 'image' || m.kind === 'sticker') {
    const img = el('img', 'media-img');
    img.src = '/media/' + encodeURIComponent(m.id);
    img.alt = m.text || 'Attachment';
    img.loading = 'lazy';
    img.onclick = () => openLightbox(img.src, img.alt);
    img.onerror = () => { img.replaceWith(fallbackAttachment('Photo could not be decrypted')); };
    if (m.kind === 'sticker') img.style.maxWidth = '180px';
    b.appendChild(img);
  } else if (m.kind === 'video') {
    const v = document.createElement('video');
    v.src = '/media/' + encodeURIComponent(m.id);
    v.controls = true;
    v.style.cssText = 'max-width:100%;border-radius:calc(var(--radius) - 6px);margin-bottom:6px';
    b.appendChild(v);
  } else if (m.kind === 'audio') {
    b.appendChild(voiceNote(m));
  } else if (m.kind === 'document') {
    const d = el('div', 'doc');
    const ico = el('span', 'ico');
    ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:17px;height:17px"><path d="M14 3v5h5"/><path d="M19 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h9l6 6v11a1 1 0 0 1-1 1z"/></svg>';
    const meta = el('div');
    meta.appendChild(el('div', null, m.fileName || 'Document'));
    const sub = el('div', null, (m.mime || '').split('/').pop() || 'file');
    sub.style.cssText = 'font-size:11.5px;opacity:.65;margin-top:1px';
    meta.appendChild(sub);
    const dl = el('a', null, 'Save');
    dl.href = '/media/' + encodeURIComponent(m.id) + '?dl=1';
    dl.style.cssText = 'margin-left:auto;font-size:12px;font-weight:600;color:inherit';
    d.append(ico, meta, dl);
    b.appendChild(d);
  } else if (m.kind === 'location') {
    b.appendChild(fallbackAttachment('Location'));
  } else if (m.kind === 'contact') {
    b.appendChild(fallbackAttachment('Contact card'));
  }

  if (m.text) {
    const t = el('div', null, m.text);
    t.style.whiteSpace = 'pre-wrap';
    b.appendChild(t);
  }

  const meta = el('div', 'meta');
  if (m.edited) meta.appendChild(el('span', 'edited', 'edited'));
  meta.appendChild(el('span', 'ts', clockTime(m.ts)));
  if (m.fromMe) meta.appendChild(tick(m.status));
  b.appendChild(meta);

  const all = (m.reactions || []).map((r) => r.emoji).concat(m.myReaction ? [m.myReaction] : []).filter(Boolean);
  if (all.length) {
    const rx = el('div', 'reactions');
    for (const e of [...new Set(all)]) rx.appendChild(el('span', null, e));
    b.appendChild(rx);
  }

  const act = el('button', 'act');
  act.setAttribute('aria-label', 'Message actions');
  act.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  act.onclick = (e) => { e.stopPropagation(); openMenu(e.clientX, e.clientY, m); };

  wrap.append(b, act);
  row.appendChild(wrap);
  row.oncontextmenu = (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, m); };
  return row;
}

function fallbackAttachment(label) {
  const d = el('div', 'doc');
  const ico = el('span', 'ico');
  ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" style="width:17px;height:17px"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l5-4.5 4.5 4 3-2.5L20 18"/></svg>';
  d.append(ico, el('div', null, label));
  return d;
}

function tick(status) {
  const s = el('span');
  const read = status === 'read' || status === 'played';
  const two = read || status === 'delivered';
  s.className = 'tick' + (read ? ' read' : '');
  s.innerHTML = two
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M2 13l3.5 3.5L13 9"/><path d="M10 15l1.5 1.5L19 9"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M4 13l4.5 4.5L20 7"/></svg>';
  s.title = status || 'sending';
  return s;
}

function voiceNote(m) {
  const wrap = el('div', 'voice');
  const audio = document.createElement('audio');
  audio.preload = 'none';
  audio.src = '/media/' + encodeURIComponent(m.id);

  const play = el('button', 'play');
  play.setAttribute('aria-label', 'Play voice message');
  const setIcon = (playing) => {
    play.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px"><path d="M8 5v14l11-7z"/></svg>';
  };
  setIcon(false);

  const bars = el('div', 'bars');
  const heights = [];
  let seed = 0;
  for (let i = 0; i < m.id.length; i++) seed = (seed * 31 + m.id.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 26; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const h = 6 + (seed >> 8) % 18;
    heights.push(h);
    const bar = el('i');
    bar.style.height = h + 'px';
    bars.appendChild(bar);
  }

  const dur = el('span', 'dur', m.durationSec ? mmss(m.durationSec) : '0:00');

  play.onclick = () => {
    if (audio.paused) { audio.play().catch(() => banner('Could not play that voice note', 'bad', 4000)); }
    else audio.pause();
  };
  audio.onplay = () => setIcon(true);
  audio.onpause = () => setIcon(false);
  audio.onended = () => { setIcon(false); [...bars.children].forEach((b) => b.classList.remove('on')); };
  audio.ontimeupdate = () => {
    const pct = audio.duration ? audio.currentTime / audio.duration : 0;
    const upto = Math.floor(pct * bars.children.length);
    [...bars.children].forEach((b, i) => b.classList.toggle('on', i <= upto));
    dur.textContent = mmss(audio.duration ? audio.duration - audio.currentTime : m.durationSec || 0);
  };
  audio.onloadedmetadata = () => { if (audio.duration && isFinite(audio.duration)) dur.textContent = mmss(audio.duration); };

  wrap.append(play, bars, dur);
  if (m.isVoiceNote === false) {
    const tagged = el('span');
    tagged.style.cssText = 'font-size:10.5px;opacity:.6';
    tagged.textContent = 'audio';
    wrap.appendChild(tagged);
  }
  return wrap;
}

// ---------------- composer ----------------

const draft = $('#draft');
function syncComposer() {
  const has = draft.value.trim().length > 0;
  $('#btn-send').style.display = has ? 'grid' : 'none';
  $('#btn-mic').style.display = has ? 'none' : 'grid';
  draft.style.height = 'auto';
  draft.style.height = Math.min(draft.scrollHeight, 120) + 'px';
}
draft.addEventListener('input', () => {
  syncComposer();
  if (!S.active) return;
  if (draft.value.trim()) drafts[S.active] = draft.value; else delete drafts[S.active];
  saveDrafts();
  sendWS({ t: 'typing', chatId: S.active, on: true });
  clearTimeout(S.typingTimer);
  S.typingTimer = setTimeout(() => sendWS({ t: 'typing', chatId: S.active, on: false }), 2200);
});
draft.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
});


// ---- voice recording ----
let rec = null, chunks = [], recStart = 0, recTick = null;

$('#btn-mic').onclick = async () => {
  if (!S.active) return;
  if (!navigator.mediaDevices?.getUserMedia) { banner('This browser will not give us a microphone', 'bad', 4000); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => stream.getTracks().forEach((t) => t.stop());
    rec.start();
    recStart = Date.now();
    $('#composer').style.display = 'none';
    $('#rec-bar').style.display = 'flex';
    recTick = setInterval(() => { $('#rec-time').textContent = mmss((Date.now() - recStart) / 1000); }, 200);
  } catch {
    banner('Microphone permission was refused', 'bad', 4000);
  }
};

function stopRecording() {
  clearInterval(recTick);
  $('#composer').style.display = 'flex';
  $('#rec-bar').style.display = 'none';
}

$('#rec-cancel').onclick = () => { try { rec?.stop(); } catch {} chunks = []; stopRecording(); };

$('#rec-send').onclick = () => {
  if (!rec) return;
  const seconds = (Date.now() - recStart) / 1000;
  rec.onstop = async () => {
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    sendWS({ t: 'sendAudio', chatId: S.active, seconds, mime: blob.type, data: btoa(bin) });
    stopRecording();
  };
  try { rec.stop(); } catch { stopRecording(); }
};

// ---------------- search / filters / views ----------------

let searchTimer = null;
$('#q').addEventListener('input', (e) => {
  const term = e.target.value.trim();
  clearTimeout(searchTimer);
  if (term.length < 2) { S.view = 'inbox'; renderChats(); return; }
  searchTimer = setTimeout(() => sendWS({ t: 'search', term }), 220);
});

$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  S.filter = b.dataset.filter;
  [...$('#filters').children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
  S.view = S.view === 'results' ? 'inbox' : S.view;
  renderChats();
});

$('#btn-archived').onclick = () => {
  S.view = S.view === 'archived' ? 'inbox' : 'archived';
  renderChats();
};

$('#btn-back').onclick = () => {
  document.body.classList.remove('in-thread');
  S.active = null;
  renderChats();
};

// ---------------- lightbox ----------------

function openLightbox(src, alt) {
  $('#lb-img').src = src;
  $('#lb-img').alt = alt || '';
  $('#lightbox').classList.add('on');
}
$('#lb-close').onclick = () => $('#lightbox').classList.remove('on');
$('#lightbox').onclick = (e) => { if (e.target.id === 'lightbox') $('#lightbox').classList.remove('on'); };

// ---------------- sheets ----------------

function openSheet(title, build, opts = {}) {
  document.querySelector('.sheet').classList.toggle('narrow', !!opts.narrow);
  $('#sheet-title').textContent = title;
  const body = $('#sheet-body');
  body.innerHTML = '';
  build(body);
  $('#overlay').classList.add('on');
}
$('#sheet-close').onclick = () => $('#overlay').classList.remove('on');
$('#overlay').onclick = (e) => { if (e.target.id === 'overlay') $('#overlay').classList.remove('on'); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#overlay').classList.remove('on');
    $('#lightbox').classList.remove('on');
  }
});

function card(host, label) {
  const c = el('div', 'card');
  if (label) c.appendChild(el('span', 'label', label));
  host.appendChild(c);
  return c;
}

$('#btn-settings').onclick = () => openSheet('Appearance', (host) => {
  const s = S.settings;

  const themeCard = card(host, 'Theme');
  const seg = el('div', 'seg');
  for (const t of ['auto', 'light', 'dark']) {
    const b = el('button', null, t[0].toUpperCase() + t.slice(1));
    b.setAttribute('aria-pressed', String(s.theme === t));
    b.onclick = () => { s.theme = t; applySettings(); [...seg.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); };
    seg.appendChild(b);
  }
  themeCard.appendChild(seg);

  const accentCard = card(host, 'Accent');
  const sw = el('div', 'swatches');
  for (const c of PALETTE) {
    const b = el('button', 'swatch');
    b.setAttribute('aria-label', c);
    b.style.background = 'linear-gradient(145deg,' + c + ',' + c + 'bb)';
    b.style.boxShadow = (s.accent === c ? '0 0 0 3px var(--ink), ' : '') + '0 6px 16px -6px ' + c + 'aa';
    b.onclick = () => { s.accent = c; applySettings(); [...sw.children].forEach((x, i) => { x.style.boxShadow = (PALETTE[i] === c ? '0 0 0 3px var(--ink), ' : '') + '0 6px 16px -6px ' + PALETTE[i] + 'aa'; }); };
    sw.appendChild(b);
  }
  accentCard.appendChild(sw);

  const wallCard = card(host, 'Wallpaper');
  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px';
  for (const name of Object.keys(WALLS)) {
    const b = el('button');
    b.setAttribute('aria-label', name);
    b.title = name;
    b.style.cssText = 'aspect-ratio:16/10;border:0;border-radius:10px;background:' + (document.documentElement.dataset.theme === 'light' ? WALLS[name].light : WALLS[name].dark) + ';box-shadow:' + (s.wall === name ? '0 0 0 2.5px var(--accent)' : '0 0 0 1px var(--sep)');
    b.onclick = () => {
      s.wall = name;
      applySettings();
      [...grid.children].forEach((x, i) => {
        const nm = Object.keys(WALLS)[i];
        x.style.background = document.documentElement.dataset.theme === 'light' ? WALLS[nm].light : WALLS[nm].dark;
        x.style.boxShadow = s.wall === nm ? '0 0 0 2.5px var(--accent)' : '0 0 0 1px var(--sep)';
      });
    };
    grid.appendChild(b);
  }
  wallCard.appendChild(grid);

  const sliders = card(host, 'Material');
  sliders.appendChild(slider('Glass depth', 4, 70, 2, s.glass, 'px', (v) => { s.glass = v; applySettings(); }));
  sliders.appendChild(slider('Corner radius', 0, 28, 1, s.radius, 'px', (v) => { s.radius = v; applySettings(); }));

  const dens = card(host, 'Density');
  const dseg = el('div', 'seg');
  for (const d of ['comfortable', 'compact']) {
    const b = el('button', null, d[0].toUpperCase() + d.slice(1));
    b.setAttribute('aria-pressed', String(s.density === d));
    b.onclick = () => { s.density = d; applySettings(); [...dseg.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); };
    dseg.appendChild(b);
  }
  dens.appendChild(dseg);

  const keys = card(host, 'Keyboard');
  for (const [k, v] of [['Send', 'Enter'], ['New line', 'Shift + Enter'], ['Close a panel', 'Esc'], ['Search', 'Click the field or press /']]) {
    const row = el('div', 'kv');
    const left = el('div');
    left.appendChild(el('div', 'k', k));
    row.appendChild(left);
    row.appendChild(el('div', 'v', v));
    keys.appendChild(row);
  }
});

function slider(label, min, max, step, value, unit, onInput) {
  const wrap = el('div');
  wrap.style.marginBottom = '18px';
  const head = el('div');
  head.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:10px';
  head.appendChild(el('span', 'k', label));
  const out = el('span', 'v', value + ' ' + unit);
  out.style.marginLeft = 'auto';
  head.appendChild(out);
  const input = el('input', 'slider');
  input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
  input.setAttribute('aria-label', label);
  input.oninput = () => { out.textContent = input.value + ' ' + unit; onInput(Number(input.value)); };
  wrap.append(head, input);
  return wrap;
}

$('#btn-info').onclick = () => {
  const c = S.chats.find((x) => x.id === S.active);
  if (!c) return;
  openSheet('Details', (host) => {
    const top = el('div');
    top.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:22px';
    const av = el('div');
    avatar(av, c.name, c.id, 76, c.network);
    const nm = el('div', null, c.name);
    nm.style.cssText = 'font-size:18px;font-weight:600;letter-spacing:-.02em';
    const sub = el('div', null, c.isGroup ? 'Group conversation' : (c.id.split('@')[0].replace(/^/, '+')));
    sub.style.cssText = 'font-size:12.5px;color:var(--ink-3)';
    top.append(av, nm, sub);
    host.appendChild(top);

    const facts = card(host, 'Conversation');
    const net = NETWORKS[c.network] || NETWORKS.whatsapp;
    const rows = [
      ['Network', net.label],
      ['Type', c.isGroup ? 'Group' : 'Direct'],
      ['Notifications', c.muted ? 'Muted' : 'On'],
      ['Messages on this device', String((S.messages.get(c.id) || []).length)],
      ['Encryption', 'End to end, by the network'],
    ];
    for (const [k, v] of rows) {
      const row = el('div', 'kv');
      const left = el('div'); left.appendChild(el('div', 'k', k));
      row.append(left, el('div', 'v', v));
      facts.appendChild(row);
    }

    const warn = el('div', 'note');
    warn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v5M12 17.5h.01"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><span>This device holds only the history WhatsApp syncs to a companion, which is a recent window rather than the full archive. Older messages are on your phone, not here.</span>';
    host.appendChild(warn);
  });
};

function openAbout() {
  openSheet('About this build', (host) => {
    const what = card(host, 'What works right now');
    for (const [k, v] of [
      ['WhatsApp', 'Live. Linked as a companion device over the multi-device protocol.'],
      ['Receiving', 'Text, photos, video, voice notes, documents, stickers, replies, read receipts, typing.'],
      ['Sending', 'Text and voice notes. File attachments are not wired yet.'],
      ['Telegram, Discord, Slack, Signal', 'Shown in the rail, adapters not built. The interface is already network agnostic.'],
    ]) {
      const row = el('div', 'kv');
      const left = el('div');
      left.appendChild(el('div', 'k', k));
      left.appendChild(el('div', 'h', v));
      row.appendChild(left);
      what.appendChild(row);
    }

    const limits = card(host, 'Companion device limits');
    for (const [k, v] of [
      ['History', 'A companion receives a recent window only, never the whole archive.'],
      ['Device slots', 'WhatsApp allows four linked devices at once.'],
      ['14 day leash', 'If your phone stays offline for 14 days every companion is unlinked.'],
      ['Phone', 'Does not need to be online the rest of the time.'],
    ]) {
      const row = el('div', 'kv');
      const left = el('div');
      left.appendChild(el('div', 'k', k));
      left.appendChild(el('div', 'h', v));
      row.appendChild(left);
      limits.appendChild(row);
    }

    const risk = el('div', 'note');
    risk.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v5M12 17.5h.01"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><span><strong>Account risk, plainly.</strong> This is an unofficial client. WhatsApp treats that as a terms violation and has restricted accounts for it, most often where the client behaves like a bot. This app sends normal presence and receipts and never bulk sends, which keeps it in ordinary client territory, but the risk is not zero. Use a secondary number if losing the account would hurt.</span>';
    host.appendChild(risk);

    const acct = card(host, 'This device');
    const r1 = el('div', 'kv');
    const l1 = el('div'); l1.appendChild(el('div', 'k', 'Linked account'));
    r1.append(l1, el('div', 'v', S.me ? (S.me.name || S.me.id?.split('@')[0] || 'linked') : 'not linked'));
    acct.appendChild(r1);
    const r2 = el('div', 'kv');
    const l2 = el('div'); l2.appendChild(el('div', 'k', 'Connection'));
    r2.append(l2, el('div', 'v', S.status));
    acct.appendChild(r2);

    const out = el('button', 'btn danger', 'Unlink this device');
    out.style.marginTop = '14px';
    out.onclick = () => {
      out.textContent = 'Unlinking';
      sendWS({ t: 'logout' });
      setTimeout(() => location.reload(), 1200);
    };
    acct.appendChild(out);
  });
}
$('#btn-about').onclick = openAbout;
$('#btn-vault').onclick = () => (document.body.classList.contains('in-vault') ? showView(null) : (showView('vault'), openVault()));
$('#btn-accounts').onclick = () => (document.body.classList.contains('in-accounts') ? showView(null) : showAccounts());

// ---------------- linking ----------------

let linkMode = 'qr';
$('#link-modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  linkMode = b.dataset.mode;
  [...$('#link-modes').children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
  $('#link-qr').style.display = linkMode === 'qr' ? 'flex' : 'none';
  $('#link-code').style.display = linkMode === 'code' ? 'flex' : 'none';
  renderLinkSteps();
});

function renderLinkSteps() {
  const host = $('#link-steps');
  if (!host) return;
  host.innerHTML = '';
  const steps = [
    ['1', 'Open WhatsApp on your phone', 'The device your account is registered to.'],
    ['2', 'Go to Linked devices', 'Settings, then Linked devices, then Link a device.'],
    linkMode === 'qr'
      ? ['3', 'Scan the code on this screen', 'Hold your phone up to the square on the right.']
      : ['3', 'Choose Link with phone number instead', 'Enter the eight characters shown on the right.'],
  ];
  steps.forEach(([n, t, bdy], i) => {
    const d = el('div', 'step' + (i === 2 ? ' on' : ''));
    d.appendChild(el('span', 'n', n));
    const w = el('div');
    w.appendChild(el('div', 't', t));
    w.appendChild(el('div', 'b', bdy));
    d.appendChild(w);
    host.appendChild(d);
  });
}

function showQR(dataUrl) {
  $('#qr-img').src = dataUrl;
  $('#qr-wait').textContent = 'Waiting for your phone. This code refreshes about every 20 seconds.';
}

function showCode(code) {
  const host = $('#code-boxes');
  host.innerHTML = '';
  String(code).replace(/-/g, '').split('').forEach((ch, i) => {
    const s = el('span', i === 4 ? 'gap' : null, ch);
    host.appendChild(s);
  });
  $('#code-wait').textContent = 'Waiting for your phone to approve this code';
}

$('#btn-newcode').onclick = () => {
  $('#qr-img').removeAttribute('src');
  $('#qr-wait').textContent = 'Asking for a fresh code';
  sendWS({ t: 'connect' });
};

const waPhone = phoneField(() => $('#btn-pair').click());
$('#wa-phone-slot').replaceWith(waPhone.el);
waPhone.el.style.flex = '1';

$('#btn-pair').onclick = () => {
  const phone = waPhone.value();
  if (phone.length < 8) { banner('Pick your country and enter the rest of the number', 'bad', 4000); return; }
  $('#code-wait').textContent = 'Requesting a code';
  sendWS({ t: 'pair', phone });
};

// ---------------- boot ----------------

applySettings();
syncComposer();
renderRail();
renderLinkSteps();
renderAccounts();
connect();

window.addEventListener('resize', () => {
  $('#btn-back').style.display = (window.innerWidth <= 900 && S.active) ? 'grid' : 'none';
});

// ==========================================================
// Interaction layer
// ==========================================================

const ICON = {
  reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 3.5 12 9 17"/><path d="M3.5 12H14a6.5 6.5 0 0 1 6.5 6.5v1"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M17.6 3.6a2 2 0 0 1 2.8 2.8L13 13.8l-3.5 1 1-3.5z"/></svg>',
  forward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7l5.5 5L15 17"/><path d="M20.5 12H10a6.5 6.5 0 0 0-6.5 6.5v1"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5"/><path d="M4 18v1.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 12.5h4"/></svg>',
  unread: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/></svg>',
};

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// ---- context menu ----------------------------------------

const menu = $('#menu');
let menuFor = null;

function closeMenu() { menu.classList.remove('on'); menuFor = null; }
document.addEventListener('click', (e) => { if (!menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); hideEmoji(); } });
$('#messages').addEventListener('scroll', closeMenu);

function item(label, icon, fn, cls) {
  const b = el('button', cls || null);
  b.innerHTML = icon + '<span></span>';
  b.lastChild.textContent = label;
  b.onclick = () => { closeMenu(); fn(); };
  return b;
}

function openMenu(x, y, m) {
  menuFor = m;
  menu.innerHTML = '';

  const quick = el('div', 'quick');
  for (const e of QUICK) {
    const b = el('button', null, e);
    b.setAttribute('aria-label', 'React ' + e);
    b.onclick = () => { closeMenu(); sendWS({ t: 'react', chatId: S.active, id: m.id, emoji: m.myReaction === e ? '' : e }); };
    quick.appendChild(b);
  }
  menu.appendChild(quick);

  menu.appendChild(item('Reply', ICON.reply, () => startReply(m)));
  if (m.text) menu.appendChild(item('Copy text', ICON.copy, () => {
    navigator.clipboard.writeText(m.text).then(() => banner('Copied', 'ok', 1200), () => banner('Clipboard refused', 'bad', 2500));
  }));
  if (m.hasMedia) menu.appendChild(item('Save file', ICON.save, () => {
    const a = document.createElement('a');
    a.href = '/media/' + encodeURIComponent(m.id) + '?dl=1';
    a.download = m.fileName || '';
    a.click();
  }));
  menu.appendChild(item('Forward', ICON.forward, () => startForward(m)));

  const editable = m.fromMe && m.kind === 'text' && (Date.now() - m.ts) < 15 * 60 * 1000;
  if (editable) menu.appendChild(item('Edit', ICON.edit, () => startEdit(m)));

  if (m.fromMe) {
    menu.appendChild(document.createElement('hr'));
    menu.appendChild(item('Delete for everyone', ICON.trash, () => {
      sendWS({ t: 'delete', chatId: S.active, id: m.id, forEveryone: true });
    }, 'danger'));
  }

  menu.classList.add('on');
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 12) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 12) + 'px';
}

// ---- chat row menu ---------------------------------------

function openChatMenu(x, y, c) {
  menu.innerHTML = '';
  menu.appendChild(item(c.pinned ? 'Unpin' : 'Pin', ICON.pin, () => sendWS({ t: 'modify', chatId: c.id, what: { pin: !c.pinned } })));
  menu.appendChild(item(c.muted ? 'Unmute' : 'Mute for 8 hours', ICON.mute, () => sendWS({ t: 'modify', chatId: c.id, what: { mute: !c.muted } })));
  menu.appendChild(item(c.archived ? 'Move out of archive' : 'Archive', ICON.archive, () => sendWS({ t: 'modify', chatId: c.id, what: { archive: !c.archived } })));
  menu.appendChild(item(c.unread ? 'Mark as read' : 'Mark as unread', ICON.unread, () => sendWS({ t: 'modify', chatId: c.id, what: { unread: !c.unread } })));
  menu.classList.add('on');
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 12) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 12) + 'px';
}

// ---- reply, edit, forward --------------------------------

let replyTo = null;
let editing = null;

function startReply(m) {
  replyTo = m;
  editing = null;
  $('#reply-who').textContent = m.fromMe ? 'You' : (m.author || 'Reply');
  $('#reply-txt').textContent = m.text || (m.kind === 'audio' ? 'Voice note' : 'Attachment');
  $('#reply-bar').classList.add('on');
  draft.focus();
}
function startEdit(m) {
  editing = m;
  replyTo = null;
  draft.value = m.text;
  syncComposer();
  $('#reply-who').textContent = 'Editing';
  $('#reply-txt').textContent = m.text;
  $('#reply-bar').classList.add('on');
  draft.focus();
}
function cancelCompose() {
  replyTo = null;
  editing = null;
  $('#reply-bar').classList.remove('on');
}
$('#reply-cancel').onclick = cancelCompose;

function startForward(m) {
  openSheet('Forward to', (host) => {
    const note = el('p', null, 'Pick a conversation. The message is sent as a forward, which is what the other side will see.');
    note.style.cssText = 'margin:0 0 16px;color:var(--ink-2);font-size:13px';
    host.appendChild(note);
    for (const c of S.chats.filter((x) => !x.archived).slice(0, 40)) {
      const b = el('button', 'row');
      b.style.cssText = 'padding:9px 10px';
      const av = el('div');
      avatar(av, c.name, c.id, 36, c.network);
      const cell = el('div', 'cell');
      cell.style.borderBottom = 'none';
      cell.appendChild(el('div', 'name', c.name));
      b.append(av, cell);
      b.onclick = () => {
        $('#overlay').classList.remove('on');
        sendWS({ t: 'forward', toChatId: c.id, id: m.id });
        banner('Forwarded to ' + c.name, 'ok', 2200);
      };
      host.appendChild(b);
    }
  });
}

// ---- sending, now reply and edit aware -------------------

function doSend() {
  const text = draft.value.trim();
  if (!text || !S.active) return;
  if (editing) {
    sendWS({ t: 'edit', chatId: S.active, id: editing.id, text });
  } else {
    sendWS({ t: 'send', chatId: S.active, text, replyTo: replyTo ? replyTo.id : null });
  }
  draft.value = '';
  delete drafts[S.active];
  cancelCompose();
  syncComposer();
}
$('#btn-send').onclick = doSend;

// ---- per chat drafts -------------------------------------

const drafts = load('drafts', {});
function saveDrafts() { save('drafts', drafts); }

// ---- attachments: drop, paste, picker --------------------

const dropZone = $('#drop');
let dragDepth = 0;

function hasFiles(e) {
  return [...(e.dataTransfer?.types || [])].includes('Files');
}
window.addEventListener('dragenter', (e) => {
  if (!S.active || !hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dropZone.classList.add('on');
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropZone.classList.remove('on');
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove('on');
  if (!S.active) { banner('Open a conversation first', 'bad', 3000); return; }
  upload([...e.dataTransfer.files]);
});

document.addEventListener('paste', (e) => {
  if (!S.active) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); upload(files); }
});

$('#btn-attach').onclick = () => $('#file-input').click();
$('#file-input').onchange = (e) => {
  upload([...e.target.files]);
  e.target.value = '';
};

async function upload(files) {
  if (!files.length) return;
  for (const f of files) {
    if (f.size > 64 * 1024 * 1024) { banner(f.name + ' is over 64MB, WhatsApp will not take it', 'bad', 5000); continue; }
    banner('Sending ' + f.name, '', 0);
    try {
      const qs = new URLSearchParams({ chatId: S.active });
      if (replyTo) qs.set('replyTo', replyTo.id);
      const res = await fetch('/upload?' + qs.toString(), {
        method: 'POST',
        headers: { 'x-file-name': encodeURIComponent(f.name), 'x-file-type': f.type || '' },
        body: f,
      });
      if (!res.ok) throw new Error(await res.text());
      banner('Sent ' + f.name, 'ok', 1800);
      cancelCompose();
    } catch (err) {
      banner('Could not send ' + f.name + ': ' + err.message, 'bad', 6000);
    }
  }
}

// ---- emoji picker ----------------------------------------

const EMOJI = {
  'Smileys': '😀 😃 😄 😁 😅 😂 🙂 🙃 😉 😊 😍 😘 😗 😚 😋 😜 🤪 🤨 🧐 🤓 😎 🥳 😏 😒 😔 😟 🙁 😣 😖 😫 😤 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😢 😭 😓 🤗 🤔 🤫 🤭 😐 😑 😶 🙄 😬 🤥 😴 🤤 😪 🤢 🤮 🤧 🥴 😵 🤠',
  'Gestures': '👍 👎 👌 ✌️ 🤞 🤟 🤘 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🙏 🤝 👏 🙌 👐 ✍️ 💅',
  'Hearts': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝',
  'Objects': '🔥 ⭐ 🌟 ✨ ⚡ 💧 🎉 🎊 🎁 📦 📱 💻 ⌨️ 🖥️ 🔌 💡 🔑 🔒 📌 📎 ✅ ❌ ❗ ❓ 💯 ⏰ 📅 📍',
};

const emojiBox = $('#emoji');
function buildEmoji() {
  emojiBox.innerHTML = '';
  for (const [cat, list] of Object.entries(EMOJI)) {
    emojiBox.appendChild(el('div', 'cat', cat));
    const g = el('div', 'grid');
    for (const e of list.split(' ')) {
      const b = el('button', null, e);
      b.onclick = () => {
        const at = draft.selectionStart ?? draft.value.length;
        draft.value = draft.value.slice(0, at) + e + draft.value.slice(at);
        draft.focus();
        draft.selectionStart = draft.selectionEnd = at + e.length;
        syncComposer();
      };
      g.appendChild(b);
    }
    emojiBox.appendChild(g);
  }
}
function hideEmoji() { emojiBox.classList.remove('on'); }
$('#btn-emoji').onclick = (e) => {
  e.stopPropagation();
  if (!emojiBox.childElementCount) buildEmoji();
  emojiBox.classList.toggle('on');
};
document.addEventListener('click', (e) => {
  if (!emojiBox.contains(e.target) && e.target.id !== 'btn-emoji') hideEmoji();
});

// ---- jump to latest --------------------------------------

const toBottom = $('#to-bottom');
const messagesEl = $('#messages');
messagesEl.addEventListener('scroll', () => {
  const far = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight > 320;
  toBottom.classList.toggle('on', far);
});
toBottom.onclick = () => { messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' }); };

// ---- keyboard --------------------------------------------

document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q').focus(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#q').focus(); return; }
  if (e.key === 'Escape' && (replyTo || editing)) { cancelCompose(); return; }
  if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); return; }
  // Up arrow in an empty composer edits your last message, as in Telegram.
  if (e.key === 'ArrowUp' && document.activeElement === draft && !draft.value && S.active) {
    const mine = (S.messages.get(S.active) || []).filter((m) => m.fromMe && m.kind === 'text');
    const last = mine[mine.length - 1];
    if (last && Date.now() - last.ts < 15 * 60 * 1000) { e.preventDefault(); startEdit(last); }
  }
});

// ==========================================================
// Media vault
// ==========================================================

const V = { items: [], stats: null, filter: 'all', q: '', loaded: false };

const VAULT_ICON = {
  document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5"/><path d="M19 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h9l6 6v11a1 1 0 0 1-1 1z"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5.5 11.2a6.5 6.5 0 0 0 13 0"/><path d="M12 17.8V21"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.6l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8z"/></svg>',
};

const FILTERS = [
  ['all', 'All'], ['image', 'Images'], ['video', 'Video'],
  ['document', 'Documents'], ['audio', 'Audio'], ['link', 'Links'], ['saved', 'Saved'],
];

function openVault() {
  showView('vault');
  if (!V.loaded) sendWS({ t: 'vault' });
  renderVault();
}
function closeVault() { showView(null); }
$('#vault-close').onclick = closeVault;
$('#vault-q').addEventListener('input', (e) => { V.q = e.target.value.trim().toLowerCase(); renderVault(); });

function vaultVisible() {
  let list = V.items;
  if (V.filter === 'saved') list = list.filter((i) => i.saved);
  else if (V.filter !== 'all') list = list.filter((i) => i.kind === V.filter);
  if (V.q) {
    list = list.filter((i) =>
      (i.name || '').toLowerCase().includes(V.q) ||
      (i.caption || '').toLowerCase().includes(V.q) ||
      (i.from || '').toLowerCase().includes(V.q) ||
      (i.chatName || '').toLowerCase().includes(V.q) ||
      (i.tags || []).some((t) => t.includes(V.q)));
  }
  return list;
}

function renderVault() {
  const chips = $('#vault-filters');
  chips.innerHTML = '';
  for (const [k, label] of FILTERS) {
    const b = el('button', 'chip');
    b.setAttribute('aria-pressed', String(V.filter === k));
    b.appendChild(document.createTextNode(label));
    const n = V.stats
      ? (k === 'all' ? V.stats.total : k === 'saved' ? V.stats.saved : (V.stats.by[k] || 0))
      : null;
    if (n != null) b.appendChild(el('span', 'n', String(n)));
    b.onclick = () => { V.filter = k; renderVault(); };
    chips.appendChild(b);
  }

  const host = $('#vault-body');
  host.innerHTML = '';

  if (V.stats) {
    $('#vault-sub').textContent = V.stats.total
      ? V.stats.total + ' items indexed across your conversations, nothing copied unless you save it'
      : 'Nothing indexed yet';
  }

  if (V.stats && V.stats.saved) {
    const row = el('div', 'storage');
    row.innerHTML = VAULT_ICON.star;
    row.firstChild.style.width = '16px';
    row.append(
      el('span', null, V.stats.saved + ' files saved to this device, ' + bytes(V.stats.bytes)),
    );
    const sp = el('span'); sp.style.flex = '1'; row.appendChild(sp);
    const clear = el('button', 'btn danger', 'Remove all saved copies');
    clear.onclick = () => { sendWS({ t: 'vaultClear' }); setTimeout(() => sendWS({ t: 'vault' }), 400); };
    row.appendChild(clear);
    host.appendChild(row);
  }

  const list = vaultVisible();
  if (!list.length) {
    host.appendChild(emptyNote('Nothing here yet',
      V.items.length
        ? 'No items match that filter or search.'
        : 'Attachments and links appear here as conversations sync. A companion device only ever receives a recent window of history.'));
    return;
  }

  // Group by month, newest first.
  let lastGroup = '';
  let gridHost = null;
  let listHost = null;

  for (const i of list) {
    const g = new Date(i.ts).toLocaleDateString([], { month: 'long', year: 'numeric' });
    if (g !== lastGroup) {
      host.appendChild(el('div', 'vault-group', g));
      lastGroup = g;
      gridHost = null;
      listHost = null;
    }
    const visual = i.kind === 'image' || i.kind === 'video';
    if (visual) {
      if (!gridHost) { gridHost = el('div', 'vault-grid'); host.appendChild(gridHost); }
      gridHost.appendChild(vaultTile(i));
    } else {
      if (!listHost) { listHost = el('div', 'vault-list'); host.appendChild(listHost); }
      listHost.appendChild(vaultRow(i));
    }
  }
}

function vaultTile(i) {
  const t = el('div', 'tile');
  const src = (i.saved ? '/vault/' : '/media/') + encodeURIComponent(i.id);
  if (i.kind === 'image') {
    const img = el('img');
    img.src = src; img.alt = i.name; img.loading = 'lazy';
    img.onerror = () => { t.style.background = 'var(--well)'; img.remove(); };
    t.appendChild(img);
  } else {
    const v = document.createElement('video');
    v.src = src; v.preload = 'metadata'; v.muted = true;
    t.appendChild(v);
    const play = el('div', 'play');
    play.innerHTML = '<span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>';
    t.appendChild(play);
  }
  const meta = el('div', 'meta');
  meta.textContent = i.from + ' · ' + listTime(i.ts);
  t.appendChild(meta);
  t.appendChild(starBtn(i));
  t.onclick = () => { if (i.kind === 'image') openLightbox(src, i.name); else window.open(src, '_blank'); };
  return t;
}

function vaultRow(i) {
  const r = el('button', 'vault-row');
  const ico = el('div', 'ico');
  ico.innerHTML = VAULT_ICON[i.kind] || VAULT_ICON.document;
  const cell = el('div', 'cell');
  const nm = el('div', 'nm');
  nm.textContent = i.name;
  for (const tag of i.tags || []) nm.appendChild(el('span', 'tag alt', tag));
  if (i.saved) nm.appendChild(el('span', 'tag', 'saved'));
  cell.appendChild(nm);
  cell.appendChild(el('div', 'sub', i.from + ' in ' + i.chatName + (i.caption ? ' · ' + i.caption : '')));
  r.append(ico, cell, el('span', 'when', listTime(i.ts)));
  if (i.kind !== 'link') r.appendChild(starBtn(i, true));
  r.onclick = (e) => {
    if (e.target.closest('.star')) return;
    if (i.kind === 'link') window.open(i.url, '_blank', 'noopener');
    else if (i.kind === 'audio') window.open((i.saved ? '/vault/' : '/media/') + encodeURIComponent(i.id), '_blank');
    else {
      const a = document.createElement('a');
      a.href = (i.saved ? '/vault/' : '/media/') + encodeURIComponent(i.id) + '?dl=1';
      a.download = i.name; a.click();
    }
  };
  return r;
}

function starBtn(i, plain) {
  const b = el('button', 'star' + (i.saved ? ' on' : ''));
  if (plain) b.style.cssText = 'position:static;opacity:1;background:transparent;color:' + (i.saved ? 'var(--accent)' : 'var(--ink-3)');
  b.setAttribute('aria-label', i.saved ? 'Remove the saved copy' : 'Save a copy to this device');
  b.title = b.getAttribute('aria-label');
  b.innerHTML = VAULT_ICON.star;
  b.onclick = (e) => {
    e.stopPropagation();
    sendWS({ t: i.saved ? 'vaultRemove' : 'vaultSave', id: i.id });
    banner(i.saved ? 'Removing the saved copy' : 'Saving a copy to this device', '', 1600);
  };
  return b;
}

function bytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(1) : n) + ' ' + u[i];
}

// ==========================================================
// Telegram: connect flow
// ==========================================================

function tgLive() { return S.tg.status === 'online'; }

function openTelegram() {
  const st = S.tg;

  if (!st.configured) {
    openSheet('Connect Telegram', (host) => {
      const p = el('p', null, 'Telegram needs an api_id and api_hash, issued per application. Create one at my.telegram.org under API development tools, then save the pair into data/telegram.json and restart Parley.');
      p.style.cssText = 'margin:0 0 16px;color:var(--ink-2);line-height:1.6';
      host.appendChild(p);
      const pre = el('pre', null, '{\n  "apiId": 0,\n  "apiHash": ""\n}');
      pre.style.cssText = 'margin:0;padding:14px;border-radius:12px;background:var(--well);border:1px solid var(--sep);font-family:var(--mono);font-size:12.5px;overflow:auto';
      host.appendChild(pre);
      const note = el('div', 'note');
      note.style.marginTop = '16px';
      note.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v5M12 17.5h.01"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><span>Keep the api_hash private. It lives in data/, which is excluded from git, and must never be committed to a public repository.</span>';
      host.appendChild(note);
    });
    return;
  }

  if (tgLive()) {
    openSheet('Telegram', (host) => {
      const top = el('div', 'profile-top');
      const av = el('div');
      avatar(av, st.me?.name || 'Telegram', st.me?.id || 'tg', 72, 'telegram');
      top.append(av, el('div', 'nm', st.me?.name || 'Connected'), el('div', 'sub', 'Telegram, connected through TDLib'));
      host.appendChild(top);

      const card = card_(host, 'This connection');
      kv(card, 'Status', 'Online');
      kv(card, 'Library', "TDLib, Telegram's own");
      kv(card, 'Ban risk', 'None, third party clients are supported');

      const out = el('button', 'btn danger', 'Disconnect Telegram');
      out.style.marginTop = '14px';
      out.onclick = () => { sendWS({ t: 'tgLogout' }); $('#overlay').classList.remove('on'); banner('Disconnecting Telegram', '', 2500); };
      card.appendChild(out);
    });
    return;
  }

  openSheet('Connect Telegram', (host) => {
    const step = st.status;
    const net = NETWORKS.telegram;

    const head = el('div', 'connect-head');
    const mark = el('span', 'mark');
    mark.style.background = net.colour;
    mark.style.color = '#fff';
    mark.style.display = 'grid';
    mark.style.placeItems = 'center';
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="' + net.path + '"/></svg>';
    const ht = el('div');
    ht.appendChild(el('div', 't', 'Telegram'));
    ht.appendChild(el('div', 's', 'Signs in on this device, like any other Telegram client'));
    head.append(mark, ht);
    host.appendChild(head);

    const safe = el('div', 'safe');
    safe.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.3-3 8.3-7.5 9.5-4.5-1.2-7.5-5.2-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/></svg>';
    safe.append(document.createTextNode('Officially supported. No account risk.'));
    host.appendChild(safe);

    const order = ['needPhone', 'needCode', 'needPassword'];
    const at = Math.max(0, order.indexOf(step));
    const steps = el('div', 'steps');
    ['Phone', 'Code', 'Password'].forEach((label, i) => {
      if (i) steps.appendChild(el('span', 'bar'));
      const sEl = el('span', 's' + (i === at ? ' on' : i < at ? ' done' : ''));
      sEl.appendChild(el('span', 'n', i < at ? '✓' : String(i + 1)));
      sEl.appendChild(document.createTextNode(label));
      steps.appendChild(sEl);
    });
    host.appendChild(steps);

    const CFG = {
      needCode: {
        label: 'Login code',
        placeholder: '1 2 3 4 5',
        help: 'Telegram sent a code to your other signed in devices, not by SMS. Check the Telegram app on your phone.',
        cta: 'Verify',
        send: (v) => sendWS({ t: 'tgCode', code: v }),
        attrs: (i) => { i.inputMode = 'numeric'; i.autocomplete = 'one-time-code'; },
      },
      needPassword: {
        label: 'Two step password',
        placeholder: 'Your password',
        help: st.hint && st.hint.includes('Hint') ? st.hint : 'This is the password you set for two step verification, not your login code.',
        cta: 'Unlock',
        send: (v) => sendWS({ t: 'tgPassword', password: v }),
        attrs: (i) => { i.type = 'password'; i.autocomplete = 'current-password'; },
      },
      default: {
        label: 'Phone number',
        placeholder: '24 123 4567',
        help: 'Pick your country, then the rest of the number. Use the number your Telegram account is registered to.',
        cta: 'Send me a code',
        send: (v) => sendWS({ t: 'tgPhone', phone: v }),
        attrs: (i) => { i.inputMode = 'tel'; i.autocomplete = 'tel'; },
      },
    };
    const cfg = CFG[step] || CFG.default;

    const isPhone = !(step === 'needCode' || step === 'needPassword');
    const field = el('div', 'field-lg');
    const lab = el('label');
    lab.textContent = cfg.label;
    field.appendChild(lab);

    let read;
    let focusIt;
    if (isPhone) {
      const pf = phoneField(() => submit());
      field.appendChild(pf.el);
      read = pf.value;
      focusIt = pf.focus;
    } else {
      const input = el('input');
      input.id = 'tg-input';
      input.placeholder = cfg.placeholder;
      cfg.attrs(input);
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
      field.appendChild(input);
      read = () => input.value.trim();
      focusIt = () => input.focus();
    }
    field.appendChild(el('div', 'help', cfg.help));
    host.appendChild(field);

    const go = el('button', 'btn primary btn-lg', cfg.cta);
    function submit() {
      const v = read();
      if (!v) { focusIt(); return; }
      go.disabled = true;
      go.textContent = 'Working';
      cfg.send(v);
    }
    go.onclick = submit;
    host.appendChild(go);

    if (step !== 'needPhone' && step !== 'offline') {
      const row = el('div', 'link-row');
      const again = el('button', null, 'Start over with a different number');
      again.onclick = () => { sendWS({ t: 'tgLogout' }); setTimeout(() => sendWS({ t: 'tgStart' }), 600); };
      row.appendChild(again);
      host.appendChild(row);
    }

    // The connection starts itself. Making the user press a second button to
    // "start" before the one that actually does something was the confusing
    // part of the old screen.
    if (step === 'offline') sendWS({ t: 'tgStart' });

    setTimeout(focusIt, 140);
  }, { narrow: true });
}

function card_(host, label) {
  const c = el('div', 'card');
  if (label) c.appendChild(el('span', 'label', label));
  host.appendChild(c);
  return c;
}
function kv(host, k, v) {
  const row = el('div', 'kv');
  const left = el('div');
  left.appendChild(el('div', 'k', k));
  row.append(left, el('div', 'v', v));
  host.appendChild(row);
  return row;
}

// ==========================================================
// Country picker
// ==========================================================


// Returns { el, value() } where value() is the full E.164 number.
function phoneField(onSubmit) {
  const saved = (() => { try { return localStorage.getItem('cc'); } catch { return null; } })();
  let iso = saved || guessCountry() || 'GH';
  let row = COUNTRIES.find((c) => c[0] === iso) || COUNTRIES.find((c) => c[0] === 'GH');

  const wrap = el('div', 'phone-field');
  const cc = el('div', 'cc');
  const btn = el('button', 'cc-btn');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-label', 'Country calling code');

  const paint = () => {
    btn.innerHTML = '';
    btn.append(el('span', 'fl', flagOf(row[0])), el('span', null, '+' + row[2]));
    const ch = el('span', 'ch');
    ch.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    btn.appendChild(ch);
  };
  paint();

  const pop = el('div', 'cc-pop');
  const sWrap = el('div', 'cc-search');
  const search = el('input');
  search.placeholder = 'Search 239 countries';
  search.setAttribute('aria-label', 'Search countries');
  sWrap.appendChild(search);
  const list = el('div', 'cc-list');
  pop.append(sWrap, list);

  let cursor = 0;
  let shown = COUNTRIES;

  function fill(q = '') {
    const term = q.trim().toLowerCase();
    shown = !term ? COUNTRIES : COUNTRIES.filter(([code, name, dial]) =>
      name.toLowerCase().includes(term) ||
      code.toLowerCase() === term ||
      dial.startsWith(term.replace(/^\+/, '')));
    cursor = 0;
    list.innerHTML = '';
    if (!shown.length) {
      list.appendChild(el('div', 'cc-empty', 'No country matches that'));
      return;
    }
    shown.slice(0, 260).forEach((c, i) => {
      const b = el('button');
      b.type = 'button';
      b.append(el('span', 'fl', flagOf(c[0])), el('span', 'nm', c[1]), el('span', 'dl', '+' + c[2]));
      if (i === 0) b.classList.add('active');
      b.onclick = () => choose(c);
      list.appendChild(b);
    });
  }

  function choose(c) {
    row = c;
    try { localStorage.setItem('cc', c[0]); } catch { /* private mode */ }
    paint();
    close();
    num.focus();
  }

  function open() {
    pop.classList.add('on');
    search.value = '';
    fill('');
    setTimeout(() => search.focus(), 40);
  }
  function close() { pop.classList.remove('on'); }

  btn.onclick = (e) => { e.stopPropagation(); pop.classList.contains('on') ? close() : open(); };
  document.addEventListener('click', (e) => { if (!cc.contains(e.target)) close(); });

  search.oninput = () => fill(search.value);
  search.onkeydown = (e) => {
    const items = [...list.querySelectorAll('button')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      items[cursor]?.classList.remove('active');
      cursor = (cursor + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[cursor].classList.add('active');
      items[cursor].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[cursor]) choose(shown[cursor]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      btn.focus();
    }
  };

  cc.append(btn, pop);

  const num = el('input');
  num.inputMode = 'tel';
  num.autocomplete = 'tel-national';
  num.placeholder = '24 123 4567';
  num.setAttribute('aria-label', 'Phone number without the country code');
  num.onkeydown = (e) => { if (e.key === 'Enter' && onSubmit) onSubmit(); };

  wrap.append(cc, num);

  return {
    el: wrap,
    focus: () => num.focus(),
    // Digits only, country code first. That is what both networks want.
    value: () => {
      const local = num.value.replace(/[^0-9]/g, '').replace(/^0+/, '');
      return local ? row[2] + local : '';
    },
  };
}
