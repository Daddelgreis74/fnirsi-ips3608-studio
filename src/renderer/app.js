/**
 * FNIRSI IPS3608 Studio - Main Renderer Application
 */

(function () {
  'use strict';

const ipsApi = (typeof window !== 'undefined' && window.ipsApi) ? window.ipsApi : null;

// ==========================================================================
// i18n Initialization (German, English, French)
// ==========================================================================
const LANGUAGES = ['de', 'en', 'fr'];
const translator = I18nCore.createTranslator(
  I18nLocales,
  I18nCore.resolveLanguage(localStorage.getItem('language'), navigator.language, LANGUAGES)
);
const t = translator.t;

// Application State
const state = {
  connected: false,
  connecting: false,
  manualDisconnect: false,
  keyLocked: localStorage.getItem('pcControlMode') !== 'false',
  detectedPortName: null,
  outputOn: false,
  targetVoltage: 12.00,
  targetCurrent: 2.00,
  actualVoltage: 0.00,
  actualCurrent: 0.00,
  actualPower: 0.00,
  temperature: 24.5,
  mode: 'CV',
  capacityAh: 0.00,
  energyWh: 0.00,
  startTime: null,

  // Serial Communication Buffers
  readBuffer: new Uint8Array(0),
  pnpPorts: [],
  awaitingLimitsRefresh: false,
  webSerialPort: null,
  webSerialReader: null,
  webSerialWriter: null,

  // Data Logger
  logging: false,
  logData: [],

  // Protection Status
  protection: {
    code: 0,
    ovp: false,
    ocp: false,
    opp: false,
    otp: false,
    scp: false,
    lvp: false
  },

  // Scope Waveform History
  history: [],
  timebaseSeconds: 30,

  // Hardware Protection Limits (Registers 0xD1 - 0xD5)
  protectionLimits: {
    ovp: 38.00,
    ocp: 8.20,
    opp: 300.0,
    otp: 80.0,
    lvp: 0.00
  },

  // Device Hardware Info
  deviceInfo: {
    model: 'IPS3608',
    firmware: '',
    serial: ''
  },

  // GitHub Updater
  updateInfo: null,
  updating: false
};

// UI Element References
const elements = {
  selLanguage: document.getElementById('selLanguage'),
  btnCheckUpdate: document.getElementById('btnCheckUpdate'),
  btnCheckUpdateText: document.getElementById('btnCheckUpdateText'),

  // Device Info Chip
  deviceInfoChip: document.getElementById('deviceInfoChip'),
  chipModelText: document.getElementById('chipModelText'),
  chipFwText: document.getElementById('chipFwText'),
  chipSnText: document.getElementById('chipSnText'),
  btnKeyLock: document.getElementById('btnKeyLock'),
  btnKeyLockText: document.getElementById('btnKeyLockText'),
  btnOpenProtectionModal: document.getElementById('btnOpenProtectionModal'),
  btnBootloader: document.getElementById('btnBootloader'),

  usbStatusPill: document.getElementById('usbStatusPill'),
  usbStatusLabel: document.getElementById('usbStatusLabel'),

  outputPill: document.getElementById('outputPill'),
  outputPillText: document.getElementById('outputPillText'),
  btnMasterPower: document.getElementById('btnMasterPower'),
  btnMasterPowerLabel: document.getElementById('btnMasterPowerLabel'),

  dispActualVoltage: document.getElementById('dispActualVoltage'),
  dispActualCurrent: document.getElementById('dispActualCurrent'),
  dispActualPower: document.getElementById('dispActualPower'),
  barVoltage: document.getElementById('barVoltage'),
  barCurrent: document.getElementById('barCurrent'),
  barPower: document.getElementById('barPower'),

  modeBadge: document.getElementById('modeBadge'),
  tempBadge: document.getElementById('tempBadge'),
  dispCapacityAh: document.getElementById('dispCapacityAh'),
  dispEnergyWh: document.getElementById('dispEnergyWh'),
  dispUptime: document.getElementById('dispUptime'),
  btnResetCapacity: document.getElementById('btnResetCapacity'),

  // Protection Indicators (Pills)
  flagOvp: document.getElementById('flagOvp'),
  flagOcp: document.getElementById('flagOcp'),
  flagOpp: document.getElementById('flagOpp'),
  flagOtp: document.getElementById('flagOtp'),
  flagScp: document.getElementById('flagScp'),

  // Hardware Protection Modal
  modalProtectionSettings: document.getElementById('modalProtectionSettings'),
  btnCloseProtectionModal: document.getElementById('btnCloseProtectionModal'),
  btnRefreshProtectionLimits: document.getElementById('btnRefreshProtectionLimits'),
  btnSaveProtectionLimits: document.getElementById('btnSaveProtectionLimits'),
  protectionSaveFeedback: document.getElementById('protectionSaveFeedback'),
  inputLimitOvp: document.getElementById('inputLimitOvp'),
  inputLimitOcp: document.getElementById('inputLimitOcp'),
  inputLimitOpp: document.getElementById('inputLimitOpp'),
  inputLimitOtp: document.getElementById('inputLimitOtp'),
  inputLimitLvp: document.getElementById('inputLimitLvp'),
  sliderBrightness: document.getElementById('sliderBrightness'),
  dispBrightnessVal: document.getElementById('dispBrightnessVal'),

  inputTargetVoltage: document.getElementById('inputTargetVoltage'),
  sliderVoltage: document.getElementById('sliderVoltage'),
  inputTargetCurrent: document.getElementById('inputTargetCurrent'),
  sliderCurrent: document.getElementById('sliderCurrent'),

  scopeCanvas: document.getElementById('scopeCanvas'),
  timebaseSelect: document.getElementById('timebaseSelect'),
  btnToggleLog: document.getElementById('btnToggleLog'),
  btnRecordText: document.getElementById('btnRecordText'),
  logCounter: document.getElementById('logCounter'),
  btnExportCsv: document.getElementById('btnExportCsv')
};

// ==========================================================================
// Serial Communication & Auto-Detection Engine (Preload Serial Bridge)
// ==========================================================================

async function scanSystemComPorts() {
  if (!ipsApi) return [];
  try {
    const ports = await ipsApi.scanPorts();
    state.pnpPorts = Array.isArray(ports) ? ports : [];
    return state.pnpPorts;
  } catch (err) {
    console.warn('PnP scan failed:', err);
    return [];
  }
}

function syncUsbLedFromState() {
  if (state.connected) {
    updateUsbLedUI('connected', state.detectedPortName);
  } else if (state.connecting) {
    updateUsbLedUI('connecting', state.detectedPortName);
  } else {
    const best = state.pnpPorts.find(p => p.isFnirsi) || state.pnpPorts.find(p => p.isKnownUsb || p.isUsb);
    updateUsbLedUI('searching', best ? best.comPort : 'USB');
  }
}

function updateUsbLedUI(statusMode, portName = null) {
  if (!elements.usbStatusPill || !elements.usbStatusLabel) return;
  elements.usbStatusPill.classList.remove('usb-led-searching', 'usb-led-connecting', 'usb-led-connected');

  if (statusMode === 'connected') {
    elements.usbStatusPill.classList.add('usb-led-connected');
    elements.usbStatusLabel.textContent = portName || 'USB';
    elements.usbStatusPill.title = t('header.usb_connected', { port: portName || 'USB' });
  } else if (statusMode === 'connecting') {
    elements.usbStatusPill.classList.add('usb-led-connecting');
    elements.usbStatusLabel.textContent = portName || 'USB';
    elements.usbStatusPill.title = t('header.usb_connecting', { port: portName || 'USB' });
  } else {
    elements.usbStatusPill.classList.add('usb-led-searching');
    elements.usbStatusLabel.textContent = portName || 'USB';
    elements.usbStatusPill.title = t('header.usb_searching');
  }
}

async function refreshPortList() {
  try {
    await scanSystemComPorts();
    syncUsbLedFromState();
  } catch (err) {
    console.error('Error fetching ports:', err);
  }
}

let connectTimeoutTimer = null;
const KNOWN_WEB_SERIAL_VIDS = new Set([0x2e3c, 0x1a86, 0x10c4, 0x0403, 0x0483, 0x067b]);

function hasWebSerial() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

function isIpsWebSerialPort(port) {
  if (!port || typeof port.getInfo !== 'function') return false;
  const info = port.getInfo() || {};
  return info.usbVendorId === 0x2e3c || KNOWN_WEB_SERIAL_VIDS.has(info.usbVendorId);
}

function resolveWebSerialLabel(port) {
  const info = (port && typeof port.getInfo === 'function') ? (port.getInfo() || {}) : {};
  const vidHex = info.usbVendorId ? info.usbVendorId.toString(16).padStart(4, '0') : '';
  if (vidHex && Array.isArray(state.pnpPorts)) {
    const match = state.pnpPorts.find(p => p.vid === vidHex);
    if (match && match.comPort) return match.comPort;
  }
  if (info.usbVendorId === 0x2e3c) return 'IPS3608 USB';
  return 'USB';
}

async function writeSerialBytes(bytes) {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (state.webSerialWriter) {
    await state.webSerialWriter.write(payload);
    return;
  }
  if (ipsApi) {
    ipsApi.send(Array.from(payload));
  }
}

async function startWebSerialReadLoop(readable) {
  if (!readable) return;
  const reader = readable.getReader();
  state.webSerialReader = reader;
  try {
    while (state.connected || state.connecting) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        handleIncomingBytes(value);
      }
    }
  } catch (err) {
    if (state.connected) {
      console.warn('Web Serial read error:', err.message);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
    if (state.webSerialReader === reader) {
      state.webSerialReader = null;
    }
    if (state.connected) {
      await disconnectSerial(true);
    }
  }
}

async function openWebSerialPort(port) {
  await port.open({ baudRate: 115200 });
  try {
    await port.setSignals({ dataTerminalReady: true, requestToSend: false }).catch(() => {});
    state.webSerialPort = port;
    state.webSerialWriter = port.writable ? port.writable.getWriter() : null;
  } catch (err) {
    state.webSerialPort = null;
    state.webSerialWriter = null;
    await port.close().catch(() => {});
    throw err;
  }

  const label = resolveWebSerialLabel(port);
  state.readBuffer = new Uint8Array(0);
  startWebSerialReadLoop(port.readable);
  await onSerialConnected(label);
}

async function connectWebSerial(silent = false) {
  if (state.connecting || !hasWebSerial()) return;
  state.connecting = true;
  state.manualDisconnect = false;
  state.silentConnect = silent;
  updateUsbLedUI('connecting', 'USB');

  try {
    if (typeof navigator.serial.getPorts === 'function') {
      const granted = await navigator.serial.getPorts();
      const sorted = [...granted].sort((a, b) => {
        const ai = (a.getInfo && a.getInfo().usbVendorId === 0x2e3c) ? 1 : 0;
        const bi = (b.getInfo && b.getInfo().usbVendorId === 0x2e3c) ? 1 : 0;
        return bi - ai;
      });
      const known = sorted.find(isIpsWebSerialPort) || sorted[0];
      if (known) {
        try {
          await openWebSerialPort(known);
          return;
        } catch (_err) {
          // Fall through to requestPort if previously granted handle failed to reopen
        }
      }
    }

    if (ipsApi && typeof ipsApi.setAutoSelect === 'function') {
      await ipsApi.setAutoSelect(true).catch(() => {});
    }
    const port = await navigator.serial.requestPort();
    await openWebSerialPort(port);
  } catch (err) {
    console.warn('Web Serial connect failed:', err && err.name, err && err.message);
    state.connecting = false;
    updateConnectionUI(false);
    if (!silent && err && err.name !== 'NotFoundError') {
      alert(t('dialog.connect_error', { message: err.message }));
    }
  } finally {
    state.connecting = false;
  }
}

async function autoScanAndConnect() {
  if (state.connected || state.connecting || state.manualDisconnect) return;

  if (hasWebSerial()) {
    await connectWebSerial(true);
    return;
  }

  if (!ipsApi) return;
  try {
    const pnpPorts = await scanSystemComPorts();
    const fnirsiOrUsb = pnpPorts.find(p => p.isFnirsi) || pnpPorts.find(p => p.isKnownUsb || p.isUsb);
    if (fnirsiOrUsb) {
      await connectSerial(true, fnirsiOrUsb.comPort);
    } else {
      updateUsbLedUI('searching', 'USB');
    }
  } catch (err) {
    console.debug('Auto-scan pass:', err.message);
  }
}

async function connectSerial(silent = false, explicitPort = null) {
  if (state.connected) {
    state.manualDisconnect = true;
    await disconnectSerial();
    return;
  }

  if (hasWebSerial() && !explicitPort) {
    await connectWebSerial(silent);
    return;
  }

  if (state.connecting || !ipsApi) return;
  state.connecting = true;
  state.manualDisconnect = false;
  state.silentConnect = silent;

  if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
  connectTimeoutTimer = setTimeout(() => {
    if (state.connecting && !state.connected) {
      console.warn('Serial connect timed out, resetting state');
      state.connecting = false;
      ipsApi.disconnect().catch(() => {});
      updateConnectionUI(false);
    }
  }, 12000);

  try {
    let targetPort = explicitPort;
    if (!targetPort) {
      const ports = state.pnpPorts.length > 0 ? state.pnpPorts : await scanSystemComPorts();
      const best = ports.find(p => p.isFnirsi) || ports.find(p => p.isKnownUsb || p.isUsb) || ports[0];
      targetPort = best ? best.comPort : null;
    }

    if (!targetPort) {
      if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
      state.connecting = false;
      updateUsbLedUI('searching', 'USB');
      if (!silent) {
        alert(t('dialog.connect_error', { message: t('header.usb_searching') }));
      }
      return;
    }

    state.detectedPortName = targetPort;
    updateUsbLedUI('connecting', targetPort);
    state.readBuffer = new Uint8Array(0);
    await ipsApi.connect(targetPort);
  } catch (err) {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    console.error('Serial connection failed:', err);
    if (!silent) {
      alert(t('dialog.connect_error', { message: err.message }));
    }
    state.connecting = false;
    updateConnectionUI(false);
  }
}

async function onSerialConnected(portName) {
  if (connectTimeoutTimer) {
    clearTimeout(connectTimeoutTimer);
    connectTimeoutTimer = null;
  }
  state.connecting = false;
  state.connected = true;
  state.lastRxTime = Date.now();
  state.detectedPortName = portName;
  clearTxQueues();
  updateConnectionUI(true);

  // Let USB-CDC settle, then pace handshake & metadata queries cleanly (80ms spacing)
  await new Promise(r => setTimeout(r, 150));
  if (!state.connected) return;

  sendFrame(IPS3608Protocol.connectPacket(), true);
  await new Promise(r => setTimeout(r, 80));
  if (!state.connected) return;
  sendFrame(IPS3608Protocol.initHandshake(), true);
  await new Promise(r => setTimeout(r, 80));
  if (!state.connected) return;
  sendFrame(IPS3608Protocol.queryModel(), true);
  await new Promise(r => setTimeout(r, 80));
  if (!state.connected) return;
  sendFrame(IPS3608Protocol.queryFirmware(), true);
  await new Promise(r => setTimeout(r, 80));
  if (!state.connected) return;
  sendFrame(IPS3608Protocol.querySerial(), true);
  await new Promise(r => setTimeout(r, 80));
  if (!state.connected) return;

  // Keep front-panel knob & buttons unlocked unless user explicitly locked them
  if (!state.keyLocked) {
    sendFrame(IPS3608Protocol.disconnectPacket(), true);
    await new Promise(r => setTimeout(r, 80));
    if (!state.connected) return;
  }

  startPolling();
}

function updateKeyLockUI() {
  if (!elements.btnKeyLock || !elements.btnKeyLockText) return;
  elements.btnKeyLock.classList.toggle('btn-tool-active', state.keyLocked);
  elements.btnKeyLockText.textContent = state.keyLocked
    ? t('header.keylock_locked')
    : t('header.keylock_unlocked');
}

function toggleKeyLock() {
  state.keyLocked = !state.keyLocked;
  localStorage.setItem('pcControlMode', state.keyLocked ? 'true' : 'false');
  updateKeyLockUI();

  if (state.keyLocked) {
    state.manualDisconnect = false;
    state.lastRxTime = Date.now();
    if (state.connected) {
      sendFrame(IPS3608Protocol.connectPacket(), true);
      sendFrame(IPS3608Protocol.initHandshake(), true);
      sendFrame(IPS3608Protocol.queryAll(), true);
    } else {
      autoScanAndConnect();
    }
  } else if (state.connected) {
    sendFrame(IPS3608Protocol.disconnectPacket(), true);
  }
}

async function disconnectSerial(skipUnlock = false) {
  if (connectTimeoutTimer) {
    clearTimeout(connectTimeoutTimer);
    connectTimeoutTimer = null;
  }
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  clearTxQueues();

  // Send official disconnect/unlock packet (CMD_2: F1 C1 00 01 00 01) directly before closing
  if (!skipUnlock && state.connected) {
    try {
      await writeSerialBytes(IPS3608Protocol.disconnectPacket());
      await new Promise(r => setTimeout(r, 60));
    } catch (e) {}
  }

  state.connected = false;
  state.connecting = false;

  if (state.webSerialReader) {
    try { await state.webSerialReader.cancel(); } catch (e) {}
    state.webSerialReader = null;
  }
  if (state.webSerialWriter) {
    try { await state.webSerialWriter.close(); } catch (e) {}
    try { state.webSerialWriter.releaseLock(); } catch (e) {}
    state.webSerialWriter = null;
  }
  if (state.webSerialPort) {
    try { await state.webSerialPort.close(); } catch (e) {}
    state.webSerialPort = null;
  }

  if (ipsApi) {
    try {
      await ipsApi.disconnect();
    } catch (e) {}
  }

  updateConnectionUI(false);
  state.protection = { code: 0, ovp: false, ocp: false, opp: false, otp: false, scp: false, lvp: false };
  state.deviceInfo = { model: 'IPS3608', firmware: '', serial: '' };
  updateTelemetryDisplays();
}

const MAX_READ_BUFFER_BYTES = 4096;

function handleIncomingBytes(chunk) {
  const combined = new Uint8Array(state.readBuffer.length + chunk.length);
  combined.set(state.readBuffer);
  combined.set(chunk, state.readBuffer.length);
  state.readBuffer = combined;

  const { frames, remainingBuffer } = IPS3608Protocol.parseStream(state.readBuffer);
  // Guard against unbounded buffer growth on corrupted serial noise
  state.readBuffer = remainingBuffer.length > MAX_READ_BUFFER_BYTES
    ? remainingBuffer.slice(remainingBuffer.length - 256)
    : remainingBuffer;

  if (frames.length > 0) {
    state.lastRxTime = Date.now();
  }

  for (const frame of frames) {
    const data = IPS3608Protocol.decodeTelemetry(frame);
    applyTelemetry(data);
  }
}

// Serialized FIFO TX Queues (priority commands ahead of background polls, preserving exact order)
let priorityQueue = [];
let pollQueue = [];
let txDraining = false;

function clearTxQueues() {
  priorityQueue = [];
  pollQueue = [];
}

function sendFrame(frameBytes, priority = true) {
  if (!state.connected || (!state.webSerialWriter && !ipsApi)) return;
  if (!priority) {
    if (priorityQueue.length > 0 || pollQueue.length > 0) return;
    pollQueue.push(frameBytes);
  } else {
    priorityQueue.push(frameBytes);
  }
  drainTxQueue();
}

async function drainTxQueue() {
  if (txDraining) return;
  txDraining = true;
  try {
    while ((priorityQueue.length > 0 || pollQueue.length > 0) && state.connected && (state.webSerialWriter || ipsApi)) {
      const next = priorityQueue.length > 0 ? priorityQueue.shift() : pollQueue.shift();
      await writeSerialBytes(next);
      await new Promise(r => setTimeout(r, 45));
    }
  } finally {
    txDraining = false;
  }
}

function ensurePcControlMode() {
  if (state.connected && !state.keyLocked) {
    state.keyLocked = true;
    state.lastRxTime = Date.now();
    localStorage.setItem('pcControlMode', 'true');
    updateKeyLockUI();
    sendFrame(IPS3608Protocol.connectPacket(), true);
    sendFrame(IPS3608Protocol.initHandshake(), true);
  }
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) clearTimeout(pollTimer);

  async function pollCycle() {
    if (!state.connected) return;

    // Watchdog: only enforce 4.5s RX timeout while in active PC-Control mode
    if (state.keyLocked && state.lastRxTime && (Date.now() - state.lastRxTime > 4500)) {
      console.warn('RX Watchdog timeout: no telemetry for 4.5s, disconnecting');
      await disconnectSerial();
      return;
    }

    if (state.keyLocked) {
      sendFrame(IPS3608Protocol.queryAll(), false);
    }

    if (state.connected) {
      pollTimer = setTimeout(pollCycle, 250);
    }
  }

  pollCycle();
}

