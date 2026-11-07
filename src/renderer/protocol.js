/**
 * FNIRSI IPS3608 Binary Protocol Driver
 * Implements low-level 0xF1/0xF0 framing, checksum calculation, and float conversion.
 */

const CmdType = {
  READ: 0xA1,
  WRITE_FLOAT: 0xB0,
  WRITE_BYTE: 0xB1,
  CONFIG: 0xC0,
  CONNECT: 0xC1
};

const Register = {
  SET_VOLTAGE: 0xC1,
  SET_CURRENT: 0xC2,
  LIVE_VALUES: 0xC3,
  TEMPERATURE: 0xC4,
  PRESET_1_V: 0xC5,
  PRESET_1_A: 0xC6,
  OVP_LIMIT: 0xD1,
  OCP_LIMIT: 0xD2,
  OPP_LIMIT: 0xD3,
  OTP_LIMIT: 0xD4,
  LVP_LIMIT: 0xD5,
  BRIGHTNESS: 0xD6,
  METERING: 0xD8,
  CAPACITY_AH: 0xD9,
  CAPACITY_WH: 0xDA,
  OUTPUT_STATE: 0xDB,
  PROTECTION: 0xDC,
  MODE: 0xDD,
  MODEL: 0xDE,
  SERIAL: 0xDF,
  FIRMWARE: 0xE0,
  DEVICE_ID: 0xE1,
  MAX_VOLTAGE: 0xE2,
  MAX_CURRENT: 0xE3,
  ALL: 0xFF
};

const ProtectionCode = {
  OK: 0,
  OVP: 1, // Over Voltage Protection
  OCP: 2, // Over Current Protection
  OPP: 3, // Over Power Protection
  OTP: 4, // Over Temperature Protection
  LVP: 5, // Low Voltage Protection (欠压保护 - tripped on short-circuit voltage collapse)
  SCP: 5  // Short Circuit Protection alias
};

