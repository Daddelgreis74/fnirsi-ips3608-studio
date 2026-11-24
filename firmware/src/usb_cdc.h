#ifndef USB_CDC_H
#define USB_CDC_H

#include <stdint.h>

void usb_cdc_init(void);
uint8_t usb_cdc_is_configured(void);
uint8_t usb_cdc_is_dtr(void);
uint16_t usb_cdc_available(void);
uint16_t usb_cdc_read(uint8_t *out, uint16_t max_len);
uint16_t usb_cdc_write(const uint8_t *data, uint16_t len);

#endif /* USB_CDC_H */