// ==========================================================================
// Telemetry & UI Dispatcher
// ==========================================================================

function applyTelemetry(data) {
  if (data.voltage !== undefined) state.actualVoltage = data.voltage;
  if (data.current !== undefined) state.actualCurrent = data.current;
  if (data.power !== undefined) state.actualPower = data.power;
  if (data.temperature !== undefined) state.temperature = data.temperature;
  if (data.outputOn !== undefined) updateOutputState(data.outputOn);
  if (data.mode !== undefined) state.mode = data.mode;
  if (data.capacityAh !== undefined) state.capacityAh = data.capacityAh;
  if (data.energyWh !== undefined) state.energyWh = data.energyWh;

  // Sync setpoints from device if user is not actively editing sliders
  if (!state.lastUserEditTime || (Date.now() - state.lastUserEditTime > 1500)) {
    if (data.targetVoltage !== undefined && data.targetVoltage >= 0 && data.targetVoltage <= 36.0) {
      state.targetVoltage = data.targetVoltage;
      if (document.activeElement !== elements.inputTargetVoltage) {
        elements.inputTargetVoltage.value = data.targetVoltage.toFixed(2);
      }
      elements.sliderVoltage.value = data.targetVoltage;
    }
    if (data.targetCurrent !== undefined && data.targetCurrent >= 0 && data.targetCurrent <= 8.2) {
      state.targetCurrent = data.targetCurrent;
      if (document.activeElement !== elements.inputTargetCurrent) {
        elements.inputTargetCurrent.value = data.targetCurrent.toFixed(2);
      }
      elements.sliderCurrent.value = data.targetCurrent;
    }
  }

  // Device Info
  if (data.model !== undefined && data.model.length > 0) state.deviceInfo.model = data.model;
  if (data.firmware !== undefined && data.firmware.length > 0) state.deviceInfo.firmware = data.firmware;
  if (data.serial !== undefined && data.serial.length > 0) state.deviceInfo.serial = data.serial;

  // Hardware Protection Limits
  let hasLimitsUpdate = false;
  if (data.ovpLimit !== undefined && data.ovpLimit > 0) { state.protectionLimits.ovp = data.ovpLimit; hasLimitsUpdate = true; }
  if (data.ocpLimit !== undefined && data.ocpLimit > 0) { state.protectionLimits.ocp = data.ocpLimit; hasLimitsUpdate = true; }
  if (data.oppLimit !== undefined && data.oppLimit > 0) { state.protectionLimits.opp = data.oppLimit; hasLimitsUpdate = true; }
  if (data.otpLimit !== undefined && data.otpLimit > 0) { state.protectionLimits.otp = data.otpLimit; hasLimitsUpdate = true; }
  if (data.lvpLimit !== undefined) { state.protectionLimits.lvp = data.lvpLimit; hasLimitsUpdate = true; }

  if (hasLimitsUpdate && state.awaitingLimitsRefresh) {
    state.awaitingLimitsRefresh = false;
    updateProtectionModalInputs();
  }

  if (data.protection !== undefined) {
    state.protection = data.protection;
  }

  updateTelemetryDisplays();
  recordHistoryPoint();
}

