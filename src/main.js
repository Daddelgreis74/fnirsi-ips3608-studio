const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const SerialManager = require('./serial_manager');
const updater = require('./updater');
const pkg = require('../package.json');

let mainWindow;
let lastUpdateInfo = null;
let autoSelectSerial = true;
const serialManager = new SerialManager();
const KNOWN_WEB_SERIAL_VIDS = new Set([0x2e3c, 0x1a86, 0x10c4, 0x0403, 0x0483, 0x067b]);

function parseUsbId(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return NaN;
  if (s.startsWith('0x') || /[a-f]/.test(s)) return Number.parseInt(s, 16);
  // Electron may provide decimal or 4-digit hex like "2e3c" / "5740"
  const hex = Number.parseInt(s, 16);
  const dec = Number.parseInt(s, 10);
  if (hex === 0x2e3c || hex === 0x5740) return hex;
  return Number.isFinite(dec) ? dec : hex;
}

function scoreSerialPort(port) {
  const vid = parseUsbId(port && port.vendorId);
  const pid = parseUsbId(port && port.productId);
  if (vid === 0x2e3c && (!Number.isFinite(pid) || pid === 0x5740)) return 3;
  if (vid === 0x2e3c) return 2;
  if (KNOWN_WEB_SERIAL_VIDS.has(vid)) return 1;
  return 0;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 1000,
    minHeight: 680,
    title: 'FNIRSI IPS3608 Studio',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0a0e17',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    },
    autoHideMenuBar: true
  });

  mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const info = await updater.checkForUpdates(pkg.version);
        lastUpdateInfo = info;
        if (info.available && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:available', info);
        }
      } catch (e) {}
    }, 3000);
  });

  mainWindow.on('closed', () => {
    serialManager.disconnect();
    mainWindow = null;
  });
}

ipcMain.handle('updater:check', async () => {
  try {
    const info = await updater.checkForUpdates(pkg.version);
    lastUpdateInfo = info;
    return info;
  } catch (err) {
    return { available: false, error: err.message, currentVersion: pkg.version };
  }
});

ipcMain.handle('updater:install', async () => {
  if (!lastUpdateInfo || !lastUpdateInfo.available || !lastUpdateInfo.asset) {
    throw new Error('No verified update available');
  }
  return await updater.downloadAndInstall(
    lastUpdateInfo.asset,
    (pct) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:progress', pct);
      }
    },
    app
  );
});

ipcMain.handle('serial:set-auto-select', (_event, enabled) => {
  autoSelectSerial = !!enabled;
  return autoSelectSerial;
});

ipcMain.handle('serial:scan-ports', async () => {
  return await serialManager.scanPorts();
});

ipcMain.handle('serial:connect', (event, portName) => {
  if (!SerialManager.isValidComPort(portName)) return false;
  serialManager.connect(
    portName,
    (bytes) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial:rx', bytes);
      }
    },
    (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial:status', status);
      }
    }
  );
  return true;
});

ipcMain.handle('serial:disconnect', () => {
  serialManager.disconnect();
  return true;
});

ipcMain.on('serial:send', (event, bytes) => {
  serialManager.send(bytes);
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'serial');
  session.defaultSession.setDevicePermissionHandler((details) => details.deviceType === 'serial');

  session.defaultSession.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    const sorted = [...(portList || [])].sort((a, b) => scoreSerialPort(b) - scoreSerialPort(a));
    if (!autoSelectSerial && sorted.length === 0) {
      callback('');
      return;
    }
    const best = sorted.find((p) => scoreSerialPort(p) > 0) || sorted[0];
    callback(best ? String(best.portId) : '');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  serialManager.disconnect();
});

app.on('window-all-closed', () => {
  serialManager.disconnect();
  if (process.platform !== 'darwin') app.quit();
});
