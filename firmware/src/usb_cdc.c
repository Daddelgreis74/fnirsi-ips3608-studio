#include "usb_cdc.h"
#include "at32f415_regs.h"
#include "system_at32f415.h"

/* Ring buffer sizes (powers of two for bitmask wrapping) */
#define USB_RX_BUF_SIZE     512U
#define USB_TX_BUF_SIZE     512U
#define USB_RX_BUF_MASK     (USB_RX_BUF_SIZE - 1U)
#define USB_TX_BUF_MASK     (USB_TX_BUF_SIZE - 1U)

/* Standard USB request / descriptor constants */
#define USB_REQ_DIR_IN      0x80U
#define USB_REQ_TYPE_MASK   0x60U
#define USB_REQ_TYPE_STD    0x00U
#define USB_REQ_TYPE_CLASS  0x20U

#define USB_REQ_GET_STATUS        0x00U
#define USB_REQ_SET_ADDRESS       0x05U
#define USB_REQ_GET_DESCRIPTOR    0x06U
#define USB_REQ_GET_CONFIGURATION 0x08U
#define USB_REQ_SET_CONFIGURATION 0x09U

#define CDC_SET_LINE_CODING        0x20U
#define CDC_GET_LINE_CODING        0x21U
#define CDC_SET_CONTROL_LINE_STATE 0x22U

typedef enum {
  EP0_IDLE = 0,
  EP0_DATA_IN,
  EP0_DATA_OUT,
  EP0_STATUS_IN
} ep0_stage_t;

static volatile uint8_t g_usb_configured = 0U;
static volatile uint8_t g_cdc_dtr = 0U;
static volatile ep0_stage_t g_ep0_stage = EP0_IDLE;

static uint8_t g_ep0_setup[8];
static const uint8_t *g_ep0_in_ptr = 0;
static uint16_t g_ep0_in_rem = 0U;
static uint8_t g_ep0_need_zlp = 0U;
static uint8_t g_ep0_status_buf[2];

static uint8_t g_line_coding[7] = {
  0x00U, 0xC2U, 0x01U, 0x00U, /* 115200 baud LE */
  0x00U,                      /* 1 stop bit */
  0x00U,                      /* None parity */
  0x08U                       /* 8 data bits */
};

static volatile uint8_t g_rx_buf[USB_RX_BUF_SIZE];
static volatile uint16_t g_rx_head = 0U;
static volatile uint16_t g_rx_tail = 0U;

static volatile uint8_t g_tx_buf[USB_TX_BUF_SIZE];
static volatile uint16_t g_tx_head = 0U;
static volatile uint16_t g_tx_tail = 0U;
static volatile uint8_t g_ep1_tx_busy = 0U;
static volatile uint8_t g_ep1_need_zlp = 0U;

/* Device Descriptor: VID 0x2E3C (Artery/FNIRSI), PID 0x5740 (USB-CDC) */
static const uint8_t k_dev_desc[18] = {
  18U, 0x01U,
  0x00U, 0x02U,               /* bcdUSB 2.00 */
  0x02U,                      /* bDeviceClass: CDC */
  0x02U,                      /* bDeviceSubClass: ACM */
  0x00U,                      /* bDeviceProtocol */
  64U,                        /* bMaxPacketSize0 */
  0x3CU, 0x2EU,               /* idVendor = 0x2E3C */
  0x40U, 0x57U,               /* idProduct = 0x5740 */
  0x00U, 0x02U,               /* bcdDevice = 2.00 */
  1U, 2U, 3U,                 /* iManufacturer, iProduct, iSerialNumber */
  1U                          /* bNumConfigurations */
};

