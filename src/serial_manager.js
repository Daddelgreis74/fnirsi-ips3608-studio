// FNIRSI IPS3608 Studio - Native Windows Serial Manager
// Automatic COM port detection and full-duplex .NET SerialPort worker for binary USB-CDC communication

const { spawn, execFile } = require('child_process');

// 2E3C = Artery AT32 USB-CDC (FNIRSI IPS3608 / 2C23T), plus common USB-UART chips
const FNIRSI_VID = '2e3c';
const KNOWN_USB_VIDS = new Set(['2e3c', '1a86', '10c4', '0403', '0483', '067b']);

class SerialManager {
  static isValidComPort(portName) {
    return /^COM\d+$/i.test(String(portName || '').trim());
  }

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
      const psCmd = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $ProgressPreference = 'SilentlyContinue'; Get-CimInstance Win32_PnPEntity -Filter \"Name LIKE '%(COM%)'\" | Select-Object Name, DeviceID | ConvertTo-Json -Compress";
      execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], { timeout: 6000, windowsHide: true }, (err, stdout) => {
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

    const cleanPort = String(portName || '').trim().toUpperCase();
    if (!SerialManager.isValidComPort(cleanPort)) {
      if (onStatus) onStatus({ connected: false, port: null, error: 'Invalid COM port' });
      return;
    }

    this.onDataCallback = onData;
    this.onStatusCallback = onStatus;
    this.currentPort = cleanPort;

    const psScript = [
      "$ProgressPreference = 'SilentlyContinue'",
      "$ErrorActionPreference = 'Stop'",
      "$port = $null",
      "$psIn = $null",
      "$rs = $null",
      "$running = [ref]$true",
      "try {",
      `  $port = New-Object System.IO.Ports.SerialPort '${cleanPort}', 115200, 'None', 8, 'One'`,
      "  $port.DtrEnable = $true",
      "  $port.RtsEnable = $false",
      "  $port.ReadTimeout = 25",
      "  $port.WriteTimeout = 1000",
      "  $port.Open()",
      `  [Console]::WriteLine('[CONNECTED]:${cleanPort}')`,
      "  [Console]::Out.Flush()",
      "  $queue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()",
      "  $rs = [runspacefactory]::CreateRunspace()",
      "  $rs.Open()",
      "  $psIn = [powershell]::Create()",
      "  $psIn.Runspace = $rs",
      "  [void]$psIn.AddScript({",
      "    param($q, $run)",
      "    while ($run.Value) {",
      "      try {",
      "        $line = [Console]::In.ReadLine()",
      "        if ($null -eq $line) { $q.Enqueue('QUIT'); break }",
      "        $q.Enqueue($line)",
      "        if ($line.Trim() -eq 'QUIT') { break }",
      "      } catch {",
      "        $q.Enqueue('QUIT')",
      "        break",
      "      }",
      "    }",
      "  }).AddArgument($queue).AddArgument($running)",
      "  [void]$psIn.BeginInvoke()",
      "  $buf = New-Object byte[] 512",
      "  while ($running.Value -and $port.IsOpen) {",
      "    $cmd = $null",
      "    while ($queue.TryDequeue([ref]$cmd)) {",
      "      $hex = $cmd.Trim()",
      "      if ($hex -eq 'QUIT') { $running.Value = $false; break }",
      "      if ($hex.Length -ge 2 -and ($hex.Length % 2 -eq 0)) {",
      "        try {",
      "          $bytes = New-Object byte[] ($hex.Length / 2)",
      "          for ($i = 0; $i -lt $bytes.Length; $i++) {",
      "            $bytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16)",
      "          }",
      "          $port.Write($bytes, 0, $bytes.Length)",
      "        } catch {",
      "          [Console]::WriteLine('[ERR_TX]:' + $_.Exception.Message)",
      "          [Console]::Out.Flush()",
      "          $running.Value = $false",
      "          break",
      "        }",
      "      }",
      "    }",
      "    if (-not $running.Value) { break }",
      "    try {",
      "      $n = $port.Read($buf, 0, $buf.Length)",
      "      if ($n -gt 0) {",
      "        [Console]::WriteLine('[RX]:' + [BitConverter]::ToString($buf, 0, $n).Replace('-', ''))",
      "        [Console]::Out.Flush()",
      "      }",
      "    } catch [System.TimeoutException] {",
      "    } catch {",
      "      [Console]::WriteLine('[ERR_RX]:' + $_.Exception.Message)",
      "      [Console]::Out.Flush()",
      "      break",
      "    }",
      "  }",
      "} catch {",
      "  [Console]::WriteLine('[ERR_OPEN]:' + $_.Exception.Message)",
      "  [Console]::Out.Flush()",
      "} finally {",
      "  $running.Value = $false",
      "  if ($port -ne $null) {",
      "    try { if ($port.IsOpen) { $port.Close() } } catch {}",
      "    try { $port.Dispose() } catch {}",
      "  }",
      "  if ($psIn -ne $null) { try { $psIn.Dispose() } catch {} }",
      "  if ($rs -ne $null) { try { $rs.Close(); $rs.Dispose() } catch {} }",
      "  [Console]::WriteLine('[DISCONNECTED]')",
      "  [Console]::Out.Flush()",
      "}"
    ].join('\n');

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

    try {
      const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      this.worker = proc;

      let lineBuffer = '';
      proc.stdout.on('data', (chunk) => {
        if (this.worker !== proc) return;
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

      proc.stderr.on('data', (data) => {
        if (this.worker !== proc) return;
        console.warn('[SerialWorker stderr]:', data.toString());
      });

      proc.on('exit', () => {
        if (this.worker !== proc) return;
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
