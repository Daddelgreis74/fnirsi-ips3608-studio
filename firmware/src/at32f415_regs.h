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
#define SCB_AIRCR       (*(volatile uint32_t *)0xE000ED0CUL)
#define SCB_CPACR       (*(volatile uint32_t *)0xE000ED88UL)
#define NVIC_ISER2      (*(volatile uint32_t *)0xE000E108UL)
#define FLASH_PSR       (*(volatile uint32_t *)0x40022000UL)
#define PWC_LDOOV       (*(volatile uint8_t *)0x40007050UL)

/* CRM AHBEN / AHBRST bits */
#define CRM_AHB_OTGFS1  (1UL << 12)

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

/* --------------------------------------------------------------------------
 * OTGFS1 (Synopsys DWC2 Full-Speed USB OTG Controller @ 0x50000000)
 * -------------------------------------------------------------------------- */
#define OTGFS1_BASE         0x50000000UL
#define OTGFS1_IRQn         67U

typedef struct {
  volatile uint32_t gotgctl;       /* 0x000 */
  volatile uint32_t gotgint;       /* 0x004 */
  volatile uint32_t gahbcfg;       /* 0x008 */
  volatile uint32_t gusbcfg;       /* 0x00C */
  volatile uint32_t grstctl;       /* 0x010 */
  volatile uint32_t gintsts;       /* 0x014 */
  volatile uint32_t gintmsk;       /* 0x018 */
  volatile uint32_t grxstsr;       /* 0x01C */
  volatile uint32_t grxstsp;       /* 0x020 */
  volatile uint32_t grxfsiz;       /* 0x024 */
  volatile uint32_t dieptxf0;      /* 0x028 */
  volatile uint32_t hnptxsts;      /* 0x02C */
  volatile uint32_t reserved0[2];  /* 0x030..0x034 */
  volatile uint32_t gccfg;         /* 0x038 */
  volatile uint32_t guid;          /* 0x03C */
  volatile uint32_t reserved1[48]; /* 0x040..0x0FC */
  volatile uint32_t hptxfsiz;      /* 0x100 */
  volatile uint32_t dieptxf1;      /* 0x104 */
  volatile uint32_t dieptxf2;      /* 0x108 */
  volatile uint32_t dieptxf3;      /* 0x10C */
} OTGFS_Global_TypeDef;

typedef struct {
  volatile uint32_t dcfg;          /* 0x800 */
  volatile uint32_t dctl;          /* 0x804 */
  volatile uint32_t dsts;          /* 0x808 */
  volatile uint32_t reserved0;     /* 0x80C */
  volatile uint32_t diepmsk;       /* 0x810 */
  volatile uint32_t doepmsk;       /* 0x814 */
  volatile uint32_t daint;         /* 0x818 */
  volatile uint32_t daintmsk;      /* 0x81C */
  volatile uint32_t reserved1[2];  /* 0x820..0x824 */
  volatile uint32_t dvbusdis;      /* 0x828 */
  volatile uint32_t dvbuspulse;    /* 0x82C */
  volatile uint32_t reserved2;     /* 0x830 */
  volatile uint32_t diepempmsk;    /* 0x834 */
} OTGFS_Device_TypeDef;

typedef struct {
  volatile uint32_t ctl;           /* +0x00 */
  volatile uint32_t reserved0;     /* +0x04 */
  volatile uint32_t tint;          /* +0x08 */
  volatile uint32_t reserved1;     /* +0x0C */
  volatile uint32_t tsiz;          /* +0x10 */
  volatile uint32_t reserved2;     /* +0x14 */
  volatile uint32_t dtxfsts;       /* +0x18 */
  volatile uint32_t reserved3;     /* +0x1C */
} OTGFS_Endpoint_TypeDef;

#define OTGFS_GLOBAL        ((OTGFS_Global_TypeDef *)OTGFS1_BASE)
#define OTGFS_DEVICE        ((OTGFS_Device_TypeDef *)(OTGFS1_BASE + 0x800UL))
#define OTGFS_INEP(n)       ((OTGFS_Endpoint_TypeDef *)(OTGFS1_BASE + 0x900UL + 0x20UL * (uint32_t)(n)))
#define OTGFS_OUTEP(n)      ((OTGFS_Endpoint_TypeDef *)(OTGFS1_BASE + 0xB00UL + 0x20UL * (uint32_t)(n)))
#define OTGFS_PCGCCTL       (*(volatile uint32_t *)(OTGFS1_BASE + 0xE00UL))
#define OTGFS_FIFO(n)       ((volatile uint32_t *)(OTGFS1_BASE + 0x1000UL + 0x1000UL * (uint32_t)(n)))

#endif /* AT32F415_REGS_H */
