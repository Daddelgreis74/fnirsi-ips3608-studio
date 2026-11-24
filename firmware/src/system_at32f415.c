#include "system_at32f415.h"
#include "board_ips3608.h"

static volatile uint32_t g_ms_ticks = 0U;

void SysTick_Handler(void) {
  g_ms_ticks++;
}

static void crm_reset_to_hick(void) {
  /* Unlock internal clock / LDO configuration matching V1.9 SystemInit (0x08012180) */
  CRM->apb1en |= CRM_APB1_PWC;
  PWC_LDOOV |= 0x04U;
  CRM->apb1en &= ~CRM_APB1_PWC;

  /* Ensure 8 MHz HICK is enabled and stable */
  CRM->ctrl |= (1UL << 0);
  while ((CRM->ctrl & (1UL << 1)) == 0UL) {
  }

  /* Switch SCLK back to HICK before disabling bootloader PLL/HEXT */
  CRM->cfg &= ~0x03UL;
  while ((CRM->cfg & 0x0CUL) != 0UL) {
  }

  CRM->ctrl &= 0xFEF2FFFFUL;
  CRM->cfg = 0UL;
  CRM->misc1 = 0x00001F10UL;
  CRM->misc2 = 0x00100000UL;
  CRM->clkint = 0x009F0000UL;
}

void board_safe_power_off(void) {
  /* Enable IOMUX + GPIOA/B/C/D/F clocks */
  CRM->apb2en |= CRM_APB2_IOMUX | CRM_APB2_GPIOA | CRM_APB2_GPIOB |
                 CRM_APB2_GPIOC | CRM_APB2_GPIOD | CRM_APB2_GPIOF;

  /* Keep SWD (PA13/PA14) active and free JTAG pins (PA15/PB3/PB4) */
  IOMUX->remap = (IOMUX->remap & ~(0x7UL << 24)) | (0x2UL << 24);

  /* Latch system power rail ON (PB0 = HIGH, matching V1.9 @ 0x08016DF2) */
  gpio_set(PWR_HOLD_PORT, PWR_HOLD_PIN);
  gpio_config_pin(PWR_HOLD_PORT, PWR_HOLD_PIN, GPIO_CFG_OUT_PP_50);

  /* Force Buck PWM outputs (PA6/PA7) LOW immediately */
  gpio_clear(BUCK_VSET_PORT, BUCK_VSET_PIN);
  gpio_clear(BUCK_ISET_PORT, BUCK_ISET_PIN);
  gpio_config_pin(BUCK_VSET_PORT, BUCK_VSET_PIN, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(BUCK_ISET_PORT, BUCK_ISET_PIN, GPIO_CFG_OUT_PP_50);

  /* Force power-stage / buzzer / fan GPIOs to safe OFF state (Stage 1 Safe Bring-Up) */
  gpio_clear(GPIOA, 8U);
  gpio_config_pin(GPIOA, 8U, GPIO_CFG_OUT_PP_50);

  gpio_clear(GPIOB, 4U);
  gpio_clear(BUZZER_PORT, BUZZER_PIN);
  gpio_clear(FAN_PORT, FAN_PIN);
  gpio_clear(BUCK_EN_PORT, BUCK_EN_PIN);
  gpio_config_pin(GPIOB, 4U, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(BUZZER_PORT, BUZZER_PIN, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(FAN_PORT, FAN_PIN, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(BUCK_EN_PORT, BUCK_EN_PIN, GPIO_CFG_OUT_PP_50);

  gpio_clear(GPIOC, 0U);
  gpio_clear(GPIOC, 1U);
  gpio_config_pin(GPIOC, 0U, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(GPIOC, 1U, GPIO_CFG_OUT_PP_50);

  gpio_clear(GPIOD, 2U);
  gpio_config_pin(GPIOD, 2U, GPIO_CFG_OUT_PP_50);

  /* PF4 & PF7 HIGH, PF6 LOW matches V1.9 output_off() @ 0x0800FB8C */
  gpio_set(GPIOF, 4U);
  gpio_clear(GPIOF, 6U);
  gpio_set(GPIOF, 7U);
  gpio_config_pin(GPIOF, 4U, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(GPIOF, 6U, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(GPIOF, 7U, GPIO_CFG_OUT_PP_50);
}

void SystemInit(void) {
  crm_reset_to_hick();

  /* Force safe power-off state before initializing peripherals */
  board_safe_power_off();

  /* Configure SysTick for 1 ms tick using 8 MHz HICK */
  SYSTICK->load = (SYSCLK_HZ / 1000UL) - 1UL;
  SYSTICK->val  = 0UL;
  SYSTICK->ctrl = 0x07UL;
}

uint32_t millis(void) {
  return g_ms_ticks;
}

void delay_ms(uint32_t ms) {
  uint32_t start = millis();
  while ((millis() - start) < ms) {
    __asm__ volatile ("nop");
  }
}
