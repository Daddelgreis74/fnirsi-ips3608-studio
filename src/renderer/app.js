/**
 * FNIRSI IPS3608 Studio - Main Renderer Application
 */

const { ipcRenderer } = (typeof require !== 'undefined') ? require('electron') : { ipcRenderer: null };

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

  // Serial Port References
  port: null,
  reader: null,
  writer: null,
  keepReading: false,
  readBuffer: new Uint8Array(0),
  pnpPorts: [],

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
  }
};

// UI Element References
const elements = {
  selLanguage: document.getElementById('selLanguage'),

  // Device Info Chip
  deviceInfoChip: document.getElementById('deviceInfoChip'),
  chipModelText: document.getElementById('chipModelText'),
  chipFwText: document.getElementById('chipFwText'),
  chipSnText: document.getElementById('chipSnText'),
  btnOpenProtectionModal: document.getElementById('btnOpenProtectionModal'),
  btnBootloader: document.getElementById('btnBootloader'),

  btnConnect: document.getElementById('btnConnect'),
  btnConnectText: document.getElementById('btnConnectText'),
  comPortSelect: document.getElementById('comPortSelect'),
  btnRefreshPorts: document.getElementById('btnRefreshPorts'),

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
// Serial Communication & Auto-Detection Engine
// ==========================================================================

async function scanSystemComPorts() {
  if (!ipcRenderer) return [];
  try {
    const ports = await ipcRenderer.invoke('serial:scan-pnp-ports');
    state.pnpPorts = Array.isArray(ports) ? ports : [];
    return state.pnpPorts;
  } catch (err) {
    console.warn('PnP scan failed:', err);
    return [];
  }
}

async function refreshPortList() {
  if (!navigator.serial) return;
  try {
    const [webPorts, pnpPorts] = await Promise.all([
      navigator.serial.getPorts(),
      scanSystemComPorts()
    ]);

    const prevValue = elements.comPortSelect.value;
    elements.comPortSelect.innerHTML = '';

    const optAuto = document.createElement('option');
    optAuto.value = 'auto';
    optAuto.textContent = pnpPorts.length > 0
      ? `⚡ ${t('header.port_auto')} (${pnpPorts[0].comPort})`
      : t('header.port_placeholder');
    elements.comPortSelect.appendChild(optAuto);

    // Show detected PnP COM ports with descriptive names
    pnpPorts.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = `pnp:${p.comPort}`;
      const vidTag = p.vid ? ` [VID:${p.vid.toUpperCase()}]` : '';
      opt.textContent = `${p.comPort} – ${p.name}${vidTag}`;
      elements.comPortSelect.appendChild(opt);
    });

    // Also include already-granted Web Serial ports if no PnP entries exist
    if (pnpPorts.length === 0) {
      webPorts.forEach((p, idx) => {
        const info = p.getInfo();
        const usbVendor = info.usbVendorId ? `(VID: 0x${info.usbVendorId.toString(16)})` : '';
        const opt = document.createElement('option');
        opt.value = `web:${idx}`;
        opt.textContent = `${t('header.port_device', { idx: idx + 1 })} ${usbVendor}`;
        elements.comPortSelect.appendChild(opt);
      });
    }

    const optRequest = document.createElement('option');
    optRequest.value = 'request';
    optRequest.textContent = t('header.port_add');
    elements.comPortSelect.appendChild(optRequest);

    if (prevValue && Array.from(elements.comPortSelect.options).some(o => o.value === prevValue)) {
      elements.comPortSelect.value = prevValue;
    } else {
      elements.comPortSelect.value = 'auto';
    }
  } catch (err) {
    console.error('Error fetching ports:', err);
  }
}