/* Configuration Descriptor + CDC Control IF0 + CDC Data IF1 (67 bytes total) */
static const uint8_t k_cfg_desc[67] = {
  /* Configuration Descriptor (9) */
  9U, 0x02U, 67U, 0x00U, 2U, 1U, 0U, 0xC0U, 50U,
  /* Interface 0: CDC Communication (9) */
  9U, 0x04U, 0U, 0U, 1U, 0x02U, 0x02U, 0x01U, 0U,
  /* CDC Header Functional Descriptor (5) */
  5U, 0x24U, 0x00U, 0x10U, 0x01U,
  /* CDC Call Management Functional Descriptor (5) */
  5U, 0x24U, 0x01U, 0x00U, 0x01U,
  /* CDC ACM Functional Descriptor (4) */
  4U, 0x24U, 0x02U, 0x02U,
  /* CDC Union Functional Descriptor (5) */
  5U, 0x24U, 0x06U, 0x00U, 0x01U,
  /* EP2 IN Interrupt Descriptor (7) */
  7U, 0x05U, 0x82U, 0x03U, 8U, 0x00U, 16U,
  /* Interface 1: CDC Data (9) */
  9U, 0x04U, 1U, 0U, 2U, 0x0AU, 0x00U, 0x00U, 0U,
  /* EP1 OUT Bulk Descriptor (7) */
  7U, 0x05U, 0x01U, 0x02U, 64U, 0x00U, 0U,
  /* EP1 IN Bulk Descriptor (7) */
  7U, 0x05U, 0x81U, 0x02U, 64U, 0x00U, 0U
};

static const uint8_t k_str_langid[4] = { 4U, 0x03U, 0x09U, 0x04U };

static const uint8_t k_str_mfg[28] = {
  28U, 0x03U,
  'F',0, 'N',0, 'I',0, 'R',0, 'S',0, 'I',0, ' ',0,
  'O',0, 'p',0, 'e',0, 'n',0, 'F',0, 'W',0
};

static const uint8_t k_str_prod[40] = {
  40U, 0x03U,
  'I',0, 'P',0, 'S',0, '3',0, '6',0, '0',0, '8',0, ' ',0,
  'V',0, 'i',0, 'r',0, 't',0, 'u',0, 'a',0, 'l',0, ' ',0,
  'C',0, 'O',0, 'M',0
};

static const uint8_t k_str_ser[38] = {
  38U, 0x03U,
  'I',0, 'P',0, 'S',0, '3',0, '6',0, '0',0, '8',0, '-',0,
  'O',0, 'P',0, 'E',0, 'N',0, 'F',0, 'W',0, '-',0,
  '0',0, '2',0, '1',0
};

void OTGFS1_IRQHandler(void);

static inline uint32_t irq_save_disable(void) {
  uint32_t primask;
  __asm__ volatile ("mrs %0, primask\n\tcpsid i" : "=r"(primask) :: "memory");
  return primask;
}

static inline void irq_restore(uint32_t primask) {
  __asm__ volatile ("msr primask, %0" :: "r"(primask) : "memory");
}

static void dwc2_flush_tx_fifo(uint8_t fifo_num) {
  volatile uint32_t guard = 0U;
  OTGFS_GLOBAL->grstctl = ((uint32_t)fifo_num << 6) | (1UL << 5);
  while (((OTGFS_GLOBAL->grstctl & (1UL << 5)) != 0UL) && (guard < 100000UL)) {
    guard++;
  }
}

static void dwc2_flush_rx_fifo(void) {
  volatile uint32_t guard = 0U;
  OTGFS_GLOBAL->grstctl = (1UL << 4);
  while (((OTGFS_GLOBAL->grstctl & (1UL << 4)) != 0UL) && (guard < 100000UL)) {
    guard++;
  }
}

static void dwc2_write_fifo(uint8_t ep, const uint8_t *buf, uint16_t len) {
  volatile uint32_t *fifo = OTGFS_FIFO(ep);
  for (uint16_t i = 0U; i < len; i += 4U) {
    uint32_t word = (uint32_t)buf[i];
    if ((i + 1U) < len) {
      word |= ((uint32_t)buf[i + 1U]) << 8;
    }
    if ((i + 2U) < len) {
      word |= ((uint32_t)buf[i + 2U]) << 16;
    }
    if ((i + 3U) < len) {
      word |= ((uint32_t)buf[i + 3U]) << 24;
    }
    *fifo = word;
  }
}

static void dwc2_configure_fifos(void) {
  /* Matches V1.9 OTGFS1 FIFO allocation (total 288 x 32-bit words <= 320 words) */
  OTGFS_GLOBAL->grxfsiz  = 128UL;
  OTGFS_GLOBAL->dieptxf0 = (64UL << 16) | 128UL;
  OTGFS_GLOBAL->dieptxf1 = (64UL << 16) | 192UL;
  OTGFS_GLOBAL->dieptxf2 = (32UL << 16) | 256UL;
}

