#ifndef AT32F415_REGS_H
#define AT32F415_REGS_H

#include <stdint.h>

typedef struct {
  volatile uint32_t ctrl;
  volatile uint32_t cfg;
  volatile uint32_t clkint;
  volatile uint32_t apb2rst;
  volatile uint32_t apb1rst;
  volatile uint32_t ahben;
  volatile uint32_t apb2en;
  volatile uint32_t apb1en;
  volatile uint32_t bpdc;
  volatile uint32_t ctrlsts;
  volatile uint32_t ahbrst;
  volatile uint32_t misc1;
  volatile uint32_t misc2;
} CRM_TypeDef;

typedef struct {
  volatile uint32_t evtout;
  volatile uint32_t remap;
  volatile uint32_t exintc[4];
} IOMUX_TypeDef;

typedef struct {
  volatile uint32_t cfglr;
  volatile uint32_t cfghr;
  volatile uint32_t idt;
  volatile uint32_t odt;
  volatile uint32_t scr;
  volatile uint32_t clr;
  volatile uint32_t wpr;
} GPIO_TypeDef;

typedef struct {
  volatile uint32_t ctrl1;
  volatile uint32_t ctrl2;
  volatile uint32_t sts;
  volatile uint32_t dt;
  volatile uint32_t cpoly;
  volatile uint32_t rcrc;
  volatile uint32_t tcrc;
  volatile uint32_t i2sctrl;
  volatile uint32_t i2sclk;
} SPI_TypeDef;

typedef struct {
  volatile uint32_t sts;
  volatile uint32_t ctrl1;
  volatile uint32_t ctrl2;
  volatile uint32_t spt1;
  volatile uint32_t spt2;
  volatile uint32_t pcdto1;
  volatile uint32_t pcdto2;
  volatile uint32_t pcdto3;
  volatile uint32_t pcdto4;
  volatile uint32_t vmhb;
  volatile uint32_t vmlb;
  volatile uint32_t osq1;
  volatile uint32_t osq2;
  volatile uint32_t osq3;
  volatile uint32_t psq;
  volatile uint32_t pdt1;
  volatile uint32_t pdt2;
  volatile uint32_t pdt3;
  volatile uint32_t pdt4;
  volatile uint32_t odt;
} ADC_TypeDef;

typedef struct {
  volatile uint32_t sts;
  volatile uint32_t dt;
  volatile uint32_t baudr;
  volatile uint32_t ctrl1;
  volatile uint32_t ctrl2;
  volatile uint32_t ctrl3;
  volatile uint32_t gdiv;
} USART_TypeDef;

typedef struct {
  volatile uint32_t ctrl;
  volatile uint32_t load;
  volatile uint32_t val;
  volatile uint32_t calib;
} SysTick_TypeDef;

#define CRM             ((CRM_TypeDef *)0x40021000UL)
#define IOMUX           ((IOMUX_TypeDef *)0x40010000UL)
#define GPIOA           ((GPIO_TypeDef *)0x40010800UL)
#define GPIOB           ((GPIO_TypeDef *)0x40010C00UL)
#define GPIOC           ((GPIO_TypeDef *)0x40011000UL)
#define GPIOD           ((GPIO_TypeDef *)0x40011400UL)
#define GPIOF           ((GPIO_TypeDef *)0x40011C00UL)
#define SPI2            ((SPI_TypeDef *)0x40003800UL)
#define ADC1            ((ADC_TypeDef *)0x40012400UL)
#define USART1          ((USART_TypeDef *)0x40013800UL)
#define SYSTICK         ((SysTick_TypeDef *)0xE000E010UL)

#define SCB_VTOR        (*(volatile uint32_t *)0xE000ED08UL)
#define SCB_CPACR       (*(volatile uint32_t *)0xE000ED88UL)
#define PWC_LDOOV       (*(volatile uint8_t *)0x40007050UL)

/* CRM APB2EN bits */
#define CRM_APB2_IOMUX  (1UL << 0)
#define CRM_APB2_GPIOA  (1UL << 2)
#define CRM_APB2_GPIOB  (1UL << 3)
#define CRM_APB2_GPIOC  (1UL << 4)
#define CRM_APB2_GPIOD  (1UL << 5)
#define CRM_APB2_GPIOF  (1UL << 7)
#define CRM_APB2_ADC1   (1UL << 9)
#define CRM_APB2_USART1 (1UL << 14)

/* CRM APB1EN bits */
#define CRM_APB1_SPI2   (1UL << 14)
#define CRM_APB1_PWC    (1UL << 28)

/* GPIO 4-bit CFGLR/CFGHR nibbles */
#define GPIO_CFG_ANALOG    0x0U
#define GPIO_CFG_OUT_PP_50 0x3U
#define GPIO_CFG_IN_FLOAT  0x4U
#define GPIO_CFG_IN_PUPD   0x8U
#define GPIO_CFG_MUX_PP_50 0xBU

static inline void gpio_config_pin(GPIO_TypeDef *gpio, uint8_t pin, uint8_t cfg4) {
  volatile uint32_t *reg = (pin < 8U) ? &gpio->cfglr : &gpio->cfghr;
  uint32_t shift = (uint32_t)(pin & 7U) * 4U;
  uint32_t val = *reg;
  val &= ~(0xFUL << shift);
  val |= ((uint32_t)(cfg4 & 0xFU) << shift);
  *reg = val;
}

static inline void gpio_set(GPIO_TypeDef *gpio, uint8_t pin) {
  gpio->scr = (1UL << pin);
}

static inline void gpio_clear(GPIO_TypeDef *gpio, uint8_t pin) {
  gpio->clr = (1UL << pin);
}

static inline void gpio_config_input_pu(GPIO_TypeDef *gpio, uint8_t pin) {
  gpio_config_pin(gpio, pin, GPIO_CFG_IN_PUPD);
  gpio->scr = (1UL << pin);
}

static inline uint8_t gpio_read(const GPIO_TypeDef *gpio, uint8_t pin) {
  return (uint8_t)((gpio->idt >> pin) & 1U);
}

#endif /* AT32F415_REGS_H */