async function autoScanAndConnect() {
  if (state.connected || state.connecting || state.manualDisconnect) return;
  if (!navigator.serial) return;

  try {
    const pnpPorts = await scanSystemComPorts();
    const webPorts = await navigator.serial.getPorts();

    // Prioritize USB serial ports detected by Windows PnP, or previously granted Web Serial ports
    const usbPort = pnpPorts.find(p => p.isKnownUsb || p.isUsb);
    if (usbPort) {
      await refreshPortList();
      if (ipcRenderer) {
        await ipcRenderer.invoke('serial:set-preferred-port', usbPort.comPort);
      }
      state.detectedPortName = usbPort.comPort;
      await connectSerial(true);
    } else if (webPorts.length > 0) {
      await refreshPortList();
      await connectSerial(true);
    }
  } catch (err) {
    console.debug('Auto-scan pass:', err.message);
  }
}

async function connectSerial(silent = false) {
  if (state.connected) {
    state.manualDisconnect = true;
    await disconnectSerial();
    return;
  }

  if (state.connecting) return;
  state.connecting = true;
  state.manualDisconnect = false;

  try {
    let port = null;
    const selectedVal = elements.comPortSelect.value;
    const availablePorts = await navigator.serial.getPorts();

    if (selectedVal.startsWith('pnp:') && ipcRenderer) {
      const comName = selectedVal.slice(4);
      state.detectedPortName = comName;
      await ipcRenderer.invoke('serial:set-preferred-port', comName);
      port = await navigator.serial.requestPort();
    } else if (selectedVal === 'request') {
      if (ipcRenderer) await ipcRenderer.invoke('serial:set-preferred-port', null);
      port = await navigator.serial.requestPort();
    } else if (selectedVal.startsWith('web:')) {
      const idx = parseInt(selectedVal.slice(4), 10);
      port = availablePorts[idx] || await navigator.serial.requestPort();
    } else {
      // Auto mode: prefer matching PnP USB port if detected, else first available Web Serial port
      if (state.pnpPorts.length > 0 && ipcRenderer) {
        const best = state.pnpPorts.find(p => p.isKnownUsb || p.isUsb) || state.pnpPorts[0];
        state.detectedPortName = best.comPort;
        await ipcRenderer.invoke('serial:set-preferred-port', best.comPort);
        port = await navigator.serial.requestPort();
      } else if (availablePorts.length > 0) {
        port = availablePorts[0];
      } else if (!silent) {
        port = await navigator.serial.requestPort();
      }
    }

    if (!port) {
      state.connecting = false;
      return;
    }

    await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
    state.port = port;
    state.writer = port.writable.getWriter();
    state.connected = true;
    state.keepReading = true;

    updateConnectionUI(true);

    // Send connect handshake
    await sendFrame(IPS3608Protocol.connectPacket());
    await new Promise(r => setTimeout(r, 60));

    // Device initialization sync (CMD_13) required before querying Model, Firmware and Serial
    await sendFrame(IPS3608Protocol.initHandshake());
    await new Promise(r => setTimeout(r, 60));

    // Query hardware metadata (Model, Firmware version, Serial Number)
    await sendFrame(IPS3608Protocol.queryModel());
    await new Promise(r => setTimeout(r, 60));
    await sendFrame(IPS3608Protocol.queryFirmware());
    await new Promise(r => setTimeout(r, 60));
    await sendFrame(IPS3608Protocol.querySerial());
    await new Promise(r => setTimeout(r, 60));

    // Ensure capacity accumulator is active on device
    await sendFrame(IPS3608Protocol.startCapacity());

    // Start reading loop
    readLoop();

    // Start polling loop
    startPolling();
  } catch (err) {
    console.error('Serial connection failed:', err);
    if (!silent) {
      alert(t('dialog.connect_error', { message: err.message }));
    }
    updateConnectionUI(false);
  } finally {
    state.connecting = false;
  }
}

async function disconnectSerial() {
  state.keepReading = false;
  state.connected = false;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  try {
    if (state.reader) {
      await state.reader.cancel();
      state.reader.releaseLock();
      state.reader = null;
    }
    if (state.writer) {
      await state.writer.close();
      state.writer.releaseLock();
      state.writer = null;
    }
    if (state.port) {
      await state.port.close();
      state.port = null;
    }
  } catch (e) {
    console.warn('Error during disconnect:', e);
  }

  updateConnectionUI(false);
  state.protection = { code: 0, ovp: false, ocp: false, opp: false, otp: false, scp: false, lvp: false };
  state.deviceInfo = { model: 'IPS3608', firmware: '', serial: '' };
  updateTelemetryDisplays();
}

