/*
 * Linker script for FNIRSI IPS3608 (Artery AT32F415CCT7)
 *
 * Flash layout (256 KB total):
 *   0x08000000 - 0x080067FF :  26 KB  Stock USB-MSC Bootloader (PROTECTED)
 *   0x08006800 - 0x0803EFFF : 226 KB  Open-Source Application Firmware
 *   0x0803F000 - 0x0803FFFF :   4 KB  Factory Calibration & Settings (PROTECTED)
 */

ENTRY(Reset_Handler)

_estack = ORIGIN(RAM) + LENGTH(RAM);

MEMORY
{
  FLASH (rx)  : ORIGIN = 0x08006800, LENGTH = 226K
  RAM   (xrw) : ORIGIN = 0x20000000, LENGTH = 32K
}

SECTIONS
{
  .isr_vector :
  {
    . = ALIGN(4);
    KEEP(*(.isr_vector))
    . = ALIGN(4);
  } >FLASH

  .text :
  {
    . = ALIGN(4);
    *(.text)
    *(.text*)
    *(.glue_7)
    *(.glue_7t)
    KEEP(*(.init))
    KEEP(*(.fini))
    . = ALIGN(4);
    _etext = .;
  } >FLASH

  .rodata :
  {
    . = ALIGN(4);
    *(.rodata)
    *(.rodata*)
    . = ALIGN(4);
  } >FLASH

  .ARM.extab :
  {
    *(.ARM.extab* .gnu.linkonce.armextab.*)
  } >FLASH

  .ARM :
  {
    __exidx_start = .;
    *(.ARM.exidx*)
    __exidx_end = .;
  } >FLASH

  _sidata = LOADADDR(.data);

  .data :
  {
    . = ALIGN(4);
    _sdata = .;
    *(.data)
    *(.data*)
    . = ALIGN(4);
    _edata = .;
  } >RAM AT> FLASH

  .bss :
  {
    . = ALIGN(4);
    _sbss = .;
    __bss_start__ = _sbss;
    *(.bss)
    *(.bss*)
    *(COMMON)
    . = ALIGN(4);
    _ebss = .;
    __bss_end__ = _ebss;
  } >RAM

  PROVIDE(end = _ebss);
  PROVIDE(_end = _ebss);
}