function updateTelemetryDisplays() {
  elements.dispActualVoltage.textContent = state.actualVoltage.toFixed(3);
  elements.dispActualCurrent.textContent = state.actualCurrent.toFixed(4);
  elements.dispActualPower.textContent = state.actualPower.toFixed(2);

  // Meter bars
  elements.barVoltage.style.width = Math.min(100, (state.actualVoltage / 36.0) * 100) + '%';
  elements.barCurrent.style.width = Math.min(100, (state.actualCurrent / 8.2) * 100) + '%';
  elements.barPower.style.width = Math.min(100, (state.actualPower / 300.0) * 100) + '%';

  // Badges
  elements.modeBadge.textContent = `${state.mode} ${t('telemetry.mode_suffix')}`;
  elements.modeBadge.className = 'badge ' + (state.mode === 'CC' ? 'badge-cc' : 'badge-cv');
  elements.tempBadge.textContent = `🌡️ ${state.temperature.toFixed(1)} °C`;

  elements.dispCapacityAh.textContent = state.capacityAh.toFixed(3) + ' Ah';
  elements.dispEnergyWh.textContent = state.energyWh.toFixed(3) + ' Wh';

  if (state.startTime) {
    const elapsedSec = Math.floor((Date.now() - state.startTime) / 1000);
    const h = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    elements.dispUptime.textContent = `${h}:${m}:${s}`;
  } else {
    elements.dispUptime.textContent = '00:00:00';
  }

  // Device Info Chip
  if (elements.chipModelText && state.deviceInfo.model) {
    elements.chipModelText.textContent = state.deviceInfo.model;
  }
  if (elements.chipFwText) {
    elements.chipFwText.textContent = state.deviceInfo.firmware ? (`FW: ${state.deviceInfo.firmware}`) : t('header.fw_unknown');
  }
  if (elements.chipSnText) {
    elements.chipSnText.textContent = state.deviceInfo.serial ? (`SN: ${state.deviceInfo.serial}`) : t('header.sn_unknown');
  }

  // Protection Pills (OVP, OCP, OPP, OTP, LVP / SCP)
  const prot = state.protection || {};
  if (elements.flagOvp) elements.flagOvp.classList.toggle('flag-alert', !!prot.ovp);
  if (elements.flagOcp) elements.flagOcp.classList.toggle('flag-alert', !!prot.ocp);
  if (elements.flagOpp) elements.flagOpp.classList.toggle('flag-alert', !!prot.opp);
  if (elements.flagOtp) elements.flagOtp.classList.toggle('flag-alert', !!prot.otp);
  if (elements.flagScp) elements.flagScp.classList.toggle('flag-alert', !!(prot.scp || prot.lvp));
}

