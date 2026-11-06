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
  timebaseSeconds: 30
};

// UI Element References
const elements = {
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

  // Protection Indicators (Pills)
  flagOvp: document.getElementById('flagOvp'),
  flagOcp: document.getElementById('flagOcp'),
  flagOpp: document.getElementById('flagOpp'),
  flagOtp: document.getElementById('flagOtp'),
  flagScp: document.getElementById('flagScp'),
  
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
  state.protection = { code: 0, ovp: false, ocp: false, opp: false, otp: false, scp: false };
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
      // Poll fast telemetry (10 Hz) with interleaved status/protection queries
      if (pollTick % 4 === 0) {
        // Full device state (0xFF) delivers protection flags, mode and output state
        sendFrame(IPS3608Protocol.queryAll());
      } else if (pollTick % 4 === 2) {
        // Dedicated protection register query (0xDC)
        sendFrame(IPS3608Protocol.queryProtection());
      } else {
        // Fast 12-byte live values (0xC3)
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
  if (data.capacityAh !== undefined && data.capacityAh > 0) state.capacityAh = data.capacityAh;
  if (data.energyWh !== undefined && data.energyWh > 0) state.energyWh = data.energyWh;
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

  // Protection Pills (OVP, OCP, OPP, OTP, KURZSCHLUSS)
  const prot = state.protection || {};
  if (elements.flagOvp) elements.flagOvp.classList.toggle('flag-alert', !!prot.ovp);
  if (elements.flagOcp) elements.flagOcp.classList.toggle('flag-alert', !!prot.ocp);
  if (elements.flagOpp) elements.flagOpp.classList.toggle('flag-alert', !!prot.opp);
  if (elements.flagOtp) elements.flagOtp.classList.toggle('flag-alert', !!prot.otp);
  if (elements.flagScp) elements.flagScp.classList.toggle('flag-alert', !!prot.scp);
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
  window.addEventListener('resize', resizeCanvas);
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
          state.protection.code = active ? code : 0;
          if (active) {
            updateOutputState(false);
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