static void ep0_arm_setup(void) {
  OTGFS_OUTEP(0)->tsiz = (3UL << 29) | (1UL << 19) | 64UL;
  OTGFS_OUTEP(0)->ctl  = (1UL << 31) | (1UL << 26); /* EPENA | CNAK */
}

static void ep0_arm_out_data(uint16_t len) {
  OTGFS_OUTEP(0)->tsiz = (3UL << 29) | (1UL << 19) | (uint32_t)(len & 0x7FU);
  OTGFS_OUTEP(0)->ctl  = (1UL << 31) | (1UL << 26); /* EPENA | CNAK */
}

static void ep0_send_zlp(void) {
  g_ep0_stage = EP0_STATUS_IN;
  OTGFS_INEP(0)->tsiz = (1UL << 19); /* PKTCNT = 1, XFRSIZ = 0 */
  OTGFS_INEP(0)->ctl  = (1UL << 31) | (1UL << 26); /* EPENA | CNAK */
}

static void ep0_stall(void) {
  g_ep0_stage = EP0_IDLE;
  OTGFS_INEP(0)->ctl |= (1UL << 21); /* STALL */
  ep0_arm_setup();
}

static void ep0_send_next_in_packet(void) {
  uint16_t chunk = g_ep0_in_rem;
  if (chunk > 64U) {
    chunk = 64U;
  }

  OTGFS_INEP(0)->tsiz = (1UL << 19) | (uint32_t)chunk;
  OTGFS_INEP(0)->ctl  = (1UL << 31) | (1UL << 26); /* EPENA | CNAK */

  if ((chunk > 0U) && (g_ep0_in_ptr != 0)) {
    dwc2_write_fifo(0U, g_ep0_in_ptr, chunk);
    g_ep0_in_ptr += chunk;
    g_ep0_in_rem = (uint16_t)(g_ep0_in_rem - chunk);
  }
}

static void ep0_start_in(const uint8_t *data, uint16_t data_len, uint16_t req_len) {
  uint16_t total = (data_len < req_len) ? data_len : req_len;
  g_ep0_in_ptr = data;
  g_ep0_in_rem = total;
  g_ep0_need_zlp = ((total > 0U) && (total < req_len) && ((total & 63U) == 0U)) ? 1U : 0U;
  g_ep0_stage = EP0_DATA_IN;
  ep0_send_next_in_packet();
}

static void cdc_activate_data_endpoints(void) {
  /* EP1 OUT Bulk 64B */
  OTGFS_OUTEP(1)->tsiz = (1UL << 19) | 64UL;
  OTGFS_OUTEP(1)->ctl  = (1UL << 31) | (1UL << 28) | (1UL << 26) |
                         (2UL << 18) | (1UL << 15) | 64UL;

  /* EP1 IN Bulk 64B (TX FIFO 1) */
  OTGFS_INEP(1)->ctl = (1UL << 28) | (1UL << 27) | (1UL << 22) |
                       (2UL << 18) | (1UL << 15) | 64UL;

  /* EP2 IN Interrupt 8B (TX FIFO 2) */
  OTGFS_INEP(2)->ctl = (1UL << 28) | (1UL << 27) | (2UL << 22) |
                       (3UL << 18) | (1UL << 15) | 8UL;

  OTGFS_DEVICE->daintmsk = (1UL << 0) | (1UL << 1) | (1UL << 2) |
                           (1UL << 16) | (1UL << 17);
}

