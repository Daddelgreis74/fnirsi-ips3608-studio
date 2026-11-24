# FNIRSI IPS3608 – Reverse-Engineered Hardware Pinout & Memory Map

Ermittelt durch statische Disassembly-Analyse der offiziellen Firmware **`APP_IPS3608_V1.9_260429.bin`** (`156.472 Bytes`, unverschlüsselt, ARM Cortex-M4F Thumb-2).

---

## 1. MCU & Speicheraufteilung

- **MCU:** Artery **`AT32F415CCT7`** (ARM Cortex-M4F, 256 KB Flash, 32 KB SRAM)
  - Bestätigt über Vector Table (`IRQ 67 = OTGFS1`, `IRQ 52 = UART4`), `GPIOF` (`0x40011C00`) sowie `CRM` (`0x40021000`) / `IOMUX` (`0x40010000`).
- **SRAM:** `0x20000000 – 0x20007FFF` (`32 KB`, Initial MSP = `0x20007FF0` in V1.9)

### Flash-Map (256 KB)

| Adresse | Größe | Bereich | Hinweis |
| :--- | :--- | :--- | :--- |
| `0x08000000 – 0x080067FF` | `26 KB` | USB-MSC Bootloader | Geschützt, bleibt beim Drag-&-Drop-Flash unangetastet |
| `0x08006800 – 0x08006983` | `388 B` | Application Vector Table | `SCB->VTOR = 0x08006800` |
| `0x08006984 – 0x0802CB37` | `~153 KB` | Stock V1.9 App + Assets | Referenz-Image |
| `0x08006800 – 0x0803EFFF` | **`226 KB`** | **Open-Source App Region** | Maximales Linker-Limit (`at32f415cct7_app.ld`) |
| `0x0803F000 – 0x0803FFFF` | `4 KB` | Werkskalibrierung & Settings | Referenzen bei `0x0803FC00` / `0x0803FCC8` – **niemals überschreiben!** |

---

## 2. Verifizierte Pinbelegung (aus V1.9 Init-Funktionen)

### 2.1 IPS-Farbdisplay (`SPI2` + `ST7789V`, 320×240 RGB565)

| Signal | Pin | Port / Modus | V1.9 Fundstelle |
| :--- | :--- | :--- | :--- |
| **SCK** | `PB13` | `GPIOB` `MUX_PP` (50 MHz) | `0x080194E8` |
| **MOSI (SDA)** | `PB15` | `GPIOB` `MUX_PP` (50 MHz) | `0x08019550` |
| **CS** | `PB12` | `GPIOB` `OUT_PP` | `0x0800EF1A` |
| **DC / RS** | `PC6` | `GPIOC` `OUT_PP` (`0=CMD`, `1=DATA`) | `0x0800EF08`, `0x0800F454`, `0x0800F4BC` |
| **RESET** | `PA0` | `GPIOA` `OUT_PP` | `0x0800EF2E` |
| **Backlight (PWM)** | `PB8` | `GPIOB` `TMR4_CH3` (`0..1000`, aktiv HIGH) | `0x080165DC`, `0x0800D830` |
| **DMA** | `DMA1_Ch5` | `IRQ 15` | SPI2 TX Framebuffer |

Verifizierte `ST7789V`-Init-Kommandos aus `0x0800EF84–0x0800F104`: `0x11` (SLPOUT), `0x36` (MADCTL), `0x3A=0x05` (16-bit RGB565), `0xB2`, `0xB7=0x35`, `0xBB=0x28`, `0xC0=0x2C`, `0xC2`, `0xC3=0x0B`, `0xC4=0x20`, `0xC6=0x0F`, `0xD0={0xA4,0xA1}`, `0xE0`, `0xE1`, `0x29` (DISPON).

### 2.2 Leistungsstufe & Analog-Messung (`ADC1` + `TMR3` / `TMR1` / `TMR4` / `TMR10`)

