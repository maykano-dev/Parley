// Parley, desktop shell.
//
// The bridge runs as a child process so a crash in a network adapter can never
// take the window down with it; the window just reconnects. Everything the
// renderer loads is served from loopback by that child.

const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 5173);
const URL = 'http://127.0.0.1:' + PORT;

let win = null;
let tray = null;
let server = null;
let quitting = false;

// ---- bridge -----------------------------------------------------

function startServer() {
  server = fork(path.join(ROOT, 'server', 'index.js'), [], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  server.stdout.on('data', (d) => process.stdout.write(d));
  server.stderr.on('data', (d) => process.stderr.write(d));
  server.on('exit', (code) => {
    if (quitting) return;
    console.error('[parley] bridge exited', code, 'restarting in 2s');
    setTimeout(startServer, 2000);
  });
}

function waitForPort(timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(PORT, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error('bridge did not come up'));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

// ---- window -----------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 420,
    minHeight: 540,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#08080a',
    title: 'Parley',
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadURL(URL);
  win.once('ready-to-show', () => win.show());

  // Links to the wider web open in the real browser, never in the app frame.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(URL)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(URL)) { e.preventDefault(); shell.openExternal(url); }
  });

  // Closing hides to the tray; quitting is explicit.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(ROOT, 'build', 'tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Parley');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Parley', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => (win.isVisible() ? win.hide() : (win.show(), win.focus())));
}

// ---- unread count from the renderer ------------------------------

ipcMain.on('parley:unread', (_e, count) => {
  const n = Number(count) || 0;
  if (process.platform === 'linux' || process.platform === 'darwin') {
    try { app.setBadgeCount(n); } catch { /* not every desktop supports it */ }
  }
  if (tray) tray.setToolTip(n ? 'Parley, ' + n + ' unread' : 'Parley');
  if (win) win.setTitle(n ? 'Parley (' + n + ')' : 'Parley');
});

// ---- lifecycle ---------------------------------------------------

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(async () => {
    startServer();
    try {
      await waitForPort();
    } catch (e) {
      console.error('[parley]', e.message);
    }
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else if (win) win.show();
    });
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { /* stay alive in the tray */ });
  app.on('quit', () => { try { server?.kill(); } catch { /* already gone */ } });
}