static void ep1_kick_tx_from_isr(void) {
  uint8_t pkt[64];
  uint16_t cnt = 0U;
  uint16_t tail = g_tx_tail;

  while ((tail != g_tx_head) && (cnt < 64U)) {
    pkt[cnt++] = g_tx_buf[tail];
    tail = (uint16_t)((tail + 1U) & USB_TX_BUF_MASK);
  }
  g_tx_tail = tail;

  if (cnt > 0U) {
    g_ep1_tx_busy = 1U;
    g_ep1_need_zlp = (cnt == 64U) ? 1U : 0U;
    OTGFS_INEP(1)->tsiz = (1UL << 19) | (uint32_t)cnt;
    OTGFS_INEP(1)->ctl  = (OTGFS_INEP(1)->ctl & ~(1UL << 27)) | (1UL << 31) | (1UL << 26);
    dwc2_write_fifo(1U, pkt, cnt);
  } else if (g_ep1_need_zlp != 0U) {
    g_ep1_tx_busy = 1U;
    g_ep1_need_zlp = 0U;
    OTGFS_INEP(1)->tsiz = (1UL << 19);
    OTGFS_INEP(1)->ctl  = (OTGFS_INEP(1)->ctl & ~(1UL << 27)) | (1UL << 31) | (1UL << 26);
  } else {
    g_ep1_tx_busy = 0U;
  }
}

static void handle_setup_packet(const uint8_t setup[8]) {
  uint8_t bmRequestType = setup[0];
  uint8_t bRequest      = setup[1];
  uint16_t wValue       = (uint16_t)setup[2] | ((uint16_t)setup[3] << 8);
  uint16_t wIndex       = (uint16_t)setup[4] | ((uint16_t)setup[5] << 8);
  uint16_t wLength      = (uint16_t)setup[6] | ((uint16_t)setup[7] << 8);
  uint8_t req_type      = bmRequestType & USB_REQ_TYPE_MASK;

  (void)wIndex;

  if (req_type == USB_REQ_TYPE_STD) {
    if (bRequest == USB_REQ_GET_DESCRIPTOR) {
      uint8_t desc_type  = (uint8_t)(wValue >> 8);
      uint8_t desc_index = (uint8_t)(wValue & 0xFFU);

      if (desc_type == 0x01U) {
        ep0_start_in(k_dev_desc, (uint16_t)sizeof(k_dev_desc), wLength);
        return;
      }
      if (desc_type == 0x02U) {
        ep0_start_in(k_cfg_desc, (uint16_t)sizeof(k_cfg_desc), wLength);
        return;
      }
      if (desc_type == 0x03U) {
        if (desc_index == 0U) {
          ep0_start_in(k_str_langid, (uint16_t)sizeof(k_str_langid), wLength);
          return;
        }
        if (desc_index == 1U) {
          ep0_start_in(k_str_mfg, (uint16_t)sizeof(k_str_mfg), wLength);
          return;
        }
        if (desc_index == 2U) {
          ep0_start_in(k_str_prod, (uint16_t)sizeof(k_str_prod), wLength);
          return;
        }
        if (desc_index == 3U) {
          ep0_start_in(k_str_ser, (uint16_t)sizeof(k_str_ser), wLength);
          return;
        }
      }
      ep0_stall();
      return;
    }

    if (bRequest == USB_REQ_SET_ADDRESS) {
      uint32_t addr = (uint32_t)(wValue & 0x7FU);
      OTGFS_DEVICE->dcfg = (OTGFS_DEVICE->dcfg & ~(0x7FUL << 4)) | (addr << 4);
      ep0_send_zlp();
      return;
    }

    if (bRequest == USB_REQ_SET_CONFIGURATION) {
      if ((wValue & 0xFFU) == 1U) {
        cdc_activate_data_endpoints();
        g_usb_configured = 1U;
      } else {
        g_usb_configured = 0U;
        g_cdc_dtr = 0U;
      }
      ep0_send_zlp();
      return;
    }

    if (bRequest == USB_REQ_GET_CONFIGURATION) {
      g_ep0_status_buf[0] = g_usb_configured;
      ep0_start_in(g_ep0_status_buf, 1U, wLength);
      return;
    }

    if (bRequest == USB_REQ_GET_STATUS) {
      g_ep0_status_buf[0] = 0x01U; /* Self-powered */
      g_ep0_status_buf[1] = 0x00U;
      ep0_start_in(g_ep0_status_buf, 2U, wLength);
      return;
    }

    ep0_stall();
    return;
  }

  if (req_type == USB_REQ_TYPE_CLASS) {
    if (bRequest == CDC_SET_LINE_CODING) {
      if (wLength == 7U) {
        g_ep0_stage = EP0_DATA_OUT;
        ep0_arm_out_data(7U);
      } else {
        ep0_send_zlp();
      }
      return;
    }

    if (bRequest == CDC_GET_LINE_CODING) {
      ep0_start_in(g_line_coding, 7U, wLength);
      return;
    }

    if (bRequest == CDC_SET_CONTROL_LINE_STATE) {
      g_cdc_dtr = (uint8_t)(wValue & 0x01U);
      ep0_send_zlp();
      return;
    }
  }

  (void)bmRequestType;
  ep0_stall();
}

