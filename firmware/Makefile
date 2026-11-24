TARGET      := IPS3608_OpenFW
BUILD_DIR   := build
LDSCRIPT    := linker/at32f415cct7_app.ld

CC          := arm-none-eabi-gcc
OBJCOPY     := arm-none-eabi-objcopy
SIZE        := arm-none-eabi-size

C_SRCS := \
	src/system_at32f415.c \
	src/lcd_st7789.c \
	src/adc_monitor.c \
	src/usart_diag.c \
	src/main.c

ASM_SRCS := \
	src/startup_at32f415.s

OBJS := \
	$(patsubst src/%.c,$(BUILD_DIR)/%.o,$(C_SRCS)) \
	$(patsubst src/%.s,$(BUILD_DIR)/%.o,$(ASM_SRCS))

ARCH_FLAGS := -mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard
CFLAGS     := $(ARCH_FLAGS) -std=c11 -Os -ffunction-sections -fdata-sections -Wall -Wextra -Werror -Isrc
ASFLAGS    := $(ARCH_FLAGS) -x assembler-with-cpp
LDFLAGS    := $(ARCH_FLAGS) -T$(LDSCRIPT) -nostdlib -Wl,--gc-sections -Wl,-Map=$(BUILD_DIR)/$(TARGET).map

.PHONY: all clean

all: $(BUILD_DIR)/$(TARGET).bin $(BUILD_DIR)/$(TARGET).hex
	$(SIZE) $(BUILD_DIR)/$(TARGET).elf

$(BUILD_DIR)/%.o: src/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR)/%.o: src/%.s | $(BUILD_DIR)
	$(CC) $(ASFLAGS) -c $< -o $@

$(BUILD_DIR)/$(TARGET).elf: $(OBJS) $(LDSCRIPT)
	$(CC) $(OBJS) $(LDFLAGS) -o $@

$(BUILD_DIR)/$(TARGET).bin: $(BUILD_DIR)/$(TARGET).elf
	$(OBJCOPY) -O binary $< $@

$(BUILD_DIR)/$(TARGET).hex: $(BUILD_DIR)/$(TARGET).elf
	$(OBJCOPY) -O ihex $< $@

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

clean:
	rm -rf $(BUILD_DIR)
