# FNIRSI IPS3608 Studio - Projekt-Kontext & Status

## Übersicht
Dieses Projekt ist die eigenständige Windows Desktop Suite & Kontrollsoftware für das **FNIRSI IPS3608** (programmierbares Labornetzteil: 0–36V / 0–8.2A).

---

## 1. Projekt-Details
- **Pfad:** `c:\Users\dadde\Documents\GitHub\FNIRSI-IPS3608\Software-Studio` (bzw. `c:\Users\dadde\Documents\GitHub\fnirsi-ips3608-studio`)
- **Aktuelle Version:** **v1.1.0**
- **Technologie:** Electron v30, Node.js, SerialPort, HTML5 Canvas
- **Entwicklungs-Befehle:**
  - `npm start` - Startet die App im Entwicklungsmodus
  - `npm run dist` - Erzeugt Installer (`.exe`) und portable Version in `dist/`

---

## 2. Kernfunktionen
- **Serial Engine:** USB-CDC COM-Port Kommunikation mit Auto-Reconnect und Ausfallsicherheit bei USB-Abbruch.
- **Echtzeit-Graph:** 60 FPS Canvas-Darstellung von Spannung (Cyan) und Strom (Emerald) mit Auto-Scaling.
- **Sicherheitssteuerung:** Output Master-Schalter, OVP/OCP-Grenzwerte.
- **Sollwert-Einstellung:** Slider, Inkrement-Buttons (+/- 0.1V, +/- 1.0V) und Direkteingabe.
- **Quick Presets:** Schnellauswahl (3.3V, 5V, 9V, 12V, 15V, 20V, 24V, 36V).
- **Datenlogger:** CSV-Export von Zeit, Spannung, Strom und Leistung.
- **Demo-/Simulationsmodus:** Testen aller Funktionen ohne physisch angeschlossene Hardware.

---

## 3. Hardware-Details
- **Gerät:** FNIRSI IPS3608 Programmable DC Power Supply
- **Schnittstelle:** USB-C (virtueller COM-Port)
- **Parameter:** 0–36V DC, 0–8.2A, max. 300W Leistung