static void handle_rxflvl(void) {
  while ((OTGFS_GLOBAL->gintsts & (1UL << 4)) != 0UL) {
    uint32_t grx    = OTGFS_GLOBAL->grxstsp;
    uint8_t ep      = (uint8_t)(grx & 0xFU);
    uint16_t bcnt   = (uint16_t)((grx >> 4) & 0x7FFU);
    uint8_t pktsts  = (uint8_t)((grx >> 17) & 0xFU);
    uint16_t words  = (uint16_t)((bcnt + 3U) >> 2);
    volatile uint32_t *fifo = OTGFS_FIFO(0U);

    if (pktsts == 0x06U) {
      /* SETUP packet (8 bytes) */
      for (uint16_t w = 0U; w < words; w++) {
        uint32_t v = *fifo;
        if (w < 2U) {
          uint16_t base = (uint16_t)(w * 4U);
          g_ep0_setup[base]      = (uint8_t)(v & 0xFFU);
          g_ep0_setup[base + 1U] = (uint8_t)((v >> 8) & 0xFFU);
          g_ep0_setup[base + 2U] = (uint8_t)((v >> 16) & 0xFFU);
          g_ep0_setup[base + 3U] = (uint8_t)((v >> 24) & 0xFFU);
        }
      }
    } else if (pktsts == 0x02U) {
      /* OUT data packet */
      uint16_t byte_idx = 0U;
      for (uint16_t w = 0U; w < words; w++) {
        uint32_t v = *fifo;
        for (uint8_t b = 0U; (b < 4U) && (byte_idx < bcnt); b++) {
          uint8_t val = (uint8_t)((v >> (b * 8U)) & 0xFFU);
          if ((ep == 0U) && (g_ep0_stage == EP0_DATA_OUT) && (byte_idx < 7U)) {
            g_line_coding[byte_idx] = val;
          } else if (ep == 1U) {
            uint16_t next_head = (uint16_t)((g_rx_head + 1U) & USB_RX_BUF_MASK);
            if (next_head != g_rx_tail) {
              g_rx_buf[g_rx_head] = val;
              g_rx_head = next_head;
            }
          }
          byte_idx++;
        }
      }
    } else {
      for (uint16_t w = 0U; w < words; w++) {
        (void)*fifo;
      }
    }
  }
}

static void handle_usb_reset(void) {
  g_usb_configured = 0U;
  g_cdc_dtr = 0U;
  g_ep0_stage = EP0_IDLE;
  g_ep0_in_rem = 0U;
  g_ep0_need_zlp = 0U;
  g_rx_head = 0U;
  g_rx_tail = 0U;
  g_tx_head = 0U;
  g_tx_tail = 0U;
  g_ep1_tx_busy = 0U;
  g_ep1_need_zlp = 0U;

  OTGFS_DEVICE->dctl &= ~(1UL << 0); /* Clear remote wakeup signaling */
  OTGFS_DEVICE->dcfg &= ~(0x7FUL << 4); /* Device address = 0 */

  for (uint8_t ep = 0U; ep < 4U; ep++) {
    OTGFS_OUTEP(ep)->ctl |= (1UL << 27); /* SNAK */
    OTGFS_OUTEP(ep)->tint = 0xFFUL;
    OTGFS_INEP(ep)->tint  = 0xFFUL;
  }

  dwc2_configure_fifos();
  dwc2_flush_tx_fifo(0x10U);
  dwc2_flush_rx_fifo();

  OTGFS_DEVICE->doepmsk  = (1UL << 3) | (1UL << 0); /* STUPM | XFERCM */
  OTGFS_DEVICE->diepmsk  = (1UL << 0);              /* XFERCM */
  OTGFS_DEVICE->daintmsk = (1UL << 0) | (1UL << 16);

  ep0_arm_setup();
}

