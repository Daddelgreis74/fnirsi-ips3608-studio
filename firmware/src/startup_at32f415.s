  .syntax unified
  .cpu cortex-m4
  .fpu fpv4-sp-d16
  .thumb

  .global g_pfnVectors
  .global Default_Handler
  .global Reset_Handler

  .section .text.Reset_Handler,"ax",%progbits
  .weak Reset_Handler
  .thumb_func
  .type Reset_Handler, %function
Reset_Handler:
  cpsid i

  /* Set initial stack pointer explicitly */
  ldr   r0, =_estack
  mov   sp, r0

  /* Stop SysTick and clear any leftover bootloader IRQs before setting VTOR */
  ldr   r0, =0xE000E010
  movs  r1, #0
  str   r1, [r0]

  ldr   r0, =0xE000E180
  mvn   r1, #0
  str   r1, [r0, #0]
  str   r1, [r0, #4]
  str   r1, [r0, #8]

  ldr   r0, =0xE000E280
  str   r1, [r0, #0]
  str   r1, [r0, #4]
  str   r1, [r0, #8]
  dsb
  isb

  /* Relocate Vector Table to 0x08006800 (behind 26 KB bootloader) */
  ldr   r0, =0xE000ED08
  ldr   r1, =g_pfnVectors
  str   r1, [r0]

  /* Enable FPU (CP10 and CP11 full access in SCB->CPACR) */
  ldr   r0, =0xE000ED88
  ldr   r1, [r0]
  orr   r1, r1, #(0xF << 20)
  str   r1, [r0]
  dsb
  isb

  /* Copy .data from FLASH (_sidata) to RAM (_sdata.._edata) */
  ldr   r0, =_sdata
  ldr   r1, =_edata
  ldr   r2, =_sidata
  b     CopyDataCheck
CopyDataLoop:
  ldr   r3, [r2], #4
  str   r3, [r0], #4
CopyDataCheck:
  cmp   r0, r1
  blo   CopyDataLoop

  /* Zero-initialize .bss (_sbss.._ebss) */
  ldr   r0, =_sbss
  ldr   r1, =_ebss
  movs  r2, #0
  b     ZeroBssCheck
ZeroBssLoop:
  str   r2, [r0], #4
ZeroBssCheck:
  cmp   r0, r1
  blo   ZeroBssLoop

  bl    SystemInit
  cpsie i
  bl    main

LoopForever:
  b     LoopForever
  .size Reset_Handler, .-Reset_Handler

  .section .text.Default_Handler,"ax",%progbits
  .thumb_func
  .type Default_Handler, %function
Default_Handler:
Infinite_Loop:
  b     Infinite_Loop
  .size Default_Handler, .-Default_Handler

  /* AT32F415 Vector Table (Core exceptions 0..15 + IRQs 0..67) */
  .section .isr_vector,"a",%progbits
  .p2align 2
  .type g_pfnVectors, %object
g_pfnVectors:
  .word _estack
  .word Reset_Handler
  .word NMI_Handler
  .word HardFault_Handler
  .word MemManage_Handler
  .word BusFault_Handler
  .word UsageFault_Handler
  .word 0
  .word 0
  .word 0
  .word 0
  .word SVC_Handler
  .word DebugMon_Handler
  .word 0
  .word PendSV_Handler
  .word SysTick_Handler

  /* External Interrupts (IRQ 0 .. IRQ 67) */
  .word WWDT_IRQHandler               /* IRQ  0 */
  .word PVM_IRQHandler                /* IRQ  1 */
  .word TAMP_STAMP_IRQHandler         /* IRQ  2 */
  .word ERTC_WKUP_IRQHandler          /* IRQ  3 */
  .word FLASH_IRQHandler              /* IRQ  4 */
  .word CRM_IRQHandler                /* IRQ  5 */
  .word EXINT0_IRQHandler             /* IRQ  6 */
  .word EXINT1_IRQHandler             /* IRQ  7 */
  .word EXINT2_IRQHandler             /* IRQ  8 */
  .word EXINT3_IRQHandler             /* IRQ  9 */
  .word EXINT4_IRQHandler             /* IRQ 10 */
  .word DMA1_Channel1_IRQHandler      /* IRQ 11 */
  .word DMA1_Channel2_IRQHandler      /* IRQ 12 */
  .word DMA1_Channel3_IRQHandler      /* IRQ 13 */
  .word DMA1_Channel4_IRQHandler      /* IRQ 14 */
  .word DMA1_Channel5_IRQHandler      /* IRQ 15 */
  .word DMA1_Channel6_IRQHandler      /* IRQ 16 */
  .word DMA1_Channel7_IRQHandler      /* IRQ 17 */
  .word ADC1_IRQHandler               /* IRQ 18 */
  .word CAN1_TX_IRQHandler            /* IRQ 19 */
  .word CAN1_RX0_IRQHandler           /* IRQ 20 */
  .word CAN1_RX1_IRQHandler           /* IRQ 21 */
  .word CAN1_SE_IRQHandler            /* IRQ 22 */
  .word EXINT9_5_IRQHandler           /* IRQ 23 */
  .word TMR1_BRK_TMR9_IRQHandler      /* IRQ 24 */
  .word TMR1_OVF_TMR10_IRQHandler     /* IRQ 25 */
  .word TMR1_TRG_HALL_TMR11_IRQHandler /* IRQ 26 */
  .word TMR1_CH_IRQHandler            /* IRQ 27 */
  .word TMR2_GLOBAL_IRQHandler        /* IRQ 28 */
  .word TMR3_GLOBAL_IRQHandler        /* IRQ 29 */
  .word TMR4_GLOBAL_IRQHandler        /* IRQ 30 */
  .word I2C1_EVT_IRQHandler           /* IRQ 31 */
  .word I2C1_ERR_IRQHandler           /* IRQ 32 */
  .word I2C2_EVT_IRQHandler           /* IRQ 33 */
  .word I2C2_ERR_IRQHandler           /* IRQ 34 */
  .word SPI1_IRQHandler               /* IRQ 35 */
  .word SPI2_IRQHandler               /* IRQ 36 */
  .word USART1_IRQHandler             /* IRQ 37 */
  .word USART2_IRQHandler             /* IRQ 38 */
  .word USART3_IRQHandler             /* IRQ 39 */
  .word EXINT15_10_IRQHandler         /* IRQ 40 */
  .word ERTCAlarm_IRQHandler          /* IRQ 41 */
  .word OTGFS1_WKUP_IRQHandler        /* IRQ 42 */
  .word 0                             /* IRQ 43 */
  .word 0                             /* IRQ 44 */
  .word 0                             /* IRQ 45 */
  .word 0                             /* IRQ 46 */
  .word 0                             /* IRQ 47 */
  .word 0                             /* IRQ 48 */
  .word SDIO1_IRQHandler              /* IRQ 49 */
  .word TMR5_GLOBAL_IRQHandler        /* IRQ 50 */
  .word 0                             /* IRQ 51 */
  .word UART4_IRQHandler              /* IRQ 52 */
  .word UART5_IRQHandler              /* IRQ 53 */
  .word 0                             /* IRQ 54 */
  .word 0                             /* IRQ 55 */
  .word DMA2_Channel1_IRQHandler      /* IRQ 56 */
  .word DMA2_Channel2_IRQHandler      /* IRQ 57 */
  .word DMA2_Channel3_IRQHandler      /* IRQ 58 */
  .word DMA2_Channel4_5_IRQHandler    /* IRQ 59 */
  .word 0                             /* IRQ 60 */
  .word 0                             /* IRQ 61 */
  .word 0                             /* IRQ 62 */
  .word 0                             /* IRQ 63 */
  .word 0                             /* IRQ 64 */
  .word 0                             /* IRQ 65 */
  .word 0                             /* IRQ 66 */
  .word OTGFS1_IRQHandler             /* IRQ 67 */

  .size g_pfnVectors, .-g_pfnVectors

  .macro IRQ_ALIAS name
    .weak \name
    .thumb_set \name, Default_Handler
  .endm

  IRQ_ALIAS NMI_Handler
  IRQ_ALIAS HardFault_Handler
  IRQ_ALIAS MemManage_Handler
  IRQ_ALIAS BusFault_Handler
  IRQ_ALIAS UsageFault_Handler
  IRQ_ALIAS SVC_Handler
  IRQ_ALIAS DebugMon_Handler
  IRQ_ALIAS PendSV_Handler
  IRQ_ALIAS SysTick_Handler
  IRQ_ALIAS WWDT_IRQHandler
  IRQ_ALIAS PVM_IRQHandler
  IRQ_ALIAS TAMP_STAMP_IRQHandler
  IRQ_ALIAS ERTC_WKUP_IRQHandler
  IRQ_ALIAS FLASH_IRQHandler
  IRQ_ALIAS CRM_IRQHandler
  IRQ_ALIAS EXINT0_IRQHandler
  IRQ_ALIAS EXINT1_IRQHandler
  IRQ_ALIAS EXINT2_IRQHandler
  IRQ_ALIAS EXINT3_IRQHandler
  IRQ_ALIAS EXINT4_IRQHandler
  IRQ_ALIAS DMA1_Channel1_IRQHandler
  IRQ_ALIAS DMA1_Channel2_IRQHandler
  IRQ_ALIAS DMA1_Channel3_IRQHandler
  IRQ_ALIAS DMA1_Channel4_IRQHandler
  IRQ_ALIAS DMA1_Channel5_IRQHandler
  IRQ_ALIAS DMA1_Channel6_IRQHandler
  IRQ_ALIAS DMA1_Channel7_IRQHandler
  IRQ_ALIAS ADC1_IRQHandler
  IRQ_ALIAS CAN1_TX_IRQHandler
  IRQ_ALIAS CAN1_RX0_IRQHandler
  IRQ_ALIAS CAN1_RX1_IRQHandler
  IRQ_ALIAS CAN1_SE_IRQHandler
  IRQ_ALIAS EXINT9_5_IRQHandler
  IRQ_ALIAS TMR1_BRK_TMR9_IRQHandler
  IRQ_ALIAS TMR1_OVF_TMR10_IRQHandler
  IRQ_ALIAS TMR1_TRG_HALL_TMR11_IRQHandler
  IRQ_ALIAS TMR1_CH_IRQHandler
  IRQ_ALIAS TMR2_GLOBAL_IRQHandler
  IRQ_ALIAS TMR3_GLOBAL_IRQHandler
  IRQ_ALIAS TMR4_GLOBAL_IRQHandler
  IRQ_ALIAS I2C1_EVT_IRQHandler
  IRQ_ALIAS I2C1_ERR_IRQHandler
  IRQ_ALIAS I2C2_EVT_IRQHandler
  IRQ_ALIAS I2C2_ERR_IRQHandler
  IRQ_ALIAS SPI1_IRQHandler
  IRQ_ALIAS SPI2_IRQHandler
  IRQ_ALIAS USART1_IRQHandler
  IRQ_ALIAS USART2_IRQHandler
  IRQ_ALIAS USART3_IRQHandler
  IRQ_ALIAS EXINT15_10_IRQHandler
  IRQ_ALIAS ERTCAlarm_IRQHandler
  IRQ_ALIAS OTGFS1_WKUP_IRQHandler
  IRQ_ALIAS SDIO1_IRQHandler
  IRQ_ALIAS TMR5_GLOBAL_IRQHandler
  IRQ_ALIAS UART4_IRQHandler
  IRQ_ALIAS UART5_IRQHandler
  IRQ_ALIAS DMA2_Channel1_IRQHandler
  IRQ_ALIAS DMA2_Channel2_IRQHandler
  IRQ_ALIAS DMA2_Channel3_IRQHandler
  IRQ_ALIAS DMA2_Channel4_5_IRQHandler
  IRQ_ALIAS OTGFS1_IRQHandler
