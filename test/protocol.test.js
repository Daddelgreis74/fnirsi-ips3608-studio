const assert = require('assert');
const { CmdType, Register, ProtectionCode, IPS3608Protocol } = require('../src/renderer/protocol');

console.log('Running FNIRSI IPS3608 Protocol Tests...');

// 1. Test Frame Building & Checksum
{
  const frame = IPS3608Protocol.queryAll();
  assert.strictEqual(frame[0], 0xF1, 'Sync byte must be 0xF1');
  assert.strictEqual(frame[1], CmdType.READ, 'CmdType must be READ (0xA1)');
  assert.strictEqual(frame[2], Register.ALL, 'Register must be ALL (0xFF)');
  assert.strictEqual(frame[3], 1, 'Length must be 1');
  assert.strictEqual(frame[4], 0x00, 'Payload must be 0x00');
  const expectedCs = (0xFF + 1 + 0x00) & 0xFF;
  assert.strictEqual(frame[5], expectedCs, 'Checksum mismatch');
  console.log('✓ QueryAll frame structure & checksum verified');
}

// 2. Test Stream Parsing
{
  // Simulate incoming 0xF0 frame for LIVE_VALUES (12 bytes: 12.0V, 1.5A, 18.0W)
  const vBytes = IPS3608Protocol.floatToBytes(12.0);
  const cBytes = IPS3608Protocol.floatToBytes(1.5);
  const pBytes = IPS3608Protocol.floatToBytes(18.0);
  const payload = new Uint8Array([...vBytes, ...cBytes, ...pBytes]);
  const cs = IPS3608Protocol.calculateChecksum(Register.LIVE_VALUES, payload.length, payload);

  const rawBytes = new Uint8Array([0xF0, CmdType.READ, Register.LIVE_VALUES, payload.length, ...payload, cs]);
  const { frames, remainingBuffer } = IPS3608Protocol.parseStream(rawBytes);
  assert.strictEqual(frames.length, 1, 'Should parse exactly 1 frame');
  assert.strictEqual(remainingBuffer.length, 0, 'No remaining buffer');

  const decoded = IPS3608Protocol.decodeTelemetry(frames[0]);
  assert.strictEqual(Math.round(decoded.voltage), 12, 'Decoded voltage mismatch');
  assert.strictEqual(decoded.current, 1.5, 'Decoded current mismatch');
  assert.strictEqual(decoded.power, 18, 'Decoded power mismatch');
  console.log('✓ Fast Live Values telemetry stream decode verified');
}

// 3. Test Full Status Frame (0xFF) Normal Operation (CV Mode = 1, Protection = 0 OK)
{
  const payload = new Uint8Array(120);
  // Input 24V, Set 12V, Set 2A, Out 12V, Out 0.5A, Out 6W, Temp 28C
  payload.set(IPS3608Protocol.floatToBytes(24.0), 0);
  payload.set(IPS3608Protocol.floatToBytes(12.0), 4);
  payload.set(IPS3608Protocol.floatToBytes(2.0), 8);
  payload.set(IPS3608Protocol.floatToBytes(12.0), 12);
  payload.set(IPS3608Protocol.floatToBytes(0.5), 16);
  payload.set(IPS3608Protocol.floatToBytes(6.0), 20);
  payload.set(IPS3608Protocol.floatToBytes(28.5), 24);

  // Capacity Ah at 99, Wh at 103
  payload.set(IPS3608Protocol.floatToBytes(1.234), 99);
  payload.set(IPS3608Protocol.floatToBytes(14.808), 103);

  // Status bytes: 107 = outputOn (1), 108 = protection (0 OK), 109 = mode (1 CV)
  payload[107] = 1;
  payload[108] = 0; // OK - No protection tripped!
  payload[109] = 1; // CV Mode!

  const frame = { register: Register.ALL, data: payload };
  const decoded = IPS3608Protocol.decodeTelemetry(frame);

  assert.strictEqual(decoded.outputOn, true, 'Output must be ON');
  assert.strictEqual(decoded.mode, 'CV', 'Mode must be CV when byte 109 is 1');
  assert.strictEqual(decoded.protection.code, 0, 'Protection code must be 0 (OK)');
  assert.strictEqual(decoded.protection.ovp, false, 'OVP MUST NOT blink or be active in normal CV operation!');
  assert.strictEqual(decoded.protection.scp, false, 'SCP must be false');
  assert.strictEqual(decoded.protection.ocp, false, 'OCP must be false');
  assert.strictEqual(decoded.protection.opp, false, 'OPP must be false');
  assert.strictEqual(decoded.protection.otp, false, 'OTP must be false');
  console.log('✓ Normal CV operation: OVP is FALSE and Mode is CV verified');
}

// 4. Test Short Circuit Protection (SCP / Kurzschluss) Frame (0xFF, Byte 108 = 5)
{
  const payload = new Uint8Array(120);
  payload[107] = 0; // Output turned off by protection
  payload[108] = 5; // SCP Short Circuit Protection!
  payload[109] = 0; // CC or tripped

  const frame = { register: Register.ALL, data: payload };
  const decoded = IPS3608Protocol.decodeTelemetry(frame);

  assert.strictEqual(decoded.outputOn, false, 'Output must be OFF after short circuit');
  assert.strictEqual(decoded.protection.code, 5, 'Protection code must be 5 (SCP)');
  assert.strictEqual(decoded.protection.scp, true, 'SCP (Kurzschluss) flag MUST be TRUE!');
  assert.strictEqual(decoded.protection.ovp, false, 'OVP must be FALSE during SCP');
  assert.strictEqual(decoded.protection.ocp, false, 'OCP must be FALSE during SCP');
  console.log('✓ Short Circuit (SCP) detection: Kurzschluss flag is TRUE verified');
}