| Funktion | Peripherie | Pins / Kanäle | V1.9 Fundstelle |
| :--- | :--- | :--- | :--- |
| **Buck Vset / Iset PWM** | `TMR3` (`CH1`, `CH2`) | `PA6` (`CH1`), `PA7` (`CH2`) | `0x0801A7EC`, `0x08008B00`, `0x08008B80` |
| **ADC-Scan-Sequenz (6 Kanäle)** | `ADC1` + `DMA1_Ch1` (`IRQ 11`) | Rank 1: `IN13` (`PC3`)<br>Rank 2: `IN2` (`PA2`)<br>Rank 3: `IN3` (`PA3`)<br>Rank 4: `IN4` (`PA4`)<br>Rank 5: `IN14` (`PC4`)<br>Rank 6: `IN15` (`PC5`) | `0x0800774E–0x0800787A` (je `239.5` Zyklen) |
| **ADC-Hardware-Trigger** | `TMR1` (`CH2`) | intern | `0x0801BA4A` (`ARR=1`, `CCR2=1`) |
| **Buzzer / Backlight / Fan PWM** | `TMR4` (`CH1`, `CH3`, `CH4`) | `PB6` (Buzzer), `PB8` (Backlight), `PB9` (Lüfter) | `0x080087BA–0x080088A8`, `0x08016590–0x08016620` |
| **Regeltakt / System-Timer** | `TMR10` (`IRQ 25`) | intern (`ARR=9999`) | `0x0801BAEC` |

> *Hinweis für Stufe 2:* Die exakte Zuordnung der 6 ADC-Kanäle zu `Vin / Vout / Iout / Temp / Aux` wird im nächsten Schritt live mit dem Safe Bring-Up + V1.9-Regelkreis-Disassembly verifiziert, bevor `TMR3` oder `PB10` (`BUCK_EN`) aktiviert wird.

### 2.3 Bedienelemente & Steuer-GPIOs

| Funktion | Pins | Konfiguration in V1.9 | V1.9 Fundstelle |
| :--- | :--- | :--- | :--- |
| **Drehgeber (Encoder)** | `PC7`, `PC8` | Input Pull-Up (`EXINT9_5` auf `PC7`) | `0x0800D1A8` |
| **Tasten / Encoder-Switch** | `PB1` (`IRQ 7`), `PB11` (`IRQ 40`), `PF5` (`IRQ 23`) | Input Pull-Up (`EXINT`) | `0x0800DB0C–0x0800DB5E` |
| **Power-Hold (Systemspannung)** | `PB0` | Output Push-Pull **HIGH** beim Boot | `0x08016DF2` |
| **Ausgang AUS (`output_off`)** | `PB10` (LOW), `PF4` (HIGH), `PF7` (HIGH) | Push-Pull Outputs | `0x0800FB8C` |
| **Weitere Steuer-Outputs** | `PF6`, `PB4`, `PA8`, `PD2`, `PC0`, `PC1` | Push-Pull Outputs | `0x08016D44–0x08016E7A` |
| **Soft-I²C / Aux-Bus** | `PB7`, `PC2` | Push-Pull Outputs (init High) | `0x08019D40–0x08019DB2` |
| **Debug / JTAG-Remap** | `PA15`, `PB4` | `IOMUX 0x30100302` (`SWJTAG_MUX=010`, SWD `PA13/PA14` bleibt aktiv) | `0x0800EA1C`, `0x08016E98` |

### 2.4 Schnittstellen

| Schnittstelle | Peripherie | Pins / Parameter | V1.9 Fundstelle |
| :--- | :--- | :--- | :--- |
| **USB-CDC (Studio-Host)** | `OTGFS1` (`IRQ 67`) | `PA11` (D−), `PA12` (D+), VID `0x2E3C`, PID `0x5740` | Vektor `0x14C`, String `0x26203` |
| **USART1** | `USART1` (`IRQ 37`) | `PA9` (TX), `PA10` (RX), `9600` Baud in V1.9 | `0x08008958`, `0x0801BF74` |
| **UART4** | `UART4` (`IRQ 52`) | `PC10` / `PC11` (oder gemultiplext) | Vektor `0x110`, `0x08012545` |
