<!-- 꼬리 방향은 실제로 뜬 쪽(data-side)을 따른다 -->
<script setup lang="ts">
import { computed } from "vue";
import { TooltipPortal, TooltipContent as Inner } from "reka-ui";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{ variant?: "default" | "box" | "vertical"; side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; sideOffset?: number }>(),
  { variant: "default", align: "center", sideOffset: 12 },
);
const realSide = computed(() => props.side ?? (props.variant === "default" ? "right" : "top"));
</script>

<template>
  <TooltipPortal>
    <Inner
      v-bind="$attrs"
      :side="realSide"
      :align="align"
      :side-offset="sideOffset"
      :class="['hb-kit krds-tooltip-popover active hb-tip', { 'tooltip-box': variant === 'box', 'tooltip-vertical': variant === 'vertical' }]"
    >
      <slot />
    </Inner>
  </TooltipPortal>
</template>
