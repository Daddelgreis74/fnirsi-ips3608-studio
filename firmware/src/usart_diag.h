#ifndef USART_DIAG_H
#define USART_DIAG_H

#include <stdint.h>

void usart_diag_init(void);
void usart_putc(char c);
void usart_puts(const char *s);
void usart_put_u32(uint32_t v);

#endif /* USART_DIAG_H */