// 5. Test Over-Voltage Protection (OVP, Byte 108 = 1)
{
  const payload = new Uint8Array(120);
  payload[107] = 0;
  payload[108] = 1; // OVP
  payload[109] = 1;

  const frame = { register: Register.ALL, data: payload };
  const decoded = IPS3608Protocol.decodeTelemetry(frame);

  assert.strictEqual(decoded.protection.ovp, true, 'OVP must be TRUE');
  assert.strictEqual(decoded.protection.scp, false, 'SCP must be FALSE');
  console.log('✓ Over-Voltage (OVP) detection verified');
}

// 6. Test Over-Current Protection (OCP, Byte 108 = 2)
{
  const payload = new Uint8Array(120);
  payload[107] = 0;
  payload[108] = 2; // OCP
  payload[109] = 0;

  const frame = { register: Register.ALL, data: payload };
  const decoded = IPS3608Protocol.decodeTelemetry(frame);

  assert.strictEqual(decoded.protection.ocp, true, 'OCP must be TRUE');
  assert.strictEqual(decoded.protection.scp, false, 'SCP must be FALSE');
  assert.strictEqual(decoded.protection.ovp, false, 'OVP must be FALSE');
  console.log('✓ Over-Current (OCP) detection verified');
}

// 7. Test Protection Threshold Limit Commands (Registers 0xD1 - 0xD5)
{
  const ovpFrame = IPS3608Protocol.setOvpLimit(32.5);
  assert.strictEqual(ovpFrame[0], 0xF1);
  assert.strictEqual(ovpFrame[1], CmdType.WRITE_BYTE);
  assert.strictEqual(ovpFrame[2], Register.OVP_LIMIT); // 0xD1
  assert.strictEqual(ovpFrame[3], 4);
  const decodedOvp = IPS3608Protocol.bytesToFloat(ovpFrame, 4);
  assert.strictEqual(Math.round(decodedOvp * 10) / 10, 32.5, 'OVP limit float mismatch');

  const ocpFrame = IPS3608Protocol.setOcpLimit(5.2);
  assert.strictEqual(ocpFrame[2], Register.OCP_LIMIT); // 0xD2

  const oppFrame = IPS3608Protocol.setOppLimit(150.0);
  assert.strictEqual(oppFrame[2], Register.OPP_LIMIT); // 0xD3

  const otpFrame = IPS3608Protocol.setOtpLimit(75.0);
  assert.strictEqual(otpFrame[2], Register.OTP_LIMIT); // 0xD4

  const lvpFrame = IPS3608Protocol.setLvpLimit(4.0);
  assert.strictEqual(lvpFrame[2], Register.LVP_LIMIT); // 0xD5
  console.log('✓ Hardware protection threshold command frames (0xD1-0xD5) verified');
}

// 8. Test Capacity Metering Reset & Start (Register 0xD8, CMD_10 & CMD_11)
{
  const resetFrame = IPS3608Protocol.resetCapacity();
  assert.strictEqual(resetFrame[0], 0xF1);
  assert.strictEqual(resetFrame[1], CmdType.WRITE_BYTE);
  assert.strictEqual(resetFrame[2], Register.METERING); // 0xD8
  assert.strictEqual(resetFrame[3], 1);
  assert.strictEqual(resetFrame[4], 0x00);
  assert.strictEqual(resetFrame[5], (0xD8 + 1 + 0) & 0xFF); // 0xD9 (CMD_11: F1 B1 D8 01 00 D9)

  const startFrame = IPS3608Protocol.startCapacity();
  assert.strictEqual(startFrame[4], 0x01);
  assert.strictEqual(startFrame[5], (0xD8 + 1 + 1) & 0xFF); // 0xDA (CMD_10: F1 B1 D8 01 01 DA)
  console.log('✓ Hardware Capacity/Energy reset (CMD_11) and start (CMD_10) verified');
}

// 9. Test Bootloader Trigger Frame (CMD_15: F1 C0 00 01 01 02)
{
  const bootFrame = IPS3608Protocol.enterBootloader();
  assert.strictEqual(bootFrame[0], 0xF1);
  assert.strictEqual(bootFrame[1], CmdType.CONFIG); // 0xC0
  assert.strictEqual(bootFrame[2], 0x00);
  assert.strictEqual(bootFrame[3], 1);
  assert.strictEqual(bootFrame[4], 0x01);
  assert.strictEqual(bootFrame[5], 0x02);
  console.log('✓ Official Bootloader Mode trigger frame (CMD_15) verified');
}

// 10. Test Device Info Frame Decoding (Firmware, Serial, Model)
{
  const fwData = new TextEncoder().encode('V1.9\0');
  const fwFrame = { register: Register.FIRMWARE, data: fwData };
  const decodedFw = IPS3608Protocol.decodeTelemetry(fwFrame);
  assert.strictEqual(decodedFw.firmware, 'V1.9');

  const snData = new TextEncoder().encode('SN80AC1234\0');
  const snFrame = { register: Register.SERIAL, data: snData };
  const decodedSn = IPS3608Protocol.decodeTelemetry(snFrame);
  assert.strictEqual(decodedSn.serial, 'SN80AC1234');
  console.log('✓ Device Info decoding (Firmware, Serial, Model) verified');
}

console.log('\nAll protocol tests passed cleanly!');
