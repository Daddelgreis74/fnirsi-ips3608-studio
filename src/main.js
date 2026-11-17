const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const SerialManager = require('./serial_manager');
const updater = require('./updater');
const pkg = require('../package.json');

let mainWindow;
const serialManager = new SerialManager();

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
      nodeIntegration: true,
      contextIsolation: false,
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
    return await updater.checkForUpdates(pkg.version);
  } catch (err) {
    return { available: false, error: err.message, currentVersion: pkg.version };
  }
});

ipcMain.handle('updater:install', async (event, asset) => {
  return await updater.downloadAndInstall(
    asset,
    (pct) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:progress', pct);
      }
    },
    app
  );
});

ipcMain.handle('serial:scan-ports', async () => {
  return await serialManager.scanPorts();
});

ipcMain.handle('serial:connect', (event, portName) => {
  if (!portName) return false;
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
