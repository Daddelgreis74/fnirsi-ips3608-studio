#include "board_ips3608.h"
#include "system_at32f415.h"
#include "lcd_st7789.h"
#include "adc_monitor.h"
#include "usart_diag.h"

static void inputs_init(void) {
  CRM->apb2en |= CRM_APB2_GPIOB | CRM_APB2_GPIOC | CRM_APB2_GPIOF;
  gpio_config_input_pu(ENC_A_PORT, ENC_A_PIN);
  gpio_config_input_pu(ENC_B_PORT, ENC_B_PIN);
  gpio_config_input_pu(KEY_PB1_PORT, KEY_PB1_PIN);
  gpio_config_input_pu(KEY_PB11_PORT, KEY_PB11_PIN);
  gpio_config_input_pu(KEY_PF5_PORT, KEY_PF5_PIN);
}

static void fmt_u32_fixed(char *dst, uint32_t v, uint8_t digits) {
  for (uint8_t i = digits; i > 0U; i--) {
    dst[i - 1U] = (char)('0' + (v % 10U));
    v /= 10U;
  }
  dst[digits] = '\0';
}

static char pin_state_char(const GPIO_TypeDef *port, uint8_t pin) {
  /* Pull-up inputs read 0 when pressed */
  return (gpio_read(port, pin) == 0U) ? '0' : '1';
}

static void draw_static_layout(void) {
  lcd_fill_rect(0U, 0U, LCD_WIDTH, LCD_HEIGHT, COLOR_BG);

  /* Header Bar */
  lcd_fill_rect(0U, 0U, LCD_WIDTH, 32U, COLOR_HEADER);
  lcd_draw_string(10U, 9U, "IPS3608 OPEN FW v0.1.0", COLOR_CYAN, COLOR_HEADER, 2U);

  /* Safety Banner */
  lcd_fill_rect(8U, 40U, LCD_WIDTH - 16U, 26U, COLOR_SAFE_BG);
  lcd_draw_string(16U, 46U, "SAFE: AUSGANG AUS (v0.1)", COLOR_WHITE, COLOR_SAFE_BG, 2U);

  lcd_draw_string(10U, 74U, "MCU: AT32F415CCT7 (8MHz HICK)", COLOR_MUTED, COLOR_BG, 1U);
  lcd_draw_string(10U, 92U, "ADC1 Rohwerte (0..4095):", COLOR_AMBER, COLOR_BG, 1U);

  lcd_draw_string(10U, 108U, "CH0 PC3 (IN13):", COLOR_WHITE, COLOR_BG, 1U);
  lcd_draw_string(10U, 122U, "CH1 PA2 (IN2) :", COLOR_WHITE, COLOR_BG, 1U);
  lcd_draw_string(10U, 136U, "CH2 PA3 (IN3) :", COLOR_WHITE, COLOR_BG, 1U);

  lcd_draw_string(166U, 108U, "CH3 PA4 (IN4) :", COLOR_WHITE, COLOR_BG, 1U);
  lcd_draw_string(166U, 122U, "CH4 PC4 (IN14):", COLOR_WHITE, COLOR_BG, 1U);
  lcd_draw_string(166U, 136U, "CH5 PC5 (IN15):", COLOR_WHITE, COLOR_BG, 1U);

  lcd_draw_string(10U, 160U, "Eingaenge (Pull-Up, 0=Aktiv):", COLOR_AMBER, COLOR_BG, 1U);
  lcd_draw_string(10U, 176U, "ENC PC7/PC8:", COLOR_WHITE, COLOR_BG, 1U);
  lcd_draw_string(110U, 176U, "TASTEN PB1/PB11/PF5:", COLOR_WHITE, COLOR_BG, 1U);

  lcd_draw_string(10U, 206U, "Flash >= 0x08006800 | Cal 0x0803F000 OK", COLOR_GREEN, COLOR_BG, 1U);
  lcd_draw_string(10U, 222U, "Bootloader: Obere Taste + Einschalten", COLOR_MUTED, COLOR_BG, 1U);
}

int main(void) {
  uint16_t adc[ADC_CH_COUNT];
  char num[8];
  char io_str[16];
  uint32_t last_refresh = 0U;
  uint32_t loop_count = 0U;

  board_safe_power_off();
  usart_diag_init();
  usart_puts("\n=== IPS3608 OPEN FW v0.1.0 (Stage 1 Safe Bring-Up) ===\n");
  usart_puts("Buck PWM (PA6/PA7) & Power-Enable Pins forced LOW.\n");

  inputs_init();
  adc_monitor_init();
  lcd_init();
  draw_static_layout();

  for (;;) {
    uint32_t now = millis();
    if ((now - last_refresh) >= 200U) {
      last_refresh = now;
      board_safe_power_off();
      adc_read_all(adc);

      for (uint8_t i = 0U; i < 3U; i++) {
        fmt_u32_fixed(num, adc[i], 4U);
        lcd_draw_string(108U, (uint16_t)(108U + i * 14U), num, COLOR_CYAN, COLOR_BG, 1U);
      }
      for (uint8_t i = 0U; i < 3U; i++) {
        fmt_u32_fixed(num, adc[i + 3U], 4U);
        lcd_draw_string(264U, (uint16_t)(108U + i * 14U), num, COLOR_CYAN, COLOR_BG, 1U);
      }

      /* Live encoder and button states */
      io_str[0] = pin_state_char(ENC_A_PORT, ENC_A_PIN);
      io_str[1] = '/';
      io_str[2] = pin_state_char(ENC_B_PORT, ENC_B_PIN);
      io_str[3] = '\0';
      lcd_draw_string(84U, 176U, io_str, COLOR_GREEN, COLOR_BG, 1U);

      io_str[0] = pin_state_char(KEY_PB1_PORT, KEY_PB1_PIN);
      io_str[1] = '/';
      io_str[2] = pin_state_char(KEY_PB11_PORT, KEY_PB11_PIN);
      io_str[3] = '/';
      io_str[4] = pin_state_char(KEY_PF5_PORT, KEY_PF5_PIN);
      io_str[5] = '\0';
      lcd_draw_string(234U, 176U, io_str, COLOR_GREEN, COLOR_BG, 1U);

      if ((loop_count % 5U) == 0U) {
        usart_puts("ADC1:");
        for (uint8_t i = 0U; i < ADC_CH_COUNT; i++) {
          usart_putc(' ');
          usart_put_u32(adc[i]);
        }
        usart_putc('\n');
      }
      loop_count++;
    }
  }
}
