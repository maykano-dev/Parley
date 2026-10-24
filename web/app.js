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
  discord:  { label: 'Discord',  colour: '#5865F2', live: false, path: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.0766.0766 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z' },
  slack:    { label: 'Slack',    colour: '#E01E5A', live: false, path: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z' },
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
  $('#link-screen').classList.toggle('on', linking);
  $('#window').style.display = linking ? 'none' : 'flex';

  if (linking) { renderLinkSteps(); return; }
  if (S.status === 'online') banner('Connected to WhatsApp', 'ok', 1800);
  else if (S.status === 'connecting') banner('Reconnecting', '', 0);
  else banner('Offline', 'bad', 0);
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
      if (!net.live) { openAbout(); return; }
      S.view = 'inbox'; renderChats();
    };
    host.appendChild(b);
  }
}

// ---------------- chat list ----------------

function visibleChats() {
  let list = S.chats.filter((c) => (S.view === 'archived' ? c.archived : !c.archived));
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

function openSheet(title, build) {
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

$('#btn-pair').onclick = () => {
  const phone = $('#phone').value.replace(/[^0-9]/g, '');
  if (phone.length < 8) { banner('Enter the full number with country code, digits only', 'bad', 4000); return; }
  $('#code-wait').textContent = 'Requesting a code';
  sendWS({ t: 'pair', phone });
};

// ---------------- boot ----------------

applySettings();
syncComposer();
renderRail();
renderLinkSteps();
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