function updateConnectionUI(connected) {
  state.connected = connected;
  if (connected) {
    updateUsbLedUI('connected', state.detectedPortName);
  } else {
    updateUsbLedUI('searching', 'USB');
  }
}

function updateOutputState(on) {
  state.outputOn = on;
  if (on) {
    if (!state.startTime) state.startTime = Date.now();
    elements.outputPill.className = 'output-status-pill status-on';
    elements.outputPillText.textContent = t('header.output_on');
    elements.btnMasterPower.className = 'master-power-btn btn-power-on';
    elements.btnMasterPowerLabel.textContent = t('control.power_on');
  } else {
    state.startTime = null;
    elements.outputPill.className = 'output-status-pill status-off';
    elements.outputPillText.textContent = t('header.output_off');
    elements.btnMasterPower.className = 'master-power-btn btn-power-off';
    elements.btnMasterPowerLabel.textContent = t('control.power_off');
  }
}

// ==========================================================================
// Setpoint Controls
// ==========================================================================

let voltageTxTimer = null;
let currentTxTimer = null;

function setTargetVoltage(v, immediate = true) {
  const val = Math.max(0, Math.min(36.0, parseFloat(v) || 0));
  state.targetVoltage = val;
  state.lastUserEditTime = Date.now();
  elements.inputTargetVoltage.value = val.toFixed(2);
  elements.sliderVoltage.value = val;

  if (!state.connected) return;
  if (immediate) {
    if (voltageTxTimer) { clearTimeout(voltageTxTimer); voltageTxTimer = null; }
    ensurePcControlMode();
    sendFrame(IPS3608Protocol.setVoltage(val), true);
  } else if (!voltageTxTimer) {
    voltageTxTimer = setTimeout(() => {
      voltageTxTimer = null;
      if (state.connected) {
        ensurePcControlMode();
        sendFrame(IPS3608Protocol.setVoltage(state.targetVoltage), true);
      }
    }, 80);
  }
}

