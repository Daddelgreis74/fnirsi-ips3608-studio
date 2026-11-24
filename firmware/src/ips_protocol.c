#include "ips_protocol.h"
#include "at32f415_regs.h"
#include "system_at32f415.h"
#include "lcd_st7789.h"
#include "usb_cdc.h"

/* Frame sync & command bytes matching src/renderer/protocol.js */
#define IPS_SYNC_RX         0xF1U
#define IPS_SYNC_TX         0xF0U

#define CMD_READ            0xA1U
#define CMD_WRITE_FLOAT     0xB0U
#define CMD_WRITE_BYTE      0xB1U
#define CMD_CONFIG          0xC0U
#define CMD_CONNECT         0xC1U

#define REG_SET_VOLTAGE     0xC1U
#define REG_SET_CURRENT     0xC2U
#define REG_LIVE_VALUES     0xC3U
#define REG_TEMPERATURE     0xC4U
#define REG_OVP_LIMIT       0xD1U
#define REG_OCP_LIMIT       0xD2U
#define REG_OPP_LIMIT       0xD3U
#define REG_OTP_LIMIT       0xD4U
#define REG_LVP_LIMIT       0xD5U
#define REG_BRIGHTNESS      0xD6U
#define REG_METERING        0xD8U
#define REG_OUTPUT_STATE    0xDBU
#define REG_PROTECTION      0xDCU
#define REG_MODE            0xDDU
#define REG_MODEL           0xDEU
#define REG_SERIAL          0xDFU
#define REG_FIRMWARE        0xE0U
#define REG_MAX_VOLTAGE     0xE2U
#define REG_MAX_CURRENT     0xE3U
#define REG_ALL             0xFFU

/* Pre-encoded IEEE-754 float32 constants (avoids soft-float libgcc under -nostdlib) */
#define F32_0_0             0x00000000UL
#define F32_1_0             0x3F800000UL
#define F32_5_0             0x40A00000UL
#define F32_8_0             0x41000000UL
#define F32_8_2             0x41033333UL
#define F32_36_0            0x42100000UL
#define F32_80_0            0x42A00000UL
#define F32_300_0           0x43960000UL

#define RX_MAX_DATA_LEN     64U
#define ALL_PAYLOAD_LEN     120U

typedef enum {
  PARSE_SYNC = 0,
  PARSE_CMD,
  PARSE_REG,
  PARSE_LEN,
  PARSE_DATA,
  PARSE_CS
} parse_state_t;

static ips_state_t g_state;
static parse_state_t g_parse_state = PARSE_SYNC;
static uint8_t g_rx_cmd = 0U;
static uint8_t g_rx_reg = 0U;
static uint8_t g_rx_len = 0U;
static uint8_t g_rx_idx = 0U;
static uint8_t g_rx_data[RX_MAX_DATA_LEN];

static void write_u32_le(uint8_t *dst, uint32_t val) {
  dst[0] = (uint8_t)(val & 0xFFU);
  dst[1] = (uint8_t)((val >> 8) & 0xFFU);
  dst[2] = (uint8_t)((val >> 16) & 0xFFU);
  dst[3] = (uint8_t)((val >> 24) & 0xFFU);
}

static uint32_t read_u32_le(const uint8_t *src) {
  return (uint32_t)src[0] |
         ((uint32_t)src[1] << 8) |
         ((uint32_t)src[2] << 16) |
         ((uint32_t)src[3] << 24);
}

static void send_frame(uint8_t cmd, uint8_t reg, const uint8_t *data, uint8_t len) {
  uint8_t frame[5U + 128U];
  uint8_t sum = (uint8_t)(reg + len);

  if (len > 128U) {
    return;
  }

  frame[0] = IPS_SYNC_TX;
  frame[1] = cmd;
  frame[2] = reg;
  frame[3] = len;

  for (uint8_t i = 0U; i < len; i++) {
    uint8_t b = data[i];
    frame[4U + i] = b;
    sum = (uint8_t)(sum + b);
  }
  frame[4U + len] = sum;

  if (usb_cdc_write(frame, (uint16_t)(5U + len)) > 0U) {
    g_state.tx_packets++;
  }
}

static void send_u32_le_frame(uint8_t cmd, uint8_t reg, uint32_t val_le) {
  uint8_t buf[4];
  write_u32_le(buf, val_le);
  send_frame(cmd, reg, buf, 4U);
}

static void send_str_frame(uint8_t reg, const char *str) {
  uint8_t buf[32];
  uint8_t len = 0U;
  while ((str[len] != '\0') && (len < 32U)) {
    buf[len] = (uint8_t)str[len];
    len++;
  }
  send_frame(CMD_READ, reg, buf, len);
}

