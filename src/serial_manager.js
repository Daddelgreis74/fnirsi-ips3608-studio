// FNIRSI IPS3608 Studio - Native Windows Serial Manager
// Automatic COM port detection and full-duplex .NET SerialPort worker for binary USB-CDC communication

const { spawn, exec } = require('child_process');

// 2E3C = Artery AT32 USB-CDC (FNIRSI IPS3608 / 2C23T), plus common USB-UART chips
const FNIRSI_VID = '2e3c';
const KNOWN_USB_VIDS = new Set(['2e3c', '1a86', '10c4', '0403', '0483', '067b']);

class SerialManager {
  constructor() {
    this.worker = null;
    this.connected = false;
    this.currentPort = null;
    this.onDataCallback = null;
    this.onStatusCallback = null;
    this._scanPromise = null;
  }

  scanPorts() {
    if (this._scanPromise) return this._scanPromise;

    this._scanPromise = new Promise((resolve) => {
      if (process.platform !== 'win32') {
        this._scanPromise = null;
        return resolve([]);
      }
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\\(COM\\d+\\)' } | Select-Object Name, DeviceID | ConvertTo-Json -Compress"`;
      exec(cmd, { timeout: 3500 }, (err, stdout) => {
        this._scanPromise = null;
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
              isFnirsi: vid === FNIRSI_VID,
              isKnownUsb: vid ? KNOWN_USB_VIDS.has(vid) : false
            });
          }
          ports.sort((a, b) =>
            (b.isFnirsi - a.isFnirsi) ||
            (b.isKnownUsb - a.isKnownUsb) ||
            (b.isUsb - a.isUsb)
          );
          resolve(ports);
        } catch (e) {
          resolve([]);
        }
      });
    });

    return this._scanPromise;
  }

  connect(portName, onData, onStatus) {
    if (this.worker) {
      this.disconnect();
    }

    this.onDataCallback = onData;
    this.onStatusCallback = onStatus;
    this.currentPort = portName;

    const psScript = `
$code = @'
using System;
using System.IO.Ports;
using System.Threading;

public class Ips3608SerialWorker {
    private static SerialPort port;
    private static volatile bool running = true;
    private static readonly object txLock = new object();

    private static byte[] HexToBytes(string hex) {
        int len = hex.Length;
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = Convert.ToByte(hex.Substring(i, 2), 16);
        }
        return data;
    }

    public static void Run(string portName) {
        try {
            port = new SerialPort(portName, 115200, Parity.None, 8, StopBits.One);
            port.DtrEnable = true;
            port.RtsEnable = false;
            port.ReadTimeout = 400;
            port.WriteTimeout = 1000;
            port.Open();

            Console.WriteLine("[CONNECTED]:" + portName);
            Console.Out.Flush();

            Thread writerThread = new Thread(() => {
                while (running && port != null && port.IsOpen) {
                    try {
                        string cmd = Console.ReadLine();
                        if (cmd == null || cmd == "QUIT") {
                            running = false;
                            break;
                        }
                        cmd = cmd.Trim();
                        if (cmd.Length >= 2 && (cmd.Length % 2 == 0) && port.IsOpen) {
                            byte[] bytes = HexToBytes(cmd);
                            lock (txLock) {
                                if (port != null && port.IsOpen) {
                                    port.Write(bytes, 0, bytes.Length);
                                }
                            }
                        }
                    } catch (Exception ex) {
                        Console.WriteLine("[ERR_TX]:" + ex.Message);
                        Console.Out.Flush();
                        running = false;
                        break;
                    }
                }
            });
            writerThread.IsBackground = true;
            writerThread.Start();

            byte[] buf = new byte[512];
            while (running && port != null && port.IsOpen) {
                try {
                    int n = port.Read(buf, 0, buf.Length);
                    if (n > 0) {
                        string hex = BitConverter.ToString(buf, 0, n).Replace("-", "");
                        Console.WriteLine("[RX]:" + hex);
                        Console.Out.Flush();
                    }
                } catch (TimeoutException) {
                } catch (Exception ex) {
                    Console.WriteLine("[ERR_RX]:" + ex.Message);
                    Console.Out.Flush();
                    running = false;
                    break;
                }
            }
        } catch (Exception ex) {
            Console.WriteLine("[ERR_OPEN]:" + ex.Message);
            Console.Out.Flush();
        } finally {
            running = false;
            if (port != null) {
                try { if (port.IsOpen) port.Close(); } catch {}
                try { port.Dispose(); } catch {}
            }
            Console.WriteLine("[DISCONNECTED]");
            Console.Out.Flush();
        }
    }
}
'@
Add-Type -TypeDefinition $code
[Ips3608SerialWorker]::Run("${portName}")
`;

    try {
      this.worker = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let lineBuffer = '';
      this.worker.stdout.on('data', (chunk) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('[CONNECTED]:')) {
            this.connected = true;
            const p = trimmed.substring(12);
            if (this.onStatusCallback) this.onStatusCallback({ connected: true, port: p });
          } else if (trimmed.startsWith('[RX]:')) {
            const hex = trimmed.substring(5);
            if (hex.length > 0 && this.onDataCallback) {
              const bytes = Array.from(Buffer.from(hex, 'hex'));
              this.onDataCallback(bytes);
            }
          } else if (trimmed.startsWith('[ERR_OPEN]:')) {
            const msg = trimmed.substring(11);
            this.connected = false;
            if (this.onStatusCallback) this.onStatusCallback({ connected: false, port: this.currentPort, error: msg });
          } else if (trimmed.startsWith('[ERR_RX]:') || trimmed.startsWith('[ERR_TX]:')) {
            console.warn('[SerialWorker]', trimmed);
          } else if (trimmed === '[DISCONNECTED]') {
            this.connected = false;
            this.worker = null;
            if (this.onStatusCallback) this.onStatusCallback({ connected: false, port: null });
          }
        }
      });

      this.worker.stderr.on('data', (data) => {
        console.warn('[SerialWorker stderr]:', data.toString());
      });

      this.worker.on('exit', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.worker = null;
        if (wasConnected && this.onStatusCallback) {
          this.onStatusCallback({ connected: false, port: null });
        }
      });
    } catch (e) {
      this.connected = false;
      this.worker = null;
      if (this.onStatusCallback) this.onStatusCallback({ connected: false, port: null, error: e.message });
    }
  }

  send(bytes) {
    if (!this.worker || !this.connected || !this.worker.stdin.writable) return false;
    try {
      const hex = Buffer.from(bytes).toString('hex').toUpperCase();
      this.worker.stdin.write(hex + '\n');
      return true;
    } catch (e) {
      return false;
    }
  }

  disconnect() {
    this.connected = false;
    if (this.worker) {
      const w = this.worker;
      this.worker = null;
      try {
        if (w.stdin.writable) w.stdin.write('QUIT\n');
      } catch (e) {}
      setTimeout(() => {
        try { w.kill(); } catch (e) {}
      }, 250);
    }
    this.currentPort = null;
  }
}

module.exports = SerialManager;
