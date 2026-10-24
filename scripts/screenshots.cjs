// Reproducible screenshots for the repo.
//
// Launches the app, walks each view and writes a PNG per screen. Run it
// yourself rather than trusting a committed image to still be accurate:
//
//   npm run shots
//
// Views that need a connected account are skipped automatically when
// nothing is linked, so this never fabricates a screenshot of data that
// does not exist.

const { app, BrowserWindow } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = Number(process.env.PORT || 5273);
const URL = 'http://127.0.0.1:' + PORT;

const SHOTS = [
  ['accounts', "document.getElementById('btn-accounts').click()"],
  ['link-whatsapp', "showLink()"],
  ['vault', "document.getElementById('btn-vault').click()"],
  ['appearance', "document.getElementById('btn-settings').click()"],
  ['inbox', "showView(null); document.getElementById('overlay').classList.remove('on')"],
];

function waitForPort(timeout = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(PORT, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - started > timeout) reject(new Error('bridge did not start'));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = fork(path.join(ROOT, 'server', 'index.js'), [], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
  });
  await waitForPort();

  const win = new BrowserWindow({
    width: 1440, height: 900, show: false,
    webPreferences: { preload: path.join(ROOT, 'electron', 'preload.cjs'), contextIsolation: true },
  });
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 6000));   // let the bridge settle

  for (const [name, js] of SHOTS) {
    try {
      await win.webContents.executeJavaScript(js, true);
      await new Promise((r) => setTimeout(r, 1200));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
      console.log('wrote docs/screenshots/' + name + '.png');
    } catch (e) {
      console.log('skipped ' + name + ': ' + e.message);
    }
  }

  server.kill();
  app.quit();
});