async function readLoop() {
  while (state.port && state.port.readable && state.keepReading) {
    try {
      state.reader = state.port.readable.getReader();
      while (true) {
        const { value, done } = await state.reader.read();
        if (done) break;
        if (value) {
          handleIncomingBytes(value);
        }
      }
    } catch (err) {
      console.warn('Read error / disconnect detected:', err);
      break;
    } finally {
      if (state.reader) {
        state.reader.releaseLock();
        state.reader = null;
      }
    }
  }

  if (state.connected) {
    disconnectSerial();
  }
}

function handleIncomingBytes(chunk) {
  const combined = new Uint8Array(state.readBuffer.length + chunk.length);
  combined.set(state.readBuffer);
  combined.set(chunk, state.readBuffer.length);
  state.readBuffer = combined;

  const { frames, remainingBuffer } = IPS3608Protocol.parseStream(state.readBuffer);
  state.readBuffer = remainingBuffer;

  for (const frame of frames) {
    const data = IPS3608Protocol.decodeTelemetry(frame);
    applyTelemetry(data);
  }
}

async function sendFrame(frameBytes) {
  if (state.writer) {
    try {
      await state.writer.write(frameBytes);
    } catch (err) {
      console.error('Send frame failed:', err);
    }
  }
}

let pollTimer = null;
let pollTick = 0;
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTick = 0;
  pollTimer = setInterval(() => {
    if (state.connected) {
      pollTick++;
      // Poll fast telemetry (10 Hz) interleaved with full status queries (5 Hz)
      if (pollTick % 2 === 0) {
        sendFrame(IPS3608Protocol.queryAll());
      } else {
        sendFrame(IPS3608Protocol.queryLiveValues());
      }

      // Re-query device info in first 10 seconds if not yet received
      if (!state.deviceInfo.firmware && pollTick <= 100 && pollTick % 25 === 12) {
        sendFrame(IPS3608Protocol.initHandshake());
        setTimeout(() => sendFrame(IPS3608Protocol.queryModel()), 40);
        setTimeout(() => sendFrame(IPS3608Protocol.queryFirmware()), 80);
        setTimeout(() => sendFrame(IPS3608Protocol.querySerial()), 120);
      }
    }
  }, 100); // 10 Hz refresh
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

  // Device Info
  if (data.model !== undefined && data.model.length > 0) state.deviceInfo.model = data.model;
  if (data.firmware !== undefined && data.firmware.length > 0) state.deviceInfo.firmware = data.firmware;
  if (data.serial !== undefined && data.serial.length > 0) state.deviceInfo.serial = data.serial;

  // Hardware Protection Limits
  if (data.ovpLimit !== undefined && data.ovpLimit > 0) state.protectionLimits.ovp = data.ovpLimit;
  if (data.ocpLimit !== undefined && data.ocpLimit > 0) state.protectionLimits.ocp = data.ocpLimit;
  if (data.oppLimit !== undefined && data.oppLimit > 0) state.protectionLimits.opp = data.oppLimit;
  if (data.otpLimit !== undefined && data.otpLimit > 0) state.protectionLimits.otp = data.otpLimit;
  if (data.lvpLimit !== undefined) state.protectionLimits.lvp = data.lvpLimit;

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
    elements.btnConnect.classList.replace('btn-connect', 'btn-disconnect');
    const portTag = state.detectedPortName ? ` (${state.detectedPortName})` : '';
    elements.btnConnectText.textContent = t('header.disconnect') + portTag;
  } else {
    elements.btnConnect.classList.replace('btn-disconnect', 'btn-connect');
    elements.btnConnectText.textContent = t('header.connect');
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

function setTargetVoltage(v) {
  const val = Math.max(0, Math.min(36.0, parseFloat(v) || 0));
  state.targetVoltage = val;
  elements.inputTargetVoltage.value = val.toFixed(2);
  elements.sliderVoltage.value = val;

  if (state.connected) {
    sendFrame(IPS3608Protocol.setVoltage(val));
  }
}

function setTargetCurrent(a) {
  const val = Math.max(0, Math.min(8.2, parseFloat(a) || 0));
  state.targetCurrent = val;
  elements.inputTargetCurrent.value = val.toFixed(2);
  elements.sliderCurrent.value = val;

  if (state.connected) {
    sendFrame(IPS3608Protocol.setCurrent(val));
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
    sendFrame(IPS3608Protocol.setOutput(newState));
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
    await sendFrame(IPS3608Protocol.resetCapacity());
    setTimeout(async () => {
      await sendFrame(IPS3608Protocol.startCapacity());
    }, 150);
  }
}

async function triggerBootloader() {
  const confirmed = confirm(t('dialog.bootloader_confirm'));
  if (!confirmed) return;

  if (state.connected) {
    await sendFrame(IPS3608Protocol.enterBootloader());
    setTimeout(() => {
      disconnectSerial();
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
    sendFrame(IPS3608Protocol.queryAll());
  }
}

function closeProtectionModal() {
  elements.modalProtectionSettings.classList.add('hidden');
}

async function refreshProtectionLimits() {
  if (state.connected) {
    await sendFrame(IPS3608Protocol.queryAll());
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
    await sendFrame(IPS3608Protocol.setOvpLimit(ovp));
    await new Promise(r => setTimeout(r, 40));
    await sendFrame(IPS3608Protocol.setOcpLimit(ocp));
    await new Promise(r => setTimeout(r, 40));
    await sendFrame(IPS3608Protocol.setOppLimit(opp));
    await new Promise(r => setTimeout(r, 40));
    await sendFrame(IPS3608Protocol.setOtpLimit(otp));
    await new Promise(r => setTimeout(r, 40));
    await sendFrame(IPS3608Protocol.setLvpLimit(lvp));
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
// 60 FPS Canvas Oscilloscope Waveform Renderer
// ==========================================================================

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

function drawScope() {
  const canvas = elements.scopeCanvas;
  if (!canvas) return;
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
  }
}

// ==========================================================================
// i18n Refresh & Event Listeners
// ==========================================================================

function refreshDynamicTexts() {
  updateConnectionUI(state.connected);
  updateOutputState(state.outputOn);
  updateTelemetryDisplays();
  elements.btnRecordText.textContent = state.logging ? t('scope.rec_stop') : t('scope.rec_start');
  elements.logCounter.textContent = state.logData.length > 0
    ? t('scope.log_count', { count: state.logData.length })
    : t('scope.log_count_init');
  refreshPortList();
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

  // Connection
  elements.btnConnect.addEventListener('click', () => connectSerial(false));
  elements.btnRefreshPorts.addEventListener('click', () => {
    refreshPortList();
    if (!state.connected) {
      state.manualDisconnect = false;
      autoScanAndConnect();
    }
  });

  // Web Serial Hotplug Events (Plug & Play)
  if (navigator.serial) {
    navigator.serial.addEventListener('connect', () => {
      state.manualDisconnect = false;
      setTimeout(autoScanAndConnect, 350);
    });
    navigator.serial.addEventListener('disconnect', () => {
      if (state.connected) {
        disconnectSerial();
      }
      refreshPortList();
    });
  }

  // Master Power
  elements.btnMasterPower.addEventListener('click', toggleMasterOutput);

  // Setpoint Sliders
  elements.sliderVoltage.addEventListener('input', (e) => setTargetVoltage(e.target.value));
  elements.inputTargetVoltage.addEventListener('change', (e) => setTargetVoltage(e.target.value));
  elements.sliderCurrent.addEventListener('input', (e) => setTargetCurrent(e.target.value));
  elements.inputTargetCurrent.addEventListener('change', (e) => setTargetCurrent(e.target.value));

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
  if (elements.modalProtectionSettings) {
    elements.modalProtectionSettings.addEventListener('click', (e) => {
      if (e.target === elements.modalProtectionSettings) {
        closeProtectionModal();
      }
    });
  }

  // Initial port scan & automatic connection, plus periodic background scan when disconnected
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