function setTargetCurrent(a, immediate = true) {
  const val = Math.max(0, Math.min(8.2, parseFloat(a) || 0));
  state.targetCurrent = val;
  state.lastUserEditTime = Date.now();
  elements.inputTargetCurrent.value = val.toFixed(2);
  elements.sliderCurrent.value = val;

  if (!state.connected) return;
  if (immediate) {
    if (currentTxTimer) { clearTimeout(currentTxTimer); currentTxTimer = null; }
    ensurePcControlMode();
    sendFrame(IPS3608Protocol.setCurrent(val), true);
  } else if (!currentTxTimer) {
    currentTxTimer = setTimeout(() => {
      currentTxTimer = null;
      if (state.connected) {
        ensurePcControlMode();
        sendFrame(IPS3608Protocol.setCurrent(state.targetCurrent), true);
      }
    }, 80);
  }
}

function toggleMasterOutput() {
  const newState = !state.outputOn;
  updateOutputState(newState);

  if (newState) {
    state.protection = { code: 0, ovp: false, ocp: false, opp: false, otp: false, scp: false, lvp: false };
    updateTelemetryDisplays();
  }

  if (state.connected) {
    ensurePcControlMode();
    sendFrame(IPS3608Protocol.setOutput(newState), true);
  }
}

// ==========================================================================
// Advanced Hardware Commands (Capacity Reset, Bootloader & Safety Limits)
// ==========================================================================

