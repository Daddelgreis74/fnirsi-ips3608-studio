# FNIRSI IPS3608 Studio ⚡

[![Build & Release](https://github.com/Daddelgreis74/fnirsi-ips3608-studio/actions/workflows/build-and-release.yml/badge.svg)](https://github.com/Daddelgreis74/fnirsi-ips3608-studio/actions/workflows/build-and-release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows x64](https://img.shields.io/badge/Platform-Windows%20x64-brightgreen.svg)]()
[![Electron: v45](https://img.shields.io/badge/Electron-v45-cyan.svg)](https://www.electronjs.org/)

Professional Windows Desktop Studio & Control Suite for the **FNIRSI IPS3608** Programmable DC Laboratory Power Supply (0–36V / 0–8.2A).

Designed as a modern, rock-solid alternative to the buggy and crash-prone official vendor software.

---

## 🌟 Highlights & Features

- **🛡️ Rock-Solid Serial Engine:** Seamless USB-CDC COM port communication with automatic reconnection. No crashes when plugging or unplugging the USB cable during operation!
- **⚡ Aurora Dark Tech UI:** High-contrast OLED/Digital styling matching modern workshop and laboratory environments.
- **📊 60 FPS Real-Time Oscilloscope:** Dual-trace live canvas graph plotting Voltage (Cyan) and Current (Emerald Green) with dynamic auto-scaling.
- **📱 Front-USB Fast Charging Monitor:** Dedicated monitor tab for Front USB-C (PD 65W/PPS) and USB-A (QC 18W/24W) with dual-trace scope, live capacity counters ($mAh$ / $Wh$), and interactive simulation.
- **🔄 Intelligent Auto-Display Switching:** App detects USB charging activity and automatically toggles between the Laboratory Studio and Front-USB Monitor.
- **🚨 Dynamic Protection Alerts:** Visual indicators and pulsed warning badges for OVP, OCP, OPP, OTP, and SCP.
- **🔘 Master Safety Power Switch:** Large visual output button with tactile response and LED state indicator (Standby / Active).
- **🎛️ Dual Setpoint Sliders & Steppers:** Easy target voltage and current adjustment via smooth sliders, quick step buttons (+/- 0.1V, +/- 1.0V), or direct numeric input.
- **⚡ Instant Quick Presets:** 1-click recall for standard voltages (`3.3V`, `5.0V`, `9.0V`, `12V`, `15V`, `20V`, `24V`, `36V`).
- **📝 CSV Session Data Logger:** Record live voltage, current, power, and timestamps directly into exportable CSV files.
- **🎮 Demo / Simulation Mode:** Integrated hardware simulator allows full testing and demonstration of all UI features even without the physical device plugged in.

---

## 📦 Download & Installation

Download the latest version directly from the [GitHub Releases](https://github.com/Daddelgreis74/fnirsi-ips3608-studio/releases):

1. **Setup Installer:**  
   `FNIRSI.IPS3608.Studio.Setup.<version>.exe`  
   - Installs to Windows, creates Start Menu shortcuts and a high-resolution Desktop Icon, and includes an uninstaller.
2. **Portable Version:**  
   `FNIRSI-IPS3608-Studio-Portable-<version>.exe`  
   - Single standalone `.exe` that runs immediately without installation (ideal for USB sticks).

---

## 🛠️ Development & Building from Source

```bash
# Clone the repository
git clone https://github.com/Daddelgreis74/fnirsi-ips3608-studio.git
cd fnirsi-ips3608-studio

# Install dependencies
npm install

# Start in development mode
npm start

# Build the Windows installer and portable EXE
npm run dist
```

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