static void send_all_snapshot(const uint16_t adc_raw[ADC_CH_COUNT]) {
  uint8_t all[ALL_PAYLOAD_LEN];

  (void)adc_raw; /* Calibration & telemetry conversion added in Stage 2B */

  for (uint8_t i = 0U; i < ALL_PAYLOAD_LEN; i++) {
    all[i] = 0U;
  }

  write_u32_le(&all[0], F32_0_0);                /* inputVoltage (Stage 2B) */
  write_u32_le(&all[4], g_state.target_v_bits);  /* targetVoltage */
  write_u32_le(&all[8], g_state.target_a_bits);  /* targetCurrent */
  write_u32_le(&all[76], g_state.opp_bits);      /* oppLimit */
  write_u32_le(&all[80], g_state.ovp_bits);      /* ovpLimit */
  write_u32_le(&all[84], g_state.ocp_bits);      /* ocpLimit */
  write_u32_le(&all[88], g_state.otp_bits);      /* otpLimit */
  write_u32_le(&all[92], g_state.lvp_bits);      /* lvpLimit */

  all[107] = 0U;                                 /* outputOn: strictly OFF */
  all[108] = g_state.protection;
  all[109] = g_state.mode_cv;

  write_u32_le(&all[111], F32_36_0);             /* maxVoltage */
  write_u32_le(&all[115], F32_8_0);              /* maxCurrent */

  send_frame(CMD_READ, REG_ALL, all, ALL_PAYLOAD_LEN);
}

static void handle_frame(uint8_t cmd, uint8_t reg, const uint8_t *data, uint8_t len,
                         const uint16_t adc_raw[ADC_CH_COUNT]) {
  g_state.rx_packets++;

  /* Safety invariant: Stage 2A never enables Buck output */
  g_state.output_on = 0U;
  board_safe_power_off();

  if (cmd == CMD_CONNECT) {
    g_state.connected = ((len >= 1U) && (data[0] != 0U)) ? 1U : 0U;
    send_frame(CMD_CONNECT, reg, &g_state.connected, 1U);
    return;
  }

  if (cmd == CMD_CONFIG) {
    if ((reg == 0x00U) && (len >= 1U) && (data[0] == 0x01U)) {
      uint8_t ack = 0x01U;
      send_frame(CMD_CONFIG, 0x00U, &ack, 1U);
      delay_ms(30U);
      __asm__ volatile ("cpsid i\n\tdsb" ::: "memory");
      SCB_AIRCR = 0x05FA0004UL;
      for (;;) {
        __asm__ volatile ("nop");
      }
    }
    return;
  }

  if (cmd == CMD_READ) {
    switch (reg) {
      case REG_MODEL:       send_str_frame(reg, "IPS3608"); break;
      case REG_SERIAL:      send_str_frame(reg, "OPENFW-020"); break;
      case REG_FIRMWARE:    send_str_frame(reg, "OpenFW 0.2.0"); break;
      case REG_MAX_VOLTAGE: send_u32_le_frame(CMD_READ, reg, F32_36_0); break;
      case REG_MAX_CURRENT: send_u32_le_frame(CMD_READ, reg, F32_8_0); break;
      case REG_SET_VOLTAGE: send_u32_le_frame(CMD_READ, reg, g_state.target_v_bits); break;
      case REG_SET_CURRENT: send_u32_le_frame(CMD_READ, reg, g_state.target_a_bits); break;
      case REG_TEMPERATURE: send_u32_le_frame(CMD_READ, reg, F32_0_0); break;
      case REG_OVP_LIMIT:   send_u32_le_frame(CMD_READ, reg, g_state.ovp_bits); break;
      case REG_OCP_LIMIT:   send_u32_le_frame(CMD_READ, reg, g_state.ocp_bits); break;
      case REG_OPP_LIMIT:   send_u32_le_frame(CMD_READ, reg, g_state.opp_bits); break;
      case REG_OTP_LIMIT:   send_u32_le_frame(CMD_READ, reg, g_state.otp_bits); break;
      case REG_LVP_LIMIT:   send_u32_le_frame(CMD_READ, reg, g_state.lvp_bits); break;
      case REG_LIVE_VALUES: {
        uint8_t zero12[12];
        for (uint8_t i = 0U; i < 12U; i++) {
          zero12[i] = 0U;
        }
        send_frame(CMD_READ, REG_LIVE_VALUES, zero12, 12U);
        break;
      }
      case REG_OUTPUT_STATE: {
        uint8_t off = 0U;
        send_frame(CMD_READ, REG_OUTPUT_STATE, &off, 1U);
        break;
      }
      case REG_PROTECTION:
        send_frame(CMD_READ, REG_PROTECTION, &g_state.protection, 1U);
        break;
      case REG_MODE:
        send_frame(CMD_READ, REG_MODE, &g_state.mode_cv, 1U);
        break;
      case REG_ALL:
        send_all_snapshot(adc_raw);
        break;
      default:
        break;
    }
    return;
  }

  if ((cmd == CMD_WRITE_FLOAT) || (cmd == CMD_WRITE_BYTE)) {
    if ((reg == REG_SET_VOLTAGE) && (len >= 4U)) {
      g_state.target_v_bits = read_u32_le(data);
      send_u32_le_frame(cmd, reg, g_state.target_v_bits);
    } else if ((reg == REG_SET_CURRENT) && (len >= 4U)) {
      g_state.target_a_bits = read_u32_le(data);
      send_u32_le_frame(cmd, reg, g_state.target_a_bits);
    } else if ((reg == REG_OVP_LIMIT) && (len >= 4U)) {
      g_state.ovp_bits = read_u32_le(data);
      send_u32_le_frame(cmd, reg, g_state.ovp_bits);
    } else if ((reg == REG_OCP_LIMIT) && (len >= 4U)) {
      g_state.ocp_bits = read_u32_le(data);
      send_u32_le_frame(cmd, reg, g_state.ocp_bits);
    } else if ((reg == REG_OPP_LIMIT) && (len >= 4U)) {
      g_state.opp_bits = read_u32_le(data);
      send_u32_le_frame(cmd, reg, g_state.opp_bits);
    } else if ((reg == REG_OTP_LIMIT) && (len >= 4U)) {
      g_state.otp_bits = read_u32_le(data);
      send_u32_le_frame(cmd, reg, g_state.otp_bits);
    } else if ((reg == REG_LVP_LIMIT) && (len >= 4U)) {
      g_state.lvp_bits = read_u32_le(data);
      send_u32_le_frame(cmd, reg, g_state.lvp_bits);
    } else if ((reg == REG_BRIGHTNESS) && (len >= 1U)) {
      g_state.brightness = data[0];
      lcd_set_backlight((data[0] != 0U) ? 1U : 0U);
      send_frame(cmd, reg, &g_state.brightness, 1U);
    } else if (reg == REG_OUTPUT_STATE) {
      /* Stage 2A safety lock: reject enable request and reply OFF */
      uint8_t off = 0U;
      g_state.output_on = 0U;
      board_safe_power_off();
      send_frame(cmd, REG_OUTPUT_STATE, &off, 1U);
    } else if ((reg >= 0xC5U && reg <= 0xD0U) || (reg == REG_METERING)) {
      send_frame(cmd, reg, data, len);
    }
  }
}

