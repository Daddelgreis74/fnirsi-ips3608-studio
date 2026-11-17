const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');

let mainWindow;
let preferredPortName = null;

// Known USB-to-Serial / CDC Vendor IDs (CH340, CP210x, FTDI, ST/GD32, Artery/FNIRSI)
const KNOWN_USB_VIDS = new Set(['1a86', '10c4', '0403', '0483', '2e3c', '067b']);

function scanPnpPorts() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\\(COM\\d+\\)' } | Select-Object Name, DeviceID | ConvertTo-Json -Compress"`;
    exec(cmd, { timeout: 3500 }, (err, stdout) => {
      if (err || !stdout || !stdout.trim()) return resolve([]);
      try {
        let items = JSON.parse(stdout.trim());
        if (!Array.isArray(items)) items = [items];
        const ports = [];
        for (const item of items) {
          const name = item.Name || '';
          const devId = item.DeviceID || '';
          const comMatch = name.match(/\((COM\d+)\)/i);
          if (!comMatch) continue;
          const comPort = comMatch[1].toUpperCase();
          const vidMatch = devId.match(/VID_([0-9A-F]{4})/i);
          const pidMatch = devId.match(/PID_([0-9A-F]{4})/i);
          const vid = vidMatch ? vidMatch[1].toLowerCase() : null;
          const pid = pidMatch ? pidMatch[1].toLowerCase() : null;
          const isBluetooth = /bluetooth/i.test(name) || /BTHENUM/i.test(devId);
          const isUsb = Boolean(vid) || /USB/i.test(devId);
          if (isBluetooth) continue;
          ports.push({
            comPort,
            name: name.replace(/\s*\(COM\d+\)/i, '').trim(),
            vid,
            pid,
            isUsb,
            isKnownUsb: vid ? KNOWN_USB_VIDS.has(vid) : false
          });
        }
        ports.sort((a, b) => (b.isKnownUsb - a.isKnownUsb) || (b.isUsb - a.isUsb));
        resolve(ports);
      } catch (e) {
        resolve([]);
      }
    });
  });
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
      nodeIntegration: true,
      contextIsolation: false,
      enableBlinkFeatures: 'Serial',
      backgroundThrottling: false
    },
    autoHideMenuBar: true
  });

  // Native Web Serial API Handlers with smart USB auto-selection
  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (!portList || portList.length === 0) {
      return callback('');
    }

    let chosen = null;
    if (preferredPortName) {
      chosen = portList.find(p => (p.portName || '').toUpperCase() === preferredPortName.toUpperCase());
    }
    if (!chosen) {
      chosen = portList.find(p => p.vendorId && KNOWN_USB_VIDS.has(String(p.vendorId).toLowerCase()));
    }
    if (!chosen) {
      chosen = portList.find(p => p.vendorId !== undefined && p.vendorId !== '');
    }
    if (!chosen) {
      chosen = portList[0];
    }

    callback(chosen.portId);
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'serial') return true;
    return false;
  });

  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') return true;
    return false;
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('serial:scan-pnp-ports', async () => {
  return await scanPnpPorts();
});

ipcMain.handle('serial:set-preferred-port', (event, portName) => {
  preferredPortName = portName || null;
  return true;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
