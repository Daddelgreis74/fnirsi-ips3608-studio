/**
 * FNIRSI IPS3608 Studio - Main Renderer Application
 */

// Application State
const state = {
  connected: false,
  simMode: false,
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
    scp: false
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
  simModeCheckbox: document.getElementById('simModeCheckbox'),
  
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
// Serial Communication Engine (Web Serial API)
// ==========================================================================

async function refreshPortList() {
  if (!navigator.serial) return;
  try {
    const ports = await navigator.serial.getPorts();
    elements.comPortSelect.innerHTML = '<option value="">COM-Port auswählen...</option>';
    
    ports.forEach((p, idx) => {
      const info = p.getInfo();
      const usbVendor = info.usbVendorId ? `(VID: 0x${info.usbVendorId.toString(16)})` : '';
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `Gerät #${idx + 1} ${usbVendor}`;
      elements.comPortSelect.appendChild(opt);
    });

    const optRequest = document.createElement('option');
    optRequest.value = 'request';
    optRequest.textContent = '➕ Neuen COM-Port hinzufügen...';
    elements.comPortSelect.appendChild(optRequest);
  } catch (err) {
    console.error('Error fetching ports:', err);
  }
}

async function connectSerial() {
  if (state.connected) {
    await disconnectSerial();
    return;
  }

  if (state.simMode) {
    startSimulation();
    return;
  }

  try {
    let port = null;
    const selectedVal = elements.comPortSelect.value;
    const availablePorts = await navigator.serial.getPorts();

    if (selectedVal === 'request' || availablePorts.length === 0) {
      port = await navigator.serial.requestPort();
    } else if (availablePorts[selectedVal]) {
      port = availablePorts[selectedVal];
    } else {
      port = await navigator.serial.requestPort();
    }

    await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
    state.port = port;
    state.writer = port.writable.getWriter();
    state.connected = true;
    state.keepReading = true;

    updateConnectionUI(true);

    // Send handshake
    await sendFrame(IPS3608Protocol.connectPacket());

    // Query hardware metadata (Model, Firmware version, Serial Number)
    await sendFrame(IPS3608Protocol.queryModel());
    await sendFrame(IPS3608Protocol.queryFirmware());
    await sendFrame(IPS3608Protocol.querySerial());

    // Ensure capacity accumulator is active on device
    await sendFrame(IPS3608Protocol.startCapacity());

    // Start reading loop
    readLoop();

    // Start polling loop
    startPolling();
  } catch (err) {
    console.error('Serial connection failed:', err);
    alert('Verbindungsfehler: ' + err.message);
    updateConnectionUI(false);
  }
}

async function disconnectSerial() {
  state.keepReading = false;
  state.connected = false;

  if (state.simTimer) {
    clearInterval(state.simTimer);
    state.simTimer = null;
  }

  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
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
  // Append to readBuffer
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
    if (state.connected && !state.simMode) {
      pollTick++;
      // Poll fast telemetry (10 Hz) interleaved with full status queries (5 Hz)
      if (pollTick % 2 === 0) {
        // Full device state (0xFF) delivers DC metrics, Ah/Wh, output state, mode and protection status (SCP/OVP/OCP/OPP/OTP)
        sendFrame(IPS3608Protocol.queryAll());
      } else {
        // Fast 12-byte live values (0xC3) for high-responsiveness graphs
        sendFrame(IPS3608Protocol.queryLiveValues());
      }
    }
  }, 100); // 10 Hz refresh
}

// ==========================================================================
// Simulation / Demo Mode
// ==========================================================================

