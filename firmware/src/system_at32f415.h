#ifndef SYSTEM_AT32F415_H
#define SYSTEM_AT32F415_H

#include <stdint.h>

void SystemInit(void);
void SysTick_Handler(void);
uint32_t millis(void);
void delay_ms(uint32_t ms);
void board_safe_power_off(void);

#endif /* SYSTEM_AT32F415_H */
