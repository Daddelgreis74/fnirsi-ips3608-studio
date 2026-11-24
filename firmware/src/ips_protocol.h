#ifndef IPS_PROTOCOL_H
#define IPS_PROTOCOL_H

#include <stdint.h>
#include "board_ips3608.h"

typedef struct {
  uint8_t connected;
  uint8_t output_on;       /* Locked to 0 in Stage 2A */
  uint8_t mode_cv;
  uint8_t protection;
  uint8_t brightness;
  uint32_t rx_packets;
  uint32_t tx_packets;
  uint32_t target_v_bits;  /* IEEE-754 float32 bits */
  uint32_t target_a_bits;
  uint32_t ovp_bits;
  uint32_t ocp_bits;
  uint32_t opp_bits;
  uint32_t otp_bits;
  uint32_t lvp_bits;
} ips_state_t;

void ips_protocol_init(void);
void ips_protocol_poll(const uint16_t adc_raw[ADC_CH_COUNT]);
const ips_state_t *ips_protocol_state(void);

#endif /* IPS_PROTOCOL_H */
