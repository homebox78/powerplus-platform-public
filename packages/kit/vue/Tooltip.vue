<!-- 툴팁 — KRDS 「툴팁」(말풍선·상자형·세로형) · shadcn-vue Tooltip 과 같은 사용법
  <Tooltip>
    <TooltipTrigger as-child><Button variant="text">도움말</Button></TooltipTrigger>
    <TooltipContent>버튼에 제공되는 툴팁</TooltipContent>
  </Tooltip>
  <TooltipContent variant="box">…</TooltipContent>  ← KRDS tooltip-box / variant="vertical" ← tooltip-vertical
  Provider 를 안에 품는다. KRDS 지침: 툴팁 안에 대화형 요소를 넣지 않는다, 비활성 버튼에 달지 않는다. -->
<script setup lang="ts">
import { TooltipProvider, TooltipRoot, useForwardPropsEmits } from "reka-ui";

const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean; delayDuration?: number }>(), {
  open: undefined,
  defaultOpen: false,
  delayDuration: 200,
});
const emits = defineEmits<{ "update:open": [value: boolean] }>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot v-bind="forwarded"><slot /></TooltipRoot>
  </TooltipProvider>
</template>
