#include "usart_diag.h"
#include "board_ips3608.h"

void usart_diag_init(void) {
  CRM->apb2en |= CRM_APB2_USART1 | CRM_APB2_GPIOA;

  gpio_config_pin(DIAG_TX_PORT, DIAG_TX_PIN, GPIO_CFG_MUX_PP_50);
  gpio_config_pin(DIAG_RX_PORT, DIAG_RX_PIN, GPIO_CFG_IN_FLOAT);

  USART1->ctrl1 = 0UL;
  USART1->ctrl2 = 0UL;
  USART1->ctrl3 = 0UL;
  /* 115200 baud at 72 MHz PCLK2 */
  USART1->baudr = (APB2_HZ + 57600UL) / 115200UL;
  USART1->ctrl1 = (1UL << 13) | (1UL << 3); /* UEN | TEN */
}

void usart_putc(char c) {
  while ((USART1->sts & (1UL << 7)) == 0UL) { /* Wait TDBE */
  }
  USART1->dt = (uint8_t)c;
}

void usart_puts(const char *s) {
  while (*s != '\0') {
    if (*s == '\n') {
      usart_putc('\r');
    }
    usart_putc(*s++);
  }
}

void usart_put_u32(uint32_t v) {
  char buf[11];
  uint8_t idx = 0U;
  if (v == 0U) {
    usart_putc('0');
    return;
  }
  while (v > 0U && idx < 10U) {
    buf[idx++] = (char)('0' + (v % 10U));
    v /= 10U;
  }
  while (idx > 0U) {
    usart_putc(buf[--idx]);
  }
}
