#ifndef LCD_ST7789_H
#define LCD_ST7789_H

#include <stdint.h>

#define RGB565(r, g, b) ((uint16_t)((((r) & 0xF8U) << 8) | (((g) & 0xFCU) << 3) | (((b) & 0xF8U) >> 3)))

#define COLOR_BG        RGB565(0, 0, 0)
#define COLOR_HEADER    RGB565(0, 72, 110)
#define COLOR_SAFE_BG   RGB565(180, 16, 16)
#define COLOR_SAFE_OK   RGB565(20, 110, 60)
#define COLOR_CYAN      RGB565(0, 220, 255)
#define COLOR_AMBER     RGB565(255, 190, 40)
#define COLOR_GREEN     RGB565(60, 235, 130)
#define COLOR_WHITE     RGB565(245, 248, 255)
#define COLOR_MUTED     RGB565(150, 168, 190)

void lcd_init(void);
void lcd_set_backlight(uint8_t on);
void lcd_fill_rect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color);
void lcd_draw_char(uint16_t x, uint16_t y, char ch, uint16_t fg, uint16_t bg, uint8_t scale);
void lcd_draw_string(uint16_t x, uint16_t y, const char *s, uint16_t fg, uint16_t bg, uint8_t scale);

#endif /* LCD_ST7789_H */