void OTGFS1_IRQHandler(void) {
  uint32_t gintsts = OTGFS_GLOBAL->gintsts & OTGFS_GLOBAL->gintmsk;

  if ((gintsts & (1UL << 4)) != 0UL) {
    handle_rxflvl();
  }

  if ((gintsts & (1UL << 12)) != 0UL) {
    OTGFS_GLOBAL->gintsts = (1UL << 12);
    handle_usb_reset();
  }

  if ((gintsts & (1UL << 13)) != 0UL) {
    OTGFS_GLOBAL->gintsts = (1UL << 13);
    (void)OTGFS_DEVICE->dsts;
    OTGFS_INEP(0)->ctl &= ~0x3UL; /* MPSIZ = 64 bytes */
    OTGFS_GLOBAL->gusbcfg = (OTGFS_GLOBAL->gusbcfg & ~(0xFUL << 10)) | (5UL << 10);
    ep0_arm_setup();
  }

  if ((gintsts & (1UL << 11)) != 0UL) {
    OTGFS_GLOBAL->gintsts = (1UL << 11);
    g_ep1_tx_busy = 0U;
  }

  if ((gintsts & (1UL << 19)) != 0UL) {
    uint32_t oepint = (OTGFS_DEVICE->daint >> 16) & 0xFFFFUL;

    if ((oepint & (1UL << 0)) != 0UL) {
      uint32_t flags = OTGFS_OUTEP(0)->tint;
      OTGFS_OUTEP(0)->tint = flags;
      if ((flags & (1UL << 3)) != 0UL) {
        handle_setup_packet(g_ep0_setup);
      } else if ((flags & (1UL << 0)) != 0UL) {
        if (g_ep0_stage == EP0_DATA_OUT) {
          ep0_send_zlp();
        } else {
          g_ep0_stage = EP0_IDLE;
        }
        ep0_arm_setup();
      }
    }

    if ((oepint & (1UL << 1)) != 0UL) {
      uint32_t flags = OTGFS_OUTEP(1)->tint;
      OTGFS_OUTEP(1)->tint = flags;
      if ((flags & (1UL << 0)) != 0UL) {
        OTGFS_OUTEP(1)->tsiz = (1UL << 19) | 64UL;
        OTGFS_OUTEP(1)->ctl  = (OTGFS_OUTEP(1)->ctl & ~(1UL << 27)) | (1UL << 31) | (1UL << 26);
      }
    }
  }

  if ((gintsts & (1UL << 18)) != 0UL) {
    uint32_t iepint = OTGFS_DEVICE->daint & 0xFFFFUL;

    if ((iepint & (1UL << 0)) != 0UL) {
      uint32_t flags = OTGFS_INEP(0)->tint;
      OTGFS_INEP(0)->tint = flags;
      if ((flags & (1UL << 0)) != 0UL) {
        if (g_ep0_stage == EP0_DATA_IN) {
          if (g_ep0_in_rem > 0U) {
            ep0_send_next_in_packet();
          } else if (g_ep0_need_zlp != 0U) {
            g_ep0_need_zlp = 0U;
            OTGFS_INEP(0)->tsiz = (1UL << 19);
            OTGFS_INEP(0)->ctl  = (1UL << 31) | (1UL << 26);
          } else {
            g_ep0_stage = EP0_IDLE;
            ep0_arm_setup();
          }
        } else if (g_ep0_stage == EP0_STATUS_IN) {
          g_ep0_stage = EP0_IDLE;
          ep0_arm_setup();
        }
      }
    }

    if ((iepint & (1UL << 1)) != 0UL) {
      uint32_t flags = OTGFS_INEP(1)->tint;
      OTGFS_INEP(1)->tint = flags;
      if ((flags & (1UL << 0)) != 0UL) {
        ep1_kick_tx_from_isr();
      }
    }
  }
}

