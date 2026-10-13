<script setup lang="ts">
import { HoverCardPortal, HoverCardContent as Inner } from "reka-ui";

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; sideOffset?: number }>(), {
  side: "bottom",
  align: "center",
  sideOffset: 8,
});
</script>

<template>
  <HoverCardPortal>
    <Inner v-bind="$attrs" :side="side" :align="align" :side-offset="sideOffset" class="hb-kit hb-hover-card"><slot /></Inner>
  </HoverCardPortal>
</template>
