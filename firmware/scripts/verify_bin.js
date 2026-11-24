#!/usr/bin/env node
// Verifies compiled AT32F415 application .bin bounds & vector table safety.

const fs = require('fs');
const assert = require('assert');

const binPath = process.argv[2] || 'build/IPS3608_OpenFW.bin';
assert(fs.existsSync(binPath), `Firmware binary not found: ${binPath}`);

const buf = fs.readFileSync(binPath);
const APP_BASE = 0x08006800;
const MAX_APP_SIZE = 226 * 1024; // 0x08006800..0x0803EFFF (protects 0x0803F000 calibration)
const EXPECTED_MSP = 0x20008000;

assert(buf.length >= 64, `Binary unexpectedly small: ${buf.length} bytes`);
assert(buf.length <= MAX_APP_SIZE, `Binary exceeds 226 KB limit (${buf.length} > ${MAX_APP_SIZE}), would overwrite calibration!`);

const msp = buf.readUInt32LE(0);
const resetHandler = buf.readUInt32LE(4);

assert.strictEqual(msp, EXPECTED_MSP, `Initial MSP mismatch: got 0x${msp.toString(16)}, expected 0x${EXPECTED_MSP.toString(16)}`);
assert.strictEqual(resetHandler & 1, 1, `Reset_Handler must have Thumb bit set: 0x${resetHandler.toString(16)}`);
assert(
  resetHandler >= APP_BASE && resetHandler < APP_BASE + MAX_APP_SIZE,
  `Reset_Handler out of app flash range: 0x${resetHandler.toString(16)}`
);

console.log(`✓ Firmware image verified: ${binPath}`);
console.log(`  Size         : ${buf.length} bytes / ${MAX_APP_SIZE} bytes max (${((buf.length / MAX_APP_SIZE) * 100).toFixed(1)}%)`);
console.log(`  Initial MSP  : 0x${msp.toString(16).toUpperCase()}`);
console.log(`  Reset_Handler: 0x${resetHandler.toString(16).toUpperCase()}`);
console.log('  Calibration  : 0x0803F000-0x0803FFFF untouched');