async function resetCapacityCounter() {
  state.capacityAh = 0.00;
  state.energyWh = 0.00;
  updateTelemetryDisplays();

  if (state.connected) {
    ensurePcControlMode();
    sendFrame(IPS3608Protocol.resetCapacity(), true);
    setTimeout(() => {
      if (state.connected) sendFrame(IPS3608Protocol.startCapacity(), true);
    }, 150);
  }
}

async function triggerBootloader() {
  const confirmed = confirm(t('dialog.bootloader_confirm'));
  if (!confirmed) return;

  if (state.connected) {
    ensurePcControlMode();
    sendFrame(IPS3608Protocol.enterBootloader(), true);
    setTimeout(() => {
      disconnectSerial(true);
    }, 300);
  }
}

function updateProtectionModalInputs() {
  if (elements.inputLimitOvp) elements.inputLimitOvp.value = state.protectionLimits.ovp.toFixed(2);
  if (elements.inputLimitOcp) elements.inputLimitOcp.value = state.protectionLimits.ocp.toFixed(2);
  if (elements.inputLimitOpp) elements.inputLimitOpp.value = state.protectionLimits.opp.toFixed(1);
  if (elements.inputLimitOtp) elements.inputLimitOtp.value = state.protectionLimits.otp.toFixed(1);
  if (elements.inputLimitLvp) elements.inputLimitLvp.value = state.protectionLimits.lvp.toFixed(2);
}

function openProtectionModal() {
  updateProtectionModalInputs();
  if (elements.protectionSaveFeedback) {
    elements.protectionSaveFeedback.className = 'save-feedback hidden';
    elements.protectionSaveFeedback.textContent = '';
  }
  elements.modalProtectionSettings.classList.remove('hidden');

  if (state.connected) {
    state.awaitingLimitsRefresh = true;
    sendFrame(IPS3608Protocol.queryAll(), true);
  }
}

function closeProtectionModal() {
  elements.modalProtectionSettings.classList.add('hidden');
}

async function refreshProtectionLimits() {
  if (state.connected) {
    state.awaitingLimitsRefresh = true;
    sendFrame(IPS3608Protocol.queryAll(), true);
  }
  updateProtectionModalInputs();
  if (elements.protectionSaveFeedback) {
    elements.protectionSaveFeedback.className = 'save-feedback success';
    elements.protectionSaveFeedback.textContent = t('modal.refreshed_msg');
    setTimeout(() => {
      if (elements.protectionSaveFeedback) elements.protectionSaveFeedback.className = 'save-feedback hidden';
    }, 2500);
  }
}

async function saveProtectionLimits() {
  const ovp = Math.max(0, Math.min(38.0, parseFloat(elements.inputLimitOvp.value) || 38.0));
  const ocp = Math.max(0, Math.min(8.5, parseFloat(elements.inputLimitOcp.value) || 8.2));
  const opp = Math.max(0, Math.min(320.0, parseFloat(elements.inputLimitOpp.value) || 300.0));
  const otp = Math.max(30.0, Math.min(95.0, parseFloat(elements.inputLimitOtp.value) || 80.0));
  const lvp = Math.max(0, Math.min(36.0, parseFloat(elements.inputLimitLvp.value) || 0.0));

  state.protectionLimits = { ovp, ocp, opp, otp, lvp };

  if (state.connected) {
    ensurePcControlMode();
    sendFrame(IPS3608Protocol.setOvpLimit(ovp), true);
    sendFrame(IPS3608Protocol.setOcpLimit(ocp), true);
    sendFrame(IPS3608Protocol.setOppLimit(opp), true);
    sendFrame(IPS3608Protocol.setOtpLimit(otp), true);
    sendFrame(IPS3608Protocol.setLvpLimit(lvp), true);
  }

  if (elements.protectionSaveFeedback) {
    elements.protectionSaveFeedback.className = 'save-feedback success';
    elements.protectionSaveFeedback.textContent = t('modal.saved_msg');
    setTimeout(() => {
      if (elements.protectionSaveFeedback) elements.protectionSaveFeedback.className = 'save-feedback hidden';
    }, 3000);
  }
}

// ==========================================================================
// Canvas Oscilloscope Waveform Renderer (Throttled / Demand-Driven)
// ==========================================================================

let scopeNeedsRedraw = true;
let lastScopeDrawTime = 0;

function recordHistoryPoint() {
  const now = Date.now();
  state.history.push({
    time: now,
    v: state.actualVoltage,
    a: state.actualCurrent
  });

  const cutoff = now - (state.timebaseSeconds * 1000);
  while (state.history.length > 0 && state.history[0].time < cutoff) {
    state.history.shift();
  }
  scopeNeedsRedraw = true;

  if (state.logging) {
    state.logData.push({
      timestamp: new Date().toISOString(),
      voltage: state.actualVoltage.toFixed(3),
      current: state.actualCurrent.toFixed(4),
      power: state.actualPower.toFixed(2),
      mode: state.mode
    });
    elements.logCounter.textContent = t('scope.log_count', { count: state.logData.length });
  }
}

