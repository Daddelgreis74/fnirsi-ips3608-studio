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
  OUTPUT_STATE: 0xDB,
  PROTECTION: 0xDC,
  MODE: 0xDD,
  BRIGHTNESS: 0xD6,
  CAPACITY_AH: 0xD9,
  CAPACITY_WH: 0xDA
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
   * Command: Poll Live Telemetry
   */
  static queryLiveValues() {
    return this.buildFrame(CmdType.READ, Register.LIVE_VALUES, new Uint8Array(0));
  }

  /**
   * Parses an incoming response buffer (looks for 0xF0 sync byte)
   */
  static parseStream(buffer) {
    const results = [];
    let i = 0;

    while (i < buffer.length) {
      if (buffer[i] === 0xF0) {
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
      telemetry.mode = frame.data[0] === 1 ? 'CC' : 'CV';
    } else if (frame.register === Register.PROTECTION && frame.data.length >= 1) {
      const p = frame.data[0];
      telemetry.protection = {
        ovp: (p & 0x01) !== 0,
        ocp: (p & 0x02) !== 0,
        opp: (p & 0x04) !== 0,
        otp: (p & 0x08) !== 0,
        scp: (p & 0x10) !== 0
      };
    }

    return telemetry;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CmdType, Register, IPS3608Protocol };
}
