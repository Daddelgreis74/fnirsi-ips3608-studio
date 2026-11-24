#include "system_at32f415.h"
#include "board_ips3608.h"

static volatile uint32_t g_ms_ticks = 0U;

void SysTick_Handler(void) {
  g_ms_ticks++;
}

void board_safe_power_off(void) {
  /* Enable IOMUX + GPIOA/B/C/D/F clocks */
  CRM->apb2en |= CRM_APB2_IOMUX | CRM_APB2_GPIOA | CRM_APB2_GPIOB |
                 CRM_APB2_GPIOC | CRM_APB2_GPIOD | CRM_APB2_GPIOF;

  /* Keep SWD (PA13/PA14) active and free JTAG pins (PA15/PB3/PB4) */
  IOMUX->remap = (IOMUX->remap & ~(0x7UL << 24)) | (0x2UL << 24);

  /* Force Buck PWM outputs (PA6/PA7) LOW immediately */
  gpio_clear(BUCK_VSET_PORT, BUCK_VSET_PIN);
  gpio_clear(BUCK_ISET_PORT, BUCK_ISET_PIN);
  gpio_config_pin(BUCK_VSET_PORT, BUCK_VSET_PIN, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(BUCK_ISET_PORT, BUCK_ISET_PIN, GPIO_CFG_OUT_PP_50);

  /* Force power-stage / relay / charge-control GPIOs LOW (Stage 1 Safe Bring-Up) */
  gpio_clear(GPIOA, 8U);
  gpio_config_pin(GPIOA, 8U, GPIO_CFG_OUT_PP_50);

  gpio_clear(GPIOB, 4U);
  gpio_clear(GPIOB, 10U);
  gpio_config_pin(GPIOB, 4U, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(GPIOB, 10U, GPIO_CFG_OUT_PP_50);

  gpio_clear(GPIOC, 0U);
  gpio_clear(GPIOC, 1U);
  gpio_config_pin(GPIOC, 0U, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(GPIOC, 1U, GPIO_CFG_OUT_PP_50);

  gpio_clear(GPIOD, 2U);
  gpio_config_pin(GPIOD, 2U, GPIO_CFG_OUT_PP_50);

  gpio_clear(GPIOF, 4U);
  gpio_clear(GPIOF, 6U);
  gpio_clear(GPIOF, 7U);
  gpio_config_pin(GPIOF, 4U, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(GPIOF, 6U, GPIO_CFG_OUT_PP_50);
  gpio_config_pin(GPIOF, 7U, GPIO_CFG_OUT_PP_50);
}

void SystemInit(void) {
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
