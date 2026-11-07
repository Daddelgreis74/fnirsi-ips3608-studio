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

  // View & Display Management
  activeView: 'dc', // 'dc', 'usb', 'split'
  autoSwitchEnabled: true,
  lastAutoSwitchTime: 0,

  // Front-USB Fast-Charging Ports State
  usb: {
    usbc: {
      v: 5.000,
      a: 0.0000,
      w: 0.00,
      mah: 0,
      wh: 0,
      protocol: 'PD 3.0 (PPS)',
      active: false,
      startTime: null
    },
    usba: {
      v: 5.000,
      a: 0.0000,
      w: 0.00,
      mah: 0,
      wh: 0,
      protocol: 'QC 3.0 / FCP',
      active: false,
      startTime: null
    },
    peakPower: 0.00,
    history: [],
    timebaseSeconds: 30
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
  btnExportCsv: document.getElementById('btnExportCsv'),

  // View Navigation & Display Controls
  tabDcPower: document.getElementById('tabDcPower'),
  tabUsbMonitor: document.getElementById('tabUsbMonitor'),
  tabSplitView: document.getElementById('tabSplitView'),
  usbActivityBadge: document.getElementById('usbActivityBadge'),
  autoSwitchCheckbox: document.getElementById('autoSwitchCheckbox'),
  autoSwitchNotification: document.getElementById('autoSwitchNotification'),
  autoSwitchNotifyText: document.getElementById('autoSwitchNotifyText'),
  mainStudioGrid: document.getElementById('mainStudioGrid'),

  // DC & USB Panels
  dcPanels: document.querySelectorAll('.dc-panel'),
  panelUsbC: document.getElementById('panelUsbC'),
  panelUsbA: document.getElementById('panelUsbA'),
  panelUsbScope: document.getElementById('panelUsbScope'),

  // USB-C Elements
  badgeUsbCProtocol: document.getElementById('badgeUsbCProtocol'),
  badgeUsbCStatus: document.getElementById('badgeUsbCStatus'),
  dispUsbCVoltage: document.getElementById('dispUsbCVoltage'),
  dispUsbCCurrent: document.getElementById('dispUsbCCurrent'),
  dispUsbCPower: document.getElementById('dispUsbCPower'),
  barUsbCVoltage: document.getElementById('barUsbCVoltage'),
  barUsbCCurrent: document.getElementById('barUsbCCurrent'),
  barUsbCPower: document.getElementById('barUsbCPower'),
  dispUsbCMah: document.getElementById('dispUsbCMah'),
  dispUsbCWh: document.getElementById('dispUsbCWh'),
  dispUsbCUptime: document.getElementById('dispUsbCUptime'),
  chipUsbC9V: document.getElementById('chipUsbC9V'),
  chipUsbC20V: document.getElementById('chipUsbC20V'),
  btnSimUsbCPhone: document.getElementById('btnSimUsbCPhone'),
  btnSimUsbCLaptop: document.getElementById('btnSimUsbCLaptop'),
  btnSimUsbCDisconnect: document.getElementById('btnSimUsbCDisconnect'),

  // USB-A Elements
  badgeUsbAProtocol: document.getElementById('badgeUsbAProtocol'),
  badgeUsbAStatus: document.getElementById('badgeUsbAStatus'),
  dispUsbAVoltage: document.getElementById('dispUsbAVoltage'),
  dispUsbACurrent: document.getElementById('dispUsbACurrent'),
  dispUsbAPower: document.getElementById('dispUsbAPower'),
  barUsbAVoltage: document.getElementById('barUsbAVoltage'),
  barUsbACurrent: document.getElementById('barUsbACurrent'),
  barUsbAPower: document.getElementById('barUsbAPower'),
  dispUsbAMah: document.getElementById('dispUsbAMah'),
  dispUsbAWh: document.getElementById('dispUsbAWh'),
  dispUsbAUptime: document.getElementById('dispUsbAUptime'),
  btnSimUsbAPhone: document.getElementById('btnSimUsbAPhone'),
  btnSimUsbAFast: document.getElementById('btnSimUsbAFast'),
  btnSimUsbADisconnect: document.getElementById('btnSimUsbADisconnect'),

  // USB Scope Elements
  usbScopeCanvas: document.getElementById('usbScopeCanvas'),
  usbTimebaseSelect: document.getElementById('usbTimebaseSelect'),
  dispUsbTotalPower: document.getElementById('dispUsbTotalPower'),
  dispUsbPeakPower: document.getElementById('dispUsbPeakPower'),
  btnExportUsbCsv: document.getElementById('btnExportUsbCsv')
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

    // Simulate USB-C charging activity if active
    if (state.usb.usbc.active) {
      if (!state.usb.usbc.startTime) state.usb.usbc.startTime = Date.now();
      const targetA = state.usb.usbc.targetA || 2.18;
      const ripple = (Math.sin(step * 4) * 0.02) + ((Math.random() - 0.5) * 0.01);
      const curA = Math.max(0.1, targetA + ripple);
      state.usb.usbc.a = curA;
      state.usb.usbc.w = state.usb.usbc.v * curA;
      state.usb.usbc.mah += (curA * 1000) * (0.05 / 3600);
      state.usb.usbc.wh += state.usb.usbc.w * (0.05 / 3600);
    } else {
      state.usb.usbc.a = 0.0;
      state.usb.usbc.w = 0.0;
      state.usb.usbc.startTime = null;
    }

    // Simulate USB-A charging activity if active
    if (state.usb.usba.active) {
      if (!state.usb.usba.startTime) state.usb.usba.startTime = Date.now();
      const targetA = state.usb.usba.targetA || 1.45;
      const ripple = (Math.sin(step * 3) * 0.015) + ((Math.random() - 0.5) * 0.008);
      const curA = Math.max(0.1, targetA + ripple);
      state.usb.usba.a = curA;
      state.usb.usba.w = state.usb.usba.v * curA;
      state.usb.usba.mah += (curA * 1000) * (0.05 / 3600);
      state.usb.usba.wh += state.usb.usba.w * (0.05 / 3600);
    } else {
      state.usb.usba.a = 0.0;
      state.usb.usba.w = 0.0;
      state.usb.usba.startTime = null;
    }

    updateTelemetryDisplays();
    updateUsbDisplays();
    recordHistoryPoint();
    recordUsbHistoryPoint();
    evaluateAutoDisplaySwitch();
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

  // Handle USB Telemetry if reported by device
  if (data.usb) {
    if (data.usb.usbc) {
      Object.assign(state.usb.usbc, data.usb.usbc);
    }
    if (data.usb.usba) {
      Object.assign(state.usb.usba, data.usb.usba);
    }
  }

  updateTelemetryDisplays();
  updateUsbDisplays();
  recordHistoryPoint();
  recordUsbHistoryPoint();
  evaluateAutoDisplaySwitch();
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

function updateUsbDisplays() {
  const usbc = state.usb.usbc;
  const usba = state.usb.usba;

  // 1. USB-C Displays
  if (elements.dispUsbCVoltage) elements.dispUsbCVoltage.textContent = usbc.v.toFixed(3);
  if (elements.dispUsbCCurrent) elements.dispUsbCCurrent.textContent = usbc.a.toFixed(4);
  if (elements.dispUsbCPower) elements.dispUsbCPower.textContent = usbc.w.toFixed(2);

  if (elements.barUsbCVoltage) elements.barUsbCVoltage.style.width = Math.min(100, (usbc.v / 20.0) * 100) + '%';
  if (elements.barUsbCCurrent) elements.barUsbCCurrent.style.width = Math.min(100, (usbc.a / 3.25) * 100) + '%';
  if (elements.barUsbCPower) elements.barUsbCPower.style.width = Math.min(100, (usbc.w / 65.0) * 100) + '%';

  if (elements.badgeUsbCProtocol) elements.badgeUsbCProtocol.textContent = usbc.protocol;
  if (elements.badgeUsbCStatus) {
    if (usbc.active) {
      elements.badgeUsbCStatus.className = 'badge badge-fast-active';
      elements.badgeUsbCStatus.textContent = '⚡ FAST CHARGE AKTIV';
    } else {
      elements.badgeUsbCStatus.className = 'badge badge-standby';
      elements.badgeUsbCStatus.textContent = 'STANDBY';
    }
  }

  if (elements.dispUsbCMah) elements.dispUsbCMah.textContent = Math.round(usbc.mah) + ' mAh';
  if (elements.dispUsbCWh) elements.dispUsbCWh.textContent = usbc.wh.toFixed(3) + ' Wh';

  if (usbc.startTime) {
    const elapsedSec = Math.floor((Date.now() - usbc.startTime) / 1000);
    const h = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    if (elements.dispUsbCUptime) elements.dispUsbCUptime.textContent = `${h}:${m}:${s}`;
  }

  // Highlight active PD profile chip
  if (elements.chipUsbC9V && elements.chipUsbC20V) {
    elements.chipUsbC9V.classList.toggle('chip-highlight', usbc.active && usbc.v >= 8 && usbc.v <= 11);
    elements.chipUsbC20V.classList.toggle('chip-highlight', usbc.active && usbc.v >= 18);
  }

  // 2. USB-A Displays
  if (elements.dispUsbAVoltage) elements.dispUsbAVoltage.textContent = usba.v.toFixed(3);
  if (elements.dispUsbACurrent) elements.dispUsbACurrent.textContent = usba.a.toFixed(4);
  if (elements.dispUsbAPower) elements.dispUsbAPower.textContent = usba.w.toFixed(2);

  if (elements.barUsbAVoltage) elements.barUsbAVoltage.style.width = Math.min(100, (usba.v / 12.0) * 100) + '%';
  if (elements.barUsbACurrent) elements.barUsbACurrent.style.width = Math.min(100, (usba.a / 2.5) * 100) + '%';
  if (elements.barUsbAPower) elements.barUsbAPower.style.width = Math.min(100, (usba.w / 18.0) * 100) + '%';

  if (elements.badgeUsbAProtocol) elements.badgeUsbAProtocol.textContent = usba.protocol;
  if (elements.badgeUsbAStatus) {
    if (usba.active) {
      elements.badgeUsbAStatus.className = 'badge badge-fast-active';
      elements.badgeUsbAStatus.textContent = '⚡ FAST CHARGE AKTIV';
    } else {
      elements.badgeUsbAStatus.className = 'badge badge-standby';
      elements.badgeUsbAStatus.textContent = 'STANDBY';
    }
  }

  if (elements.dispUsbAMah) elements.dispUsbAMah.textContent = Math.round(usba.mah) + ' mAh';
  if (elements.dispUsbAWh) elements.dispUsbAWh.textContent = usba.wh.toFixed(3) + ' Wh';

  if (usba.startTime) {
    const elapsedSec = Math.floor((Date.now() - usba.startTime) / 1000);
    const h = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    if (elements.dispUsbAUptime) elements.dispUsbAUptime.textContent = `${h}:${m}:${s}`;
  }

  // 3. Combined & Tab Activity Badge
  const totalW = usbc.w + usba.w;
  if (totalW > state.usb.peakPower) state.usb.peakPower = totalW;
  if (elements.dispUsbTotalPower) elements.dispUsbTotalPower.textContent = totalW.toFixed(2) + ' W';
  if (elements.dispUsbPeakPower) elements.dispUsbPeakPower.textContent = state.usb.peakPower.toFixed(2) + ' W';

  if (elements.usbActivityBadge) {
    if (usbc.active || usba.active) {
      elements.usbActivityBadge.className = 'tab-activity-badge active-charging';
      elements.usbActivityBadge.textContent = '⚡ ' + totalW.toFixed(1) + ' W';
    } else {
      elements.usbActivityBadge.className = 'tab-activity-badge';
      elements.usbActivityBadge.textContent = 'STANDBY';
    }
  }
}

let autoSwitchNotifyTimer = null;

function switchView(viewName, isAuto = false) {
  state.activeView = viewName;

  // 1. Update Tabs Active State
  if (elements.tabDcPower) elements.tabDcPower.classList.toggle('active', viewName === 'dc');
  if (elements.tabUsbMonitor) elements.tabUsbMonitor.classList.toggle('active', viewName === 'usb');
  if (elements.tabSplitView) elements.tabSplitView.classList.toggle('active', viewName === 'split');

  // 2. Adjust Grid & Panel Visibility
  if (elements.mainStudioGrid) {
    elements.mainStudioGrid.classList.toggle('split-mode', viewName === 'split');
  }

  const showDc = (viewName === 'dc' || viewName === 'split');
  const showUsb = (viewName === 'usb' || viewName === 'split');

  document.querySelectorAll('.dc-panel').forEach(p => {
    p.style.display = showDc ? 'flex' : 'none';
  });

  document.querySelectorAll('.usb-panel').forEach(p => {
    p.style.display = showUsb ? 'flex' : 'none';
  });

  // 3. Auto-Switch Notification Toast
  if (isAuto && elements.autoSwitchNotification && elements.autoSwitchNotifyText) {
    if (viewName === 'usb') {
      elements.autoSwitchNotifyText.textContent = '⚡ Auto-Switch: USB Schnellladung aktiv';
    } else if (viewName === 'dc') {
      elements.autoSwitchNotifyText.textContent = '⚡ Auto-Switch: Labornetzteil aktiv';
    }
    elements.autoSwitchNotification.style.display = 'flex';
    if (autoSwitchNotifyTimer) clearTimeout(autoSwitchNotifyTimer);
    autoSwitchNotifyTimer = setTimeout(() => {
      elements.autoSwitchNotification.style.display = 'none';
    }, 2800);
  }

  // 4. Force Canvas Resize so graphs re-fit instantly
  setTimeout(() => {
    resizeCanvas();
    resizeUsbCanvas();
  }, 50);
}

function evaluateAutoDisplaySwitch() {
  if (!state.autoSwitchEnabled) return;
  const now = Date.now();
  if (now - state.lastAutoSwitchTime < 2500) return; // Debounce 2.5s

  const usbCharging = (state.usb.usbc.active || state.usb.usba.active);
  const dcActive = state.outputOn;

  if (usbCharging && !dcActive && state.activeView === 'dc') {
    state.lastAutoSwitchTime = now;
    switchView('usb', true);
  } else if (dcActive && !usbCharging && state.activeView === 'usb') {
    state.lastAutoSwitchTime = now;
    switchView('dc', true);
  }
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
    evaluateAutoDisplaySwitch();
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

function recordUsbHistoryPoint() {
  const pt = {
    time: Date.now(),
    usbc_w: state.usb.usbc.w,
    usba_w: state.usb.usba.w,
    total_w: state.usb.usbc.w + state.usb.usba.w
  };
  state.usb.history.push(pt);

  const cutoff = pt.time - (state.usb.timebaseSeconds * 1000) - 2000;
  while (state.usb.history.length > 0 && state.usb.history[0].time < cutoff) {
    state.usb.history.shift();
  }
}

function drawUsbScope() {
  if (!elements.usbScopeCanvas) return;
  const canvas = elements.usbScopeCanvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Clear
  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, w, h);

  // Background Grid
  ctx.strokeStyle = 'rgba(0, 215, 255, 0.08)';
  ctx.lineWidth = 1;
  const cols = 8;
  const rows = 5;
  for (let c = 1; c < cols; c++) {
    const x = (w / cols) * c;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = (h / rows) * r;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  if (state.usb.history.length < 2) {
    requestAnimationFrame(drawUsbScope);
    return;
  }

  const now = Date.now();
  const startTime = now - (state.usb.timebaseSeconds * 1000);
  const maxW = Math.max(15, Math.ceil(state.usb.peakPower * 1.25));

  // 1. Draw USB-C Power Trace (Cyan)
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  state.usb.history.forEach((pt, idx) => {
    const x = ((pt.time - startTime) / (state.usb.timebaseSeconds * 1000)) * w;
    const y = h - ((pt.usbc_w / maxW) * (h - 20)) - 10;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 2. Draw USB-A Power Trace (Amber)
  ctx.strokeStyle = '#ffaa00';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ffaa00';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  state.usb.history.forEach((pt, idx) => {
    const x = ((pt.time - startTime) / (state.usb.timebaseSeconds * 1000)) * w;
    const y = h - ((pt.usba_w / maxW) * (h - 20)) - 10;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 3. Draw Total Power Trace (Emerald Green, Dashed)
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 8;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  state.usb.history.forEach((pt, idx) => {
    const x = ((pt.time - startTime) / (state.usb.timebaseSeconds * 1000)) * w;
    const y = h - ((pt.total_w / maxW) * (h - 20)) - 10;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  requestAnimationFrame(drawUsbScope);
}

function resizeUsbCanvas() {
  if (!elements.usbScopeCanvas) return;
  const container = elements.usbScopeCanvas.parentElement;
  if (container) {
    elements.usbScopeCanvas.width = container.clientWidth;
    elements.usbScopeCanvas.height = container.clientHeight;
  }
}

function exportUsbCsv() {
  if (state.usb.history.length === 0) return;
  const header = 'Timestamp,USB_C_Watt,USB_A_Watt,Total_Watt\n';
  const rows = state.usb.history.map(r => `${new Date(r.time).toISOString()},${r.usbc_w.toFixed(2)},${r.usba_w.toFixed(2)},${r.total_w.toFixed(2)}`).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IPS3608_USB_Log_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==========================================================================
// Event Listeners & Initialization
// ==========================================================================

function initEvents() {
  window.addEventListener('resize', () => {
    resizeCanvas();
    resizeUsbCanvas();
  });
  resizeCanvas();
  resizeUsbCanvas();
  requestAnimationFrame(drawScope);
  requestAnimationFrame(drawUsbScope);

  // View Tabs Navigation
  if (elements.tabDcPower) {
    elements.tabDcPower.addEventListener('click', () => switchView('dc'));
  }
  if (elements.tabUsbMonitor) {
    elements.tabUsbMonitor.addEventListener('click', () => switchView('usb'));
  }
  if (elements.tabSplitView) {
    elements.tabSplitView.addEventListener('click', () => switchView('split'));
  }

  // Auto-Switch Toggle
  if (elements.autoSwitchCheckbox) {
    elements.autoSwitchCheckbox.addEventListener('change', (e) => {
      state.autoSwitchEnabled = e.target.checked;
    });
  }

  // USB Timebase
  if (elements.usbTimebaseSelect) {
    elements.usbTimebaseSelect.addEventListener('change', (e) => {
      state.usb.timebaseSeconds = parseInt(e.target.value, 10);
    });
  }

  if (elements.btnExportUsbCsv) {
    elements.btnExportUsbCsv.addEventListener('click', exportUsbCsv);
  }

  // USB Demo Simulation Buttons
  if (elements.btnSimUsbCPhone) {
    elements.btnSimUsbCPhone.addEventListener('click', () => {
      state.usb.usbc.v = 9.15;
      state.usb.usbc.targetA = 2.18;
      state.usb.usbc.protocol = 'PD 3.0 (9V Schnellladung)';
      state.usb.usbc.active = true;
      updateUsbDisplays();
      evaluateAutoDisplaySwitch();
    });
  }

  if (elements.btnSimUsbCLaptop) {
    elements.btnSimUsbCLaptop.addEventListener('click', () => {
      state.usb.usbc.v = 19.85;
      state.usb.usbc.targetA = 3.15;
      state.usb.usbc.protocol = 'PD 3.0 PPS (20V / 65W Max)';
      state.usb.usbc.active = true;
      updateUsbDisplays();
      evaluateAutoDisplaySwitch();
    });
  }

  if (elements.btnSimUsbCDisconnect) {
    elements.btnSimUsbCDisconnect.addEventListener('click', () => {
      state.usb.usbc.v = 5.0;
      state.usb.usbc.targetA = 0;
      state.usb.usbc.a = 0;
      state.usb.usbc.w = 0;
      state.usb.usbc.protocol = 'PD 3.0 (Standby)';
      state.usb.usbc.active = false;
      state.usb.usbc.startTime = null;
      updateUsbDisplays();
      evaluateAutoDisplaySwitch();
    });
  }

  if (elements.btnSimUsbAPhone) {
    elements.btnSimUsbAPhone.addEventListener('click', () => {
      state.usb.usba.v = 5.12;
      state.usb.usba.targetA = 1.45;
      state.usb.usba.protocol = 'Apple 2.4A / BC 1.2';
      state.usb.usba.active = true;
      updateUsbDisplays();
      evaluateAutoDisplaySwitch();
    });
  }

  if (elements.btnSimUsbAFast) {
    elements.btnSimUsbAFast.addEventListener('click', () => {
      state.usb.usba.v = 9.08;
      state.usb.usba.targetA = 1.82;
      state.usb.usba.protocol = 'Qualcomm QC 3.0 (9V/18W)';
      state.usb.usba.active = true;
      updateUsbDisplays();
      evaluateAutoDisplaySwitch();
    });
  }

  if (elements.btnSimUsbADisconnect) {
    elements.btnSimUsbADisconnect.addEventListener('click', () => {
      state.usb.usba.v = 5.0;
      state.usb.usba.targetA = 0;
      state.usb.usba.a = 0;
      state.usb.usba.w = 0;
      state.usb.usba.protocol = 'QC 3.0 (Standby)';
      state.usb.usba.active = false;
      state.usb.usba.startTime = null;
      updateUsbDisplays();
      evaluateAutoDisplaySwitch();
    });
  }

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
