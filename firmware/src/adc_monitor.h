#ifndef ADC_MONITOR_H
#define ADC_MONITOR_H

#include <stdint.h>
#include "board_ips3608.h"

void adc_monitor_init(void);
uint16_t adc_read_channel(uint8_t ch);
void adc_read_all(uint16_t out[ADC_CH_COUNT]);

#endif /* ADC_MONITOR_H */