void ips_protocol_init(void) {
  g_state.connected     = 0U;
  g_state.output_on     = 0U;
  g_state.mode_cv       = 1U;
  g_state.protection    = 0U;
  g_state.brightness    = 20U;
  g_state.rx_packets    = 0U;
  g_state.tx_packets    = 0U;
  g_state.target_v_bits = F32_5_0;
  g_state.target_a_bits = F32_1_0;
  g_state.ovp_bits      = F32_36_0;
  g_state.ocp_bits      = F32_8_2;
  g_state.opp_bits      = F32_300_0;
  g_state.otp_bits      = F32_80_0;
  g_state.lvp_bits      = F32_0_0;
  g_parse_state         = PARSE_SYNC;
}

void ips_protocol_poll(const uint16_t adc_raw[ADC_CH_COUNT]) {
  uint8_t buf[64];
  uint16_t n = usb_cdc_read(buf, (uint16_t)sizeof(buf));

  for (uint16_t i = 0U; i < n; i++) {
    uint8_t b = buf[i];
    switch (g_parse_state) {
      case PARSE_SYNC:
        if (b == IPS_SYNC_RX) {
          g_parse_state = PARSE_CMD;
        }
        break;
      case PARSE_CMD:
        g_rx_cmd = b;
        g_parse_state = PARSE_REG;
        break;
      case PARSE_REG:
        g_rx_reg = b;
        g_parse_state = PARSE_LEN;
        break;
      case PARSE_LEN:
        g_rx_len = b;
        g_rx_idx = 0U;
        if (g_rx_len > RX_MAX_DATA_LEN) {
          g_parse_state = PARSE_SYNC;
        } else if (g_rx_len == 0U) {
          g_parse_state = PARSE_CS;
        } else {
          g_parse_state = PARSE_DATA;
        }
        break;
      case PARSE_DATA:
        g_rx_data[g_rx_idx++] = b;
        if (g_rx_idx >= g_rx_len) {
          g_parse_state = PARSE_CS;
        }
        break;
      case PARSE_CS: {
        uint8_t sum = (uint8_t)(g_rx_reg + g_rx_len);
        for (uint8_t j = 0U; j < g_rx_len; j++) {
          sum = (uint8_t)(sum + g_rx_data[j]);
        }
        g_parse_state = PARSE_SYNC;
        if (sum == b) {
          handle_frame(g_rx_cmd, g_rx_reg, g_rx_data, g_rx_len, adc_raw);
        }
        break;
      }
      default:
        g_parse_state = PARSE_SYNC;
        break;
    }
  }
}

const ips_state_t *ips_protocol_state(void) {
  return &g_state;
}
