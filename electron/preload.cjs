// Minimal, deliberately narrow bridge. The renderer gets exactly one call.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('parley', {
  isDesktop: true,
  setUnread: (n) => ipcRenderer.send('parley:unread', n),
});
