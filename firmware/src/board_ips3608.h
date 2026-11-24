#ifndef BOARD_IPS3608_H
#define BOARD_IPS3608_H

#include "at32f415_regs.h"

/* System clock: safe 8 MHz internal HICK oscillator for Stage 1 Bring-Up */
#define SYSCLK_HZ           8000000UL

/* IPS LCD (ST7789V 320x240 via SPI2) */
#define LCD_WIDTH           320U
#define LCD_HEIGHT          240U
#define LCD_MADCTL_DEFAULT  0x70U   /* Landscape MV | MX | ML */

#define LCD_SCK_PORT        GPIOB
#define LCD_SCK_PIN         13U
#define LCD_MOSI_PORT       GPIOB
#define LCD_MOSI_PIN        15U
#define LCD_CS_PORT         GPIOB
#define LCD_CS_PIN          12U
#define LCD_DC_PORT         GPIOC
#define LCD_DC_PIN          6U
#define LCD_RST_PORT        GPIOA
#define LCD_RST_PIN         0U
#define LCD_BL_PORT         GPIOB
#define LCD_BL_PIN          8U      /* TMR4_CH3 backlight PWM in V1.9 (active HIGH) */

/* Power-Hold, Output-Enable, Buzzer & Fan */
#define PWR_HOLD_PORT       GPIOB
#define PWR_HOLD_PIN        0U      /* Driven HIGH by V1.9 at startup */
#define BUCK_EN_PORT        GPIOB
#define BUCK_EN_PIN         10U     /* LOW = Buck output OFF */
#define BUZZER_PORT         GPIOB
#define BUZZER_PIN          6U      /* TMR4_CH1 buzzer PWM */
#define FAN_PORT            GPIOB
#define FAN_PIN             9U      /* TMR4_CH4 fan PWM */

/* Buck PWM pins (forced LOW in Stage 1 Safe Bring-Up) */
#define BUCK_VSET_PORT      GPIOA
#define BUCK_VSET_PIN       6U      /* TMR3_CH1 */
#define BUCK_ISET_PORT      GPIOA
#define BUCK_ISET_PIN       7U      /* TMR3_CH2 */

/* Verified ADC1 channels (Rank 1..6 scan order from V1.9 @ 0x08007832) */
#define ADC_CH_COUNT        6U
#define ADC_CH_PC3          13U
#define ADC_CH_PA2          2U
#define ADC_CH_PA3          3U
#define ADC_CH_PA4          4U
#define ADC_CH_PC4          14U
#define ADC_CH_PC5          15U

/* Front-panel encoder & keys (active LOW with pull-up) */
#define ENC_A_PORT          GPIOC
#define ENC_A_PIN           7U
#define ENC_B_PORT          GPIOC
#define ENC_B_PIN           8U
#define KEY_PB1_PORT        GPIOB
#define KEY_PB1_PIN         1U
#define KEY_PB11_PORT       GPIOB
#define KEY_PB11_PIN        11U
#define KEY_PF5_PORT        GPIOF
#define KEY_PF5_PIN         5U

/* USART1 diagnostic port */
#define DIAG_TX_PORT        GPIOA
#define DIAG_TX_PIN         9U
#define DIAG_RX_PORT        GPIOA
#define DIAG_RX_PIN         10U

#endif /* BOARD_IPS3608_H */
