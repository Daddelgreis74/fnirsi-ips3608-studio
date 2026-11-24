#include "adc_monitor.h"
#include "system_at32f415.h"

static void adc_set_sample_time_max(uint8_t ch) {
  if (ch < 10U) {
    uint32_t shift = (uint32_t)ch * 3U;
    ADC1->spt2 = (ADC1->spt2 & ~(0x7UL << shift)) | (0x7UL << shift);
  } else {
    uint32_t shift = (uint32_t)(ch - 10U) * 3U;
    ADC1->spt1 = (ADC1->spt1 & ~(0x7UL << shift)) | (0x7UL << shift);
  }
}

void adc_monitor_init(void) {
  CRM->apb2en |= CRM_APB2_ADC1 | CRM_APB2_GPIOA | CRM_APB2_GPIOC;

  /* Configure all 6 verified analog input pins */
  gpio_config_pin(GPIOA, 2U, GPIO_CFG_ANALOG);
  gpio_config_pin(GPIOA, 3U, GPIO_CFG_ANALOG);
  gpio_config_pin(GPIOA, 4U, GPIO_CFG_ANALOG);
  gpio_config_pin(GPIOC, 3U, GPIO_CFG_ANALOG);
  gpio_config_pin(GPIOC, 4U, GPIO_CFG_ANALOG);
  gpio_config_pin(GPIOC, 5U, GPIO_CFG_ANALOG);

  /* Power off first to cleanly configure single-channel software-triggered reads */
  ADC1->ctrl2 = 0UL;
  ADC1->ctrl1 = 0UL;

  /* Enable ADC + software trigger selection (OCTESEL=111, OCTEN=1) */
  ADC1->ctrl2 = (1UL << 0) | (0x7UL << 17) | (1UL << 20);
  delay_ms(2U);

  /* Reset and run internal ADC1 calibration */
  ADC1->ctrl2 |= (1UL << 3);
  while ((ADC1->ctrl2 & (1UL << 3)) != 0UL) {
  }
  ADC1->ctrl2 |= (1UL << 2);
  while ((ADC1->ctrl2 & (1UL << 2)) != 0UL) {
  }

  /* 239.5 cycles sample time matching V1.9 configuration */
  adc_set_sample_time_max(ADC_CH_PC3);
  adc_set_sample_time_max(ADC_CH_PA2);
  adc_set_sample_time_max(ADC_CH_PA3);
  adc_set_sample_time_max(ADC_CH_PA4);
  adc_set_sample_time_max(ADC_CH_PC4);
  adc_set_sample_time_max(ADC_CH_PC5);
}

uint16_t adc_read_channel(uint8_t ch) {
  ADC1->osq1 = 0UL; /* 1 conversion in ordinary sequence */
  ADC1->osq3 = (uint32_t)(ch & 0x1FU);
  ADC1->sts  = 0UL;
  ADC1->ctrl2 |= (1UL << 22); /* OCSWTRG */

  for (uint32_t guard = 0U; guard < 100000UL; guard++) {
    if ((ADC1->sts & (1UL << 1)) != 0UL) {
      return (uint16_t)(ADC1->odt & 0x0FFFU);
    }
  }
  return 0U;
}

void adc_read_all(uint16_t out[ADC_CH_COUNT]) {
  static const uint8_t k_channels[ADC_CH_COUNT] = {
    ADC_CH_PC3, ADC_CH_PA2, ADC_CH_PA3, ADC_CH_PA4, ADC_CH_PC4, ADC_CH_PC5
  };
  for (uint8_t i = 0U; i < ADC_CH_COUNT; i++) {
    out[i] = adc_read_channel(k_channels[i]);
  }
}