function startSimulation() {
  state.connected = true;
  state.deviceInfo = {
    model: 'IPS3608',
    firmware: 'V1.9_DEMO',
    serial: 'SN-DEMO-260429'
  };
  updateConnectionUI(true, 'Demo-Modus aktiv');

  if (state.simTimer) clearInterval(state.simTimer);
  let step = 0;

  state.simTimer = setInterval(() => {
    step += 0.05;
    if (state.outputOn) {
      // Simulate realistic voltage and load ripple
      const rippleV = (Math.sin(step * 3) * 0.008) + ((Math.random() - 0.5) * 0.003);
      state.actualVoltage = Math.max(0, state.targetVoltage + rippleV);

      const baseCurrent = Math.min(state.targetCurrent, (state.targetVoltage / 10.0));
      const rippleA = (Math.cos(step * 2) * 0.015) + ((Math.random() - 0.5) * 0.004);
      state.actualCurrent = Math.max(0, baseCurrent + rippleA);
      state.actualPower = state.actualVoltage * state.actualCurrent;

      // Accumulate capacity
      state.capacityAh += (state.actualCurrent * (0.05 / 3600));
      state.energyWh += (state.actualPower * (0.05 / 3600));
      state.mode = state.actualCurrent >= state.targetCurrent ? 'CC' : 'CV';
    } else {
      state.actualVoltage = 0.00;
      state.actualCurrent = 0.00;
      state.actualPower = 0.00;
      state.mode = 'CV';
    }

    updateTelemetryDisplays();
    recordHistoryPoint();
  }, 50); // 20 Hz
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
  elements.modeBadge.textContent = state.mode + ' MODUS';
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
  }

  // Device Info Chip
  if (elements.chipModelText && state.deviceInfo.model) {
    elements.chipModelText.textContent = state.deviceInfo.model;
  }
  if (elements.chipFwText) {
    elements.chipFwText.textContent = state.deviceInfo.firmware ? (`FW: ${state.deviceInfo.firmware}`) : 'FW: --';
  }
  if (elements.chipSnText) {
    elements.chipSnText.textContent = state.deviceInfo.serial ? (`SN: ${state.deviceInfo.serial}`) : 'SN: --';
  }

  // Protection Pills (OVP, OCP, OPP, OTP, LVP / SCP)
  const prot = state.protection || {};
  if (elements.flagOvp) elements.flagOvp.classList.toggle('flag-alert', !!prot.ovp);
  if (elements.flagOcp) elements.flagOcp.classList.toggle('flag-alert', !!prot.ocp);
  if (elements.flagOpp) elements.flagOpp.classList.toggle('flag-alert', !!prot.opp);
  if (elements.flagOtp) elements.flagOtp.classList.toggle('flag-alert', !!prot.otp);
  if (elements.flagScp) elements.flagScp.classList.toggle('flag-alert', !!(prot.scp || prot.lvp));
}

function updateConnectionUI(connected, labelOverride) {
  state.connected = connected;
  if (connected) {
    elements.btnConnect.classList.replace('btn-connect', 'btn-disconnect');
    elements.btnConnectText.textContent = labelOverride || 'Trennen';
  } else {
    elements.btnConnect.classList.replace('btn-disconnect', 'btn-connect');
    elements.btnConnectText.textContent = 'Verbinden';
  }
}

