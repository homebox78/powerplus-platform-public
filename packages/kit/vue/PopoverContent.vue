<script setup lang="ts">
import { PopoverPortal, PopoverContent as Inner, PopoverArrow } from "reka-ui";

defineOptions({ inheritAttrs: false });
withDefaults(
  defineProps<{ side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; sideOffset?: number; arrow?: boolean }>(),
  { side: "bottom", align: "center", sideOffset: 8, arrow: false },
);
</script>

<template>
  <PopoverPortal>
    <Inner v-bind="$attrs" :side="side" :align="align" :side-offset="sideOffset" class="hb-kit hb-popover">
      <slot />
      <PopoverArrow v-if="arrow" class="hb-popover-arrow" :width="14" :height="7" />
    </Inner>
  </PopoverPortal>
</template>
