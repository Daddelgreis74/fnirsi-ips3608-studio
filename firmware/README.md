# FNIRSI IPS3608 Open-Source Firmware

Alternativ- und Entwicklungs-Firmware in reinem Bare-Metal C für das **FNIRSI IPS3608** programmierbare Labornetzteil (**Artery AT32F415CCT7**, ARM Cortex-M4F, 256 KB Flash, 32 KB SRAM).

> **Wichtiger Sicherheitshinweis – Aktuell Stufe 1 (Safe Bring-Up):**  
> Diese Version (`v0.1.0`) ist ein **reiner Hardware-Bring-Up ohne aktive Leistungselektronik**.  
> Beim Start schaltet `board_safe_power_off()` sämtliche Buck-PWM- und Steuerpins (`PA6`, `PA7`, `PF4`, `PF6`, `PF7`, `PB4`, `PB10`, `PA8`, `PD2`, `PC0`, `PC1`) dauerhaft auf **LOW / AUS**. Der Ausgang bleibt physisch deaktiviert.

---

## Funktionsumfang (Stufe 1 – Safe Bring-Up)

- **Geschützter Bootloader & Werkskalibrierung:**
  - Linker-Script startet bei `0x08006800` (hinter dem 26-KB-USB-MSC-Bootloader) und endet strikt bei `0x0803EFFF` (226 KB).
  - Der werkseitige Kalibrierungs- und Einstellungsbereich (`0x0803F000–0x0803FFFF`) wird niemals berührt.
- **IPS-Farbdisplay (`ST7789V`, 320×240 RGB565 über `SPI2`):**
  - Zeigt den deutschen Diagnose- und Statusbildschirm inkl. `SAFE BRING-UP: AUSGANG AUS`.
- **Nur-lesender `ADC1`-Monitor:**
  - Liest zyklisch alle 6 verifizierten Analogkanäle (`IN13/PC3`, `IN2/PA2`, `IN3/PA3`, `IN4/PA4`, `IN14/PC4`, `IN15/PC5`) als Rohwerte (0..4095) aus und zeigt sie live auf dem Display an.
- **Tasten- & Encoder-Test:**
  - Zeigt die Live-Pegel der erkannten Eingänge (`PC7`, `PC8`, `PB1`, `PB11`, `PF5`) direkt auf dem Display.
- **`USART1`-Diagnose (`PA9`, 115200 8N1):**
  - Gibt Startbanner und zyklische ADC-Rohwerte seriell aus.

---

## Flashen & Rückkehr zur Original-Firmware

Das IPS3608 besitzt einen fest installierten USB-Mass-Storage-Bootloader (`0x08000000–0x080067FF`):

1. Gerät ausschalten, **obere Taste gedrückt halten** und Netzteil einschalten (oder in **FNIRSI IPS3608 Studio** auf **⚡ Bootloader (`CMD_15`)** klicken).
2. Per Micro-USB mit dem PC verbinden – es erscheint ein USB-Wechseldatenträger.
3. Die gebaute `IPS3608_OpenFW.bin` (aus dem GitHub-Release / CI-Artifact) auf das USB-Laufwerk kopieren.
4. Zum Starten kurz die **RUN/STOP**-Taste drücken.

**Rollback auf Original-Firmware:** Auf demselben Weg jederzeit wieder die offizielle `APP_IPS3608_V1.9_260429.bin` auf das Bootloader-Laufwerk kopieren – sowohl Bootloader als auch Werkskalibrierung bleiben erhalten.

---

## Build (GitHub Actions CI & lokal)

Jeder Push auf `main` sowie Tags `v*` kompilieren die Firmware automatisch in der Cloud via GitHub Actions (`.github/workflows/build-firmware.yml`) mit `arm-none-eabi-gcc` und prüfen das erzeugte `.bin`-Image mit `scripts/verify_bin.js`.

Lokaler Build (falls `gcc-arm-none-eabi` installiert ist):

```bash
make
node scripts/verify_bin.js build/IPS3608_OpenFW.bin
```

---

## Hardware-Dokumentation

Alle aus `APP_IPS3608_V1.9_260429.bin` disassemblierten Register, Speicheradressen und Pinbelegungen sind in [`docs/HARDWARE_PINOUT.md`](docs/HARDWARE_PINOUT.md) dokumentiert.
