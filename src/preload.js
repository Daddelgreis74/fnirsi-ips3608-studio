const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipsApi', {
  setAutoSelect: (enabled) => ipcRenderer.invoke('serial:set-auto-select', enabled),
  scanPorts: () => ipcRenderer.invoke('serial:scan-ports'),
  connect: (portName) => ipcRenderer.invoke('serial:connect', portName),
  disconnect: () => ipcRenderer.invoke('serial:disconnect'),
  send: (bytes) => ipcRenderer.send('serial:send', bytes),
  onSerialRx: (cb) => ipcRenderer.on('serial:rx', (_event, bytes) => cb(bytes)),
  onSerialStatus: (cb) => ipcRenderer.on('serial:status', (_event, status) => cb(status)),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterAvailable: (cb) => ipcRenderer.on('updater:available', (_event, info) => cb(info)),
  onUpdaterProgress: (cb) => ipcRenderer.on('updater:progress', (_event, pct) => cb(pct))
});