void usb_cdc_init(void) {
  volatile uint32_t guard;

  CRM->apb2en |= CRM_APB2_GPIOA;
  CRM->ahben  |= CRM_AHB_OTGFS1;

  /* Pulse peripheral reset so any bootloader USB state is wiped cleanly */
  CRM->ahbrst |= CRM_AHB_OTGFS1;
  delay_ms(2U);
  CRM->ahbrst &= ~CRM_AHB_OTGFS1;
  delay_ms(2U);

  /* Ensure PA11 (USB_DM) / PA12 (USB_DP) do not drive GPIO outputs */
  gpio_config_pin(GPIOA, 11U, GPIO_CFG_IN_FLOAT);
  gpio_config_pin(GPIOA, 12U, GPIO_CFG_IN_FLOAT);

  /* Enable PHY clock & issue DWC2 core soft reset */
  OTGFS_PCGCCTL = 0UL;
  OTGFS_GLOBAL->grstctl = (1UL << 0);
  guard = 0U;
  while (((OTGFS_GLOBAL->grstctl & (1UL << 0)) != 0UL) && (guard < 200000UL)) {
    guard++;
  }
  guard = 0U;
  while (((OTGFS_GLOBAL->grstctl & (1UL << 31)) == 0UL) && (guard < 200000UL)) {
    guard++;
  }
  delay_ms(2U);

  /* Embedded FS PHY + TRDT=5 (144 MHz AHB) + Force Device Mode */
  OTGFS_GLOBAL->gusbcfg = (1UL << 30) | (5UL << 10) | (1UL << 6);
  delay_ms(25U);

  /* Activate USB FS transceiver, A/B VBUS sensing & VBUSIG (matches V1.9 0x002D0000) */
  OTGFS_GLOBAL->gccfg = (1UL << 16) | (1UL << 18) | (1UL << 19) | (1UL << 21);

  /* Soft-disconnect briefly so attached host re-enumerates immediately after flash */
  OTGFS_DEVICE->dctl |= (1UL << 1);
  delay_ms(20U);

  OTGFS_DEVICE->dcfg = 0x3UL; /* Full-Speed PHY */
  dwc2_configure_fifos();
  dwc2_flush_tx_fifo(0x10U);
  dwc2_flush_rx_fifo();

  OTGFS_GLOBAL->gintsts = 0xFFFFFFFFUL;
  OTGFS_GLOBAL->gintmsk = (1UL << 19) | (1UL << 18) | (1UL << 13) |
                          (1UL << 12) | (1UL << 11) | (1UL << 4);
  OTGFS_GLOBAL->gahbcfg = (1UL << 7) | (1UL << 0); /* TXFELVL | GINTMSK */

  /* Enable OTGFS1 IRQ 67 in NVIC before asserting DP pull-up */
  NVIC_ISER2 = (1UL << (OTGFS1_IRQn - 64U));

  /* Connect D+ 1.5k pull-up */
  OTGFS_DEVICE->dctl &= ~(1UL << 1);
}

uint8_t usb_cdc_is_configured(void) {
  return g_usb_configured;
}

uint8_t usb_cdc_is_dtr(void) {
  return (g_usb_configured != 0U) && (g_cdc_dtr != 0U);
}

uint16_t usb_cdc_available(void) {
  return (uint16_t)((g_rx_head - g_rx_tail) & USB_RX_BUF_MASK);
}

uint16_t usb_cdc_read(uint8_t *out, uint16_t max_len) {
  uint16_t count = 0U;
  uint32_t primask = irq_save_disable();

  while ((count < max_len) && (g_rx_tail != g_rx_head)) {
    out[count++] = g_rx_buf[g_rx_tail];
    g_rx_tail = (uint16_t)((g_rx_tail + 1U) & USB_RX_BUF_MASK);
  }

  irq_restore(primask);
  return count;
}

uint16_t usb_cdc_write(const uint8_t *data, uint16_t len) {
  uint16_t written = 0U;
  uint32_t primask;

  if ((g_usb_configured == 0U) || (len == 0U)) {
    return 0U;
  }

  primask = irq_save_disable();

  while (written < len) {
    uint16_t next_head = (uint16_t)((g_tx_head + 1U) & USB_TX_BUF_MASK);
    if (next_head == g_tx_tail) {
      break;
    }
    g_tx_buf[g_tx_head] = data[written++];
    g_tx_head = next_head;
  }

  if ((written > 0U) && (g_ep1_tx_busy == 0U)) {
    ep1_kick_tx_from_isr();
  }

  irq_restore(primask);
  return written;
}