function updateOutputState(on) {
  state.outputOn = on;
  if (on) {
    if (!state.startTime) state.startTime = Date.now();
    elements.outputPill.className = 'output-status-pill status-on';
    elements.outputPillText.textContent = 'AUSGANG AKTIV (ON)';
    elements.btnMasterPower.className = 'master-power-btn btn-power-on';
    elements.btnMasterPowerLabel.textContent = 'AUSGANG ABSCHALTEN';
  } else {
    state.startTime = null;
    elements.outputPill.className = 'output-status-pill status-off';
    elements.outputPillText.textContent = 'AUSGANG AUS (STANDBY)';
    elements.btnMasterPower.className = 'master-power-btn btn-power-off';
    elements.btnMasterPowerLabel.textContent = 'AUSGANG EINSCHALTEN';
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

  if (state.connected && !state.simMode) {
    sendFrame(IPS3608Protocol.setVoltage(val));
  }
}

function setTargetCurrent(a) {
  const val = Math.max(0, Math.min(8.2, parseFloat(a) || 0));
  state.targetCurrent = val;
  elements.inputTargetCurrent.value = val.toFixed(2);
  elements.sliderCurrent.value = val;

  if (state.connected && !state.simMode) {
    sendFrame(IPS3608Protocol.setCurrent(val));
  }
}

function toggleMasterOutput() {
  const newState = !state.outputOn;
  updateOutputState(newState);

  if (newState) {
    // Clear protection alert states when user turns output back on
    state.protection = { code: 0, ovp: false, ocp: false, opp: false, otp: false, scp: false };
    updateTelemetryDisplays();
  }

  if (state.connected && !state.simMode) {
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

  if (state.connected && !state.simMode) {
    // CMD_11: F1 B1 D8 01 00 D9 (Zero capacity accumulator)
    await sendFrame(IPS3608Protocol.resetCapacity());
    setTimeout(async () => {
      // Re-enable accumulator (CMD_10)
      await sendFrame(IPS3608Protocol.startCapacity());
    }, 150);
  }
}

async function triggerBootloader() {
  const confirmed = confirm(
    'Möchten Sie das Netzteil wirklich in den Firmware-Bootloader-Modus (IAP) versetzen?\n\n' +
    'Das Gerät startet im IAP-Modus neu, um Firmware über das FNIRSI-Tool oder USB zu flashen.\n' +
    'Die serielle Verbindung wird dabei getrennt.'
  );
  if (!confirmed) return;

  if (state.connected && !state.simMode) {
    await sendFrame(IPS3608Protocol.enterBootloader());
    setTimeout(() => {
      disconnectSerial();
    }, 300);
  } else if (state.simMode) {
    alert('Simulation: Bootloader-Befehl (CMD_15: F1 C0 00 01 01 02) gesendet.');
    disconnectSerial();
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

  if (state.connected && !state.simMode) {
    sendFrame(IPS3608Protocol.queryAll());
  }
}

function closeProtectionModal() {
  elements.modalProtectionSettings.classList.add('hidden');
}

async function refreshProtectionLimits() {
  if (state.connected && !state.simMode) {
    await sendFrame(IPS3608Protocol.queryAll());
  }
  updateProtectionModalInputs();
  if (elements.protectionSaveFeedback) {
    elements.protectionSaveFeedback.className = 'save-feedback success';
    elements.protectionSaveFeedback.textContent = '✓ Schwellenwerte aus dem Gerät aktualisiert!';
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

  if (state.connected && !state.simMode) {
    // Send frames with small pause to ensure device EEPROM write cycle
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
    elements.protectionSaveFeedback.textContent = '✓ Schutzgrenzen erfolgreich im Gerät gespeichert!';
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

  // Prune history older than timebaseSeconds
  const cutoff = now - (state.timebaseSeconds * 1000);
  while (state.history.length > 0 && state.history[0].time < cutoff) {
    state.history.shift();
  }

  // Data Logger
  if (state.logging) {
    state.logData.push({
      timestamp: new Date().toISOString(),
      voltage: state.actualVoltage.toFixed(3),
      current: state.actualCurrent.toFixed(4),
      power: state.actualPower.toFixed(2),
      mode: state.mode
    });
    elements.logCounter.textContent = `${state.logData.length} Messpunkte`;
  }
}

function drawScope() {
  const canvas = elements.scopeCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Clear
  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, w, h);

  // Draw Grid Lines
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
  const maxV = Math.max(10, Math.ceil(state.targetVoltage * 1.2)); // Dynamic scaling
  const maxA = Math.max(2, Math.ceil(state.targetCurrent * 1.2));

  // 1. Draw Voltage Trace (Cyan)
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

  // 2. Draw Current Trace (Emerald Green)
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
// Event Listeners & Initialization
// ==========================================================================

function initEvents() {
  window.addEventListener('resize', () => {
    resizeCanvas();
  });
  resizeCanvas();
  requestAnimationFrame(drawScope);

  // Connection
  elements.btnConnect.addEventListener('click', connectSerial);
  elements.btnRefreshPorts.addEventListener('click', refreshPortList);
  elements.simModeCheckbox.addEventListener('change', (e) => {
    state.simMode = e.target.checked;
    if (!state.simMode && state.connected && state.simTimer) {
      disconnectSerial();
    }
  });

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
      elements.btnRecordText.textContent = 'Aufnahme stoppen';
      elements.btnExportCsv.disabled = false;
    } else {
      elements.btnToggleLog.classList.remove('btn-recording-active');
      elements.btnRecordText.textContent = 'Aufnahme starten';
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

  // Interactive Protection Flags (Demo/Simulation mode: click to toggle any protection alert)
  [
    { el: elements.flagOvp, key: 'ovp', code: 1 },
    { el: elements.flagOcp, key: 'ocp', code: 2 },
    { el: elements.flagOpp, key: 'opp', code: 3 },
    { el: elements.flagOtp, key: 'otp', code: 4 },
    { el: elements.flagScp, key: 'scp', code: 5 }
  ].forEach(({ el, key, code }) => {
    if (el) {
      el.style.cursor = 'pointer';
      el.title = 'Im Demo-Modus anklickbar für Simulation';
      el.addEventListener('click', () => {
        if (state.simMode) {
          const active = !state.protection[key];
          state.protection[key] = active;
          if (key === 'scp') state.protection.lvp = active;
          state.protection.code = active ? code : 0;
          if (active) {
            updateOutputState(false);
            if (key === 'scp') {
              state.actualVoltage = 0.00;
              state.actualCurrent = 0.00;
              state.actualPower = 0.00;
            }
          }
          updateTelemetryDisplays();
        }
      });
    }
  });

  // Initial port refresh
  refreshPortList();
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