class IPS3608Protocol {
  /**
   * Helper: Convert float to 4 bytes Little-Endian
   */
  static floatToBytes(value) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, true); // Little endian
    return new Uint8Array(buffer);
  }

  /**
   * Helper: Convert 4 bytes Little-Endian to float
   */
  static bytesToFloat(bytes, offset = 0) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    for (let i = 0; i < 4; i++) {
      view.setUint8(i, bytes[offset + i]);
    }
    return view.getFloat32(0, true);
  }

  /**
   * Calculates frame checksum: (register + length + sum(data)) & 0xFF
   */
  static calculateChecksum(register, length, data) {
    let sum = register + length;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum & 0xFF;
  }

  /**
   * Builds an outgoing 0xF1 command frame
   */
  static buildFrame(cmdType, register, data = new Uint8Array(0)) {
    const length = data.length;
    const checksum = this.calculateChecksum(register, length, data);
    const frame = new Uint8Array(5 + length);

    frame[0] = 0xF1;      // Header sync byte
    frame[1] = cmdType;   // Command type
    frame[2] = register;  // Target register
    frame[3] = length;    // Payload length
    frame.set(data, 4);   // Payload bytes
    frame[4 + length] = checksum; // Trailing checksum

    return frame;
  }

  /**
   * Command: Set Target Voltage (Float32)
   */
  static setVoltage(voltage) {
    const data = this.floatToBytes(voltage);
    return this.buildFrame(CmdType.WRITE_BYTE, Register.SET_VOLTAGE, data);
  }

  /**
   * Command: Set Target Current Limit (Float32)
   */
  static setCurrent(current) {
    const data = this.floatToBytes(current);
    return this.buildFrame(CmdType.WRITE_BYTE, Register.SET_CURRENT, data);
  }

  /**
   * Command: Set Output State (1 = ON, 0 = OFF)
   */
  static setOutput(enabled) {
    const data = new Uint8Array([enabled ? 1 : 0]);
    return this.buildFrame(CmdType.WRITE_BYTE, Register.OUTPUT_STATE, data);
  }

  /**
   * Command: Connect / Handshake packet
   */
  static connectPacket() {
    return this.buildFrame(CmdType.CONNECT, 0x00, new Uint8Array([0x01]));
  }

  /**
   * Command: Device initialization sync (CMD_13: F1 B0 00 01 00 01)
   * Essential handshake required before querying Model, Firmware and Serial strings.
   */
  static initHandshake() {
    return new Uint8Array([0xF1, 0xB0, 0x00, 0x01, 0x00, 0x01]);
  }

  /**
   * Command: Poll Live Telemetry (12 Bytes: Voltage, Current, Power)
   */
  static queryLiveValues() {
    return this.buildFrame(CmdType.READ, Register.LIVE_VALUES, new Uint8Array([0x00]));
  }

  /**
   * Command: Poll Protection Status (Register 0xDC)
   */
  static queryProtection() {
    return this.buildFrame(CmdType.READ, Register.PROTECTION, new Uint8Array([0x00]));
  }

  /**
   * Command: Poll Full Device Status (Register 0xFF, ~140 Bytes all telemetry)
   */
  static queryAll() {
    return this.buildFrame(CmdType.READ, Register.ALL, new Uint8Array([0x00]));
  }

  /**
   * Command: Set OVP Threshold Limit (Float32, Register 0xD1)
   */
  static setOvpLimit(voltage) {
    return this.buildFrame(CmdType.WRITE_BYTE, Register.OVP_LIMIT, this.floatToBytes(voltage));
  }

  /**
   * Command: Set OCP Threshold Limit (Float32, Register 0xD2)
   */
  static setOcpLimit(current) {
    return this.buildFrame(CmdType.WRITE_BYTE, Register.OCP_LIMIT, this.floatToBytes(current));
  }

  /**
   * Command: Set OPP Threshold Limit (Float32, Register 0xD3)
   */
  static setOppLimit(power) {
    return this.buildFrame(CmdType.WRITE_BYTE, Register.OPP_LIMIT, this.floatToBytes(power));
  }

  /**
   * Command: Set OTP Threshold Limit (Float32, Register 0xD4)
   */
  static setOtpLimit(temperature) {
    return this.buildFrame(CmdType.WRITE_BYTE, Register.OTP_LIMIT, this.floatToBytes(temperature));
  }

  /**
   * Command: Set LVP Threshold Limit (Float32, Register 0xD5)
   */
  static setLvpLimit(voltage) {
    return this.buildFrame(CmdType.WRITE_BYTE, Register.LVP_LIMIT, this.floatToBytes(voltage));
  }

  /**
   * Command: Reset / Clear Hardware Ah & Wh Capacity Accumulator (Register 0xD8 = 0x00, CMD_11)
   */
  static resetCapacity() {
    return this.buildFrame(CmdType.WRITE_BYTE, Register.METERING, new Uint8Array([0x00]));
  }

  /**
   * Command: Start Hardware Capacity Accumulator (Register 0xD8 = 0x01, CMD_10)
   */
  static startCapacity() {
    return this.buildFrame(CmdType.WRITE_BYTE, Register.METERING, new Uint8Array([0x01]));
  }

  /**
   * Command: Trigger Bootloader Mode for Firmware Upgrade (CMD_15: F1 C0 00 01 01 02)
   */
  static enterBootloader() {
    return this.buildFrame(CmdType.CONFIG, 0x00, new Uint8Array([0x01]));
  }

  /**
   * Command: Query Device Firmware Version String (Register 0xE0, CMD_6)
   */
  static queryFirmware() {
    return this.buildFrame(CmdType.READ, Register.FIRMWARE, new Uint8Array([0x00]));
  }

  /**
   * Command: Query Device Serial Number String (Register 0xDF, CMD_16)
   */
  static querySerial() {
    return this.buildFrame(CmdType.READ, Register.SERIAL, new Uint8Array([0x00]));
  }

  /**
   * Command: Query Device Model Name (Register 0xDE, CMD_4)
   */
  static queryModel() {
    return this.buildFrame(CmdType.READ, Register.MODEL, new Uint8Array([0x00]));
  }

  /**
   * Parses an incoming response buffer (looks for 0xF0 sync byte)
   */
  static parseStream(buffer) {
    const results = [];
    let i = 0;

    while (i < buffer.length) {
      if (buffer[i] === 0xF0 || buffer[i] === 0xF1) {
        // Need at least 5 bytes for header + length + checksum
        if (i + 4 >= buffer.length) break;

        const cmdType = buffer[i + 1];
        const register = buffer[i + 2];
        const length = buffer[i + 3];

        const totalPacketLen = 5 + length;
        if (i + totalPacketLen > buffer.length) break; // Incomplete packet, wait for next chunk

        const data = buffer.slice(i + 4, i + 4 + length);
        const expectedChecksum = buffer[i + 4 + length];
        const actualChecksum = this.calculateChecksum(register, length, data);

        if (actualChecksum === expectedChecksum) {
          results.push({
            cmdType,
            register,
            length,
            data
          });
          i += totalPacketLen;
          continue;
        }
      }
      i++;
    }

    return {
      frames: results,
      remainingBuffer: buffer.slice(i)
    };
  }

  /**
   * Decodes a live telemetry frame (Register.LIVE_VALUES or general status)
   */
  static decodeTelemetry(frame) {
    const telemetry = {};

    if (frame.register === Register.LIVE_VALUES && frame.data.length >= 12) {
      telemetry.voltage = this.bytesToFloat(frame.data, 0);
      telemetry.current = this.bytesToFloat(frame.data, 4);
      telemetry.power = this.bytesToFloat(frame.data, 8);
    } else if (frame.register === Register.TEMPERATURE && frame.data.length >= 4) {
      telemetry.temperature = this.bytesToFloat(frame.data, 0);
    } else if (frame.register === Register.OUTPUT_STATE && frame.data.length >= 1) {
      telemetry.outputOn = frame.data[0] === 1;
    } else if (frame.register === Register.MODE && frame.data.length >= 1) {
      telemetry.mode = frame.data[0] === 1 ? 'CV' : 'CC';
    } else if (frame.register === Register.MODEL && frame.data.length >= 1) {
      telemetry.model = String.fromCharCode.apply(null, frame.data).replace(/\0/g, '').trim();
    } else if (frame.register === Register.FIRMWARE && frame.data.length >= 1) {
      telemetry.firmware = String.fromCharCode.apply(null, frame.data).replace(/\0/g, '').trim();
    } else if (frame.register === Register.SERIAL && frame.data.length >= 1) {
      telemetry.serial = String.fromCharCode.apply(null, frame.data).replace(/\0/g, '').trim();
    } else if (frame.register === Register.OVP_LIMIT && frame.data.length >= 4) {
      telemetry.ovpLimit = this.bytesToFloat(frame.data, 0);
    } else if (frame.register === Register.OCP_LIMIT && frame.data.length >= 4) {
      telemetry.ocpLimit = this.bytesToFloat(frame.data, 0);
    } else if (frame.register === Register.OPP_LIMIT && frame.data.length >= 4) {
      telemetry.oppLimit = this.bytesToFloat(frame.data, 0);
    } else if (frame.register === Register.OTP_LIMIT && frame.data.length >= 4) {
      telemetry.otpLimit = this.bytesToFloat(frame.data, 0);
    } else if (frame.register === Register.LVP_LIMIT && frame.data.length >= 4) {
      telemetry.lvpLimit = this.bytesToFloat(frame.data, 0);
    } else if (frame.register === Register.PROTECTION && frame.data.length >= 1) {
      const p = frame.data[0];
      const isLvpScp = p === ProtectionCode.LVP || p === 5 || (p & 0x10) !== 0;
      telemetry.protection = {
        code: p,
        ovp: p === ProtectionCode.OVP || ((p & 0x01) !== 0 && p !== 5 && p !== 3),
        ocp: p === ProtectionCode.OCP || (p & 0x02) !== 0,
        opp: p === ProtectionCode.OPP || (p & 0x04) !== 0,
        otp: p === ProtectionCode.OTP || (p & 0x08) !== 0,
        lvp: isLvpScp,
        scp: isLvpScp
      };
    } else if (frame.register === Register.ALL && frame.data.length >= 28) {
      // Register 0xFF full status frame
      telemetry.inputVoltage = this.bytesToFloat(frame.data, 0);
      telemetry.targetVoltage = this.bytesToFloat(frame.data, 4);
      telemetry.targetCurrent = this.bytesToFloat(frame.data, 8);
      telemetry.voltage = this.bytesToFloat(frame.data, 12);
      telemetry.current = this.bytesToFloat(frame.data, 16);
      telemetry.power = this.bytesToFloat(frame.data, 20);
      telemetry.temperature = this.bytesToFloat(frame.data, 24);

      // Hardware protection limits if populated in frame (offsets 76..95)
      if (frame.data.length >= 96) {
        telemetry.oppLimit = this.bytesToFloat(frame.data, 76);
        telemetry.ovpLimit = this.bytesToFloat(frame.data, 80);
        telemetry.ocpLimit = this.bytesToFloat(frame.data, 84);
        telemetry.otpLimit = this.bytesToFloat(frame.data, 88);
        telemetry.lvpLimit = this.bytesToFloat(frame.data, 92);
      }

      if (frame.data.length >= 107) {
        telemetry.capacityAh = this.bytesToFloat(frame.data, 99);
        telemetry.energyWh = this.bytesToFloat(frame.data, 103);
      }

      if (frame.data.length >= 110) {
        telemetry.outputOn = frame.data[107] === 1;
        const p = frame.data[108]; // Offset 108: Protection status (0=OK, 1=OVP, 2=OCP, 3=OPP, 4=OTP, 5=LVP/SCP)
        telemetry.mode = frame.data[109] === 1 ? 'CV' : 'CC'; // Offset 109: Mode (1=CV, 0=CC)
        const isLvpScp = p === ProtectionCode.LVP || p === 5 || (p & 0x10) !== 0;
        telemetry.protection = {
          code: p,
          ovp: p === ProtectionCode.OVP || ((p & 0x01) !== 0 && p !== 5 && p !== 3),
          ocp: p === ProtectionCode.OCP || (p & 0x02) !== 0,
          opp: p === ProtectionCode.OPP || (p & 0x04) !== 0,
          otp: p === ProtectionCode.OTP || (p & 0x08) !== 0,
          lvp: isLvpScp,
          scp: isLvpScp
        };
      }

      if (frame.data.length >= 119) {
        telemetry.maxVoltage = this.bytesToFloat(frame.data, 111);
        telemetry.maxCurrent = this.bytesToFloat(frame.data, 115);
      }

      // Secondary threshold slots (offsets 119..138)
      if (frame.data.length >= 139) {
        telemetry.ovpLimit = this.bytesToFloat(frame.data, 119);
        telemetry.ocpLimit = this.bytesToFloat(frame.data, 123);
        telemetry.otpLimit = this.bytesToFloat(frame.data, 127);
        telemetry.lvpLimit = this.bytesToFloat(frame.data, 131);
        telemetry.oppLimit = this.bytesToFloat(frame.data, 135);
      }
    }

    return telemetry;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CmdType, Register, ProtectionCode, IPS3608Protocol };
}