function drawScope(ts = 0) {
  const canvas = elements.scopeCanvas;
  if (!canvas) return;

  if (typeof document !== 'undefined' && document.hidden) {
    requestAnimationFrame(drawScope);
    return;
  }

  const shouldRedraw = scopeNeedsRedraw || (state.connected && state.history.length >= 2 && (ts - lastScopeDrawTime >= 50));
  if (!shouldRedraw) {
    requestAnimationFrame(drawScope);
    return;
  }

  scopeNeedsRedraw = false;
  lastScopeDrawTime = ts;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(0, 215, 255, 0.08)';
  ctx.lineWidth = 1;

  const gridCols = 8;
  const gridRows = 5;
  for (let c = 1; c < gridCols; c++) {
    const x = (w / gridCols) * c;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let r = 1; r < gridRows; r++) {
    const y = (h / gridRows) * r;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  if (state.history.length < 2) {
    requestAnimationFrame(drawScope);
    return;
  }

  const now = Date.now();
  const startTime = now - (state.timebaseSeconds * 1000);
  const maxV = Math.max(10, Math.ceil(state.targetVoltage * 1.2));
  const maxA = Math.max(2, Math.ceil(state.targetCurrent * 1.2));

  // Voltage Trace (Cyan)
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 8;
  ctx.beginPath();

  state.history.forEach((pt, idx) => {
    const x = ((pt.time - startTime) / (state.timebaseSeconds * 1000)) * w;
    const y = h - ((pt.v / maxV) * (h - 20)) - 10;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Current Trace (Emerald Green)
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 8;
  ctx.beginPath();

  state.history.forEach((pt, idx) => {
    const x = ((pt.time - startTime) / (state.timebaseSeconds * 1000)) * w;
    const y = h - ((pt.a / maxA) * (h - 20)) - 10;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  requestAnimationFrame(drawScope);
}

function resizeCanvas() {
  const container = elements.scopeCanvas.parentElement;
  if (container) {
    elements.scopeCanvas.width = container.clientWidth;
    elements.scopeCanvas.height = container.clientHeight;
    scopeNeedsRedraw = true;
  }
}

// ==========================================================================
// i18n Refresh & Event Listeners
// ==========================================================================

function updateUpdaterUI() {
  if (!elements.btnCheckUpdate || !elements.btnCheckUpdateText) return;
  if (state.updating) return;
  if (state.updateInfo && state.updateInfo.available) {
    elements.btnCheckUpdate.classList.add('btn-update-available');
    elements.btnCheckUpdateText.textContent = t('updater.available', { version: state.updateInfo.latestVersion });
  } else {
    elements.btnCheckUpdate.classList.remove('btn-update-available');
    elements.btnCheckUpdateText.textContent = t('updater.check');
  }
}

async function handleUpdateButtonClick() {
  if (!ipsApi || state.updating) return;

  if (state.updateInfo && state.updateInfo.available && state.updateInfo.asset) {
    const ok = confirm(t('updater.confirm', { version: state.updateInfo.latestVersion }));
    if (!ok) return;
    state.updating = true;
    elements.btnCheckUpdateText.textContent = t('updater.downloading', { pct: 0 });
    try {
      await ipsApi.installUpdate();
    } catch (err) {
      state.updating = false;
      updateUpdaterUI();
      alert(t('updater.error', { message: err.message }));
    }
    return;
  }

  elements.btnCheckUpdateText.textContent = t('updater.checking');
  try {
    const info = await ipsApi.checkForUpdates();
    if (info && info.error) {
      alert(t('updater.error', { message: info.error }));
      updateUpdaterUI();
      return;
    }
    state.updateInfo = info;
    if (info && info.available) {
      updateUpdaterUI();
      handleUpdateButtonClick();
    } else {
      elements.btnCheckUpdateText.textContent = t('updater.up_to_date', { version: info ? info.currentVersion : '' });
      setTimeout(updateUpdaterUI, 3000);
    }
  } catch (err) {
    alert(t('updater.error', { message: err.message }));
    updateUpdaterUI();
  }
}

function refreshDynamicTexts() {
  updateConnectionUI(state.connected);
  syncUsbLedFromState();
  updateKeyLockUI();
  updateUpdaterUI();
  updateOutputState(state.outputOn);
  updateTelemetryDisplays();
  elements.btnRecordText.textContent = state.logging ? t('scope.rec_stop') : t('scope.rec_start');
  elements.logCounter.textContent = state.logData.length > 0
    ? t('scope.log_count', { count: state.logData.length })
    : t('scope.log_count_init');
}

function initLanguage() {
  document.documentElement.lang = translator.lang;
  if (elements.selLanguage) {
    elements.selLanguage.value = translator.lang;
    elements.selLanguage.addEventListener('change', (e) => {
      const lang = e.target.value;
      translator.setLang(lang);
      localStorage.setItem('language', translator.lang);
      document.documentElement.lang = translator.lang;
      I18nCore.applyTranslations(document, t);
      refreshDynamicTexts();
    });
  }
  I18nCore.applyTranslations(document, t);
}

function initEvents() {
  initLanguage();
  refreshDynamicTexts();

  window.addEventListener('resize', () => {
    resizeCanvas();
  });
  resizeCanvas();
  requestAnimationFrame(drawScope);

  // USB Status LED (auto-connects; click to rescan when disconnected)
  if (elements.usbStatusPill) {
    elements.usbStatusPill.addEventListener('click', () => {
      refreshPortList();
      if (!state.connected) {
        state.manualDisconnect = false;
        autoScanAndConnect();
      }
    });
  }

  // Native Serial & Updater Preload Bridge Listeners
  if (elements.btnCheckUpdate) {
    elements.btnCheckUpdate.addEventListener('click', handleUpdateButtonClick);
  }

  if (ipsApi) {
    ipsApi.onUpdaterAvailable((info) => {
      state.updateInfo = info;
      updateUpdaterUI();
    });

    ipsApi.onUpdaterProgress((pct) => {
      if (elements.btnCheckUpdateText) {
        elements.btnCheckUpdateText.textContent = t('updater.downloading', { pct });
      }
    });

    ipsApi.onSerialRx((bytes) => {
      handleIncomingBytes(new Uint8Array(bytes));
    });

    ipsApi.onSerialStatus((status) => {
      if (status.connected) {
        onSerialConnected(status.port);
      } else {
        state.connecting = false;
        const wasConnected = state.connected;
        state.connected = false;
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
        updateConnectionUI(false);
        if (status.error && !state.silentConnect) {
          alert(t('dialog.connect_error', { message: status.error }));
        }
        if (wasConnected) {
          state.protection = { code: 0, ovp: false, ocp: false, opp: false, otp: false, scp: false, lvp: false };
          state.deviceInfo = { model: 'IPS3608', firmware: '', serial: '' };
          updateTelemetryDisplays();
          refreshPortList();
        }
      }
    });
  }

  // Master Power
  elements.btnMasterPower.addEventListener('click', toggleMasterOutput);

  // Setpoint Sliders (throttled on drag, immediate on release/input)
  elements.sliderVoltage.addEventListener('input', (e) => setTargetVoltage(e.target.value, false));
  elements.sliderVoltage.addEventListener('change', (e) => setTargetVoltage(e.target.value, true));
  elements.inputTargetVoltage.addEventListener('change', (e) => setTargetVoltage(e.target.value, true));
  elements.sliderCurrent.addEventListener('input', (e) => setTargetCurrent(e.target.value, false));
  elements.sliderCurrent.addEventListener('change', (e) => setTargetCurrent(e.target.value, true));
  elements.inputTargetCurrent.addEventListener('change', (e) => setTargetCurrent(e.target.value, true));

  // Stepper Buttons
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      const step = parseFloat(btn.getAttribute('data-step'));
      if (type === 'v') setTargetVoltage(state.targetVoltage + step);
      if (type === 'a') setTargetCurrent(state.targetCurrent + step);
    });
  });

  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = parseFloat(btn.getAttribute('data-v'));
      const a = parseFloat(btn.getAttribute('data-a'));
      setTargetVoltage(v);
      setTargetCurrent(a);
    });
  });

  // Scope Timebase
  elements.timebaseSelect.addEventListener('change', (e) => {
    state.timebaseSeconds = parseInt(e.target.value, 10);
    scopeNeedsRedraw = true;
  });

  // Data Logger
  elements.btnToggleLog.addEventListener('click', () => {
    state.logging = !state.logging;
    if (state.logging) {
      elements.btnToggleLog.classList.add('btn-recording-active');
      elements.btnRecordText.textContent = t('scope.rec_stop');
      elements.btnExportCsv.disabled = false;
    } else {
      elements.btnToggleLog.classList.remove('btn-recording-active');
      elements.btnRecordText.textContent = t('scope.rec_start');
    }
  });

  elements.btnExportCsv.addEventListener('click', exportCsv);

  // Advanced Hardware Actions
  if (elements.btnKeyLock) {
    elements.btnKeyLock.addEventListener('click', toggleKeyLock);
  }
  if (elements.btnResetCapacity) {
    elements.btnResetCapacity.addEventListener('click', resetCapacityCounter);
  }
  if (elements.btnBootloader) {
    elements.btnBootloader.addEventListener('click', triggerBootloader);
  }

  // Protection Modal Actions
  if (elements.btnOpenProtectionModal) {
    elements.btnOpenProtectionModal.addEventListener('click', openProtectionModal);
  }
  if (elements.btnCloseProtectionModal) {
    elements.btnCloseProtectionModal.addEventListener('click', closeProtectionModal);
  }
  if (elements.btnRefreshProtectionLimits) {
    elements.btnRefreshProtectionLimits.addEventListener('click', refreshProtectionLimits);
  }
  if (elements.btnSaveProtectionLimits) {
    elements.btnSaveProtectionLimits.addEventListener('click', saveProtectionLimits);
  }
  if (elements.sliderBrightness) {
    const savedBrightness = localStorage.getItem('displayBrightness');
    if (savedBrightness !== null) {
      elements.sliderBrightness.value = savedBrightness;
      if (elements.dispBrightnessVal) elements.dispBrightnessVal.textContent = savedBrightness;
    }
    elements.sliderBrightness.addEventListener('input', (e) => {
      const level = parseInt(e.target.value, 10);
      if (elements.dispBrightnessVal) elements.dispBrightnessVal.textContent = level;
    });
    elements.sliderBrightness.addEventListener('change', (e) => {
      const level = parseInt(e.target.value, 10);
      localStorage.setItem('displayBrightness', String(level));
      if (elements.dispBrightnessVal) elements.dispBrightnessVal.textContent = level;
      if (state.connected) {
        ensurePcControlMode();
        sendFrame(IPS3608Protocol.setBrightness(level), true);
      }
    });
  }
  if (elements.modalProtectionSettings) {
    elements.modalProtectionSettings.addEventListener('click', (e) => {
      if (e.target === elements.modalProtectionSettings) {
        closeProtectionModal();
      }
    });
  }

  // Initial port scan & automatic connection, plus periodic background scan when disconnected
  if (hasWebSerial()) {
    navigator.serial.addEventListener('connect', () => {
      if (!state.connected && !state.connecting && !state.manualDisconnect) {
        autoScanAndConnect();
      }
    });
    navigator.serial.addEventListener('disconnect', (event) => {
      if (state.webSerialPort && event.target === state.webSerialPort) {
        disconnectSerial(true);
      }
    });
  }

  autoScanAndConnect();
  setInterval(() => {
    if (!state.connected && !state.connecting && !state.manualDisconnect) {
      autoScanAndConnect();
    }
  }, 2500);
}

function exportCsv() {
  if (state.logData.length === 0) return;
  const header = 'Timestamp,Voltage_V,Current_A,Power_W,Mode\n';
  const rows = state.logData.map(r => `${r.timestamp},${r.voltage},${r.current},${r.power},${r.mode}`).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IPS3608_Log_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Start
document.addEventListener('DOMContentLoaded', initEvents);
})();
