<!-- 드롭다운 메뉴 · DropdownMenuContent — shadcn-vue DropdownMenuContent 와 같은 사용법. 동작은 reka-ui.
  body 끝에 붙으므로 최상위 요소에 hb-kit 을 붙인다. -->
<script setup lang="ts">
import { DropdownMenuContent as R, DropdownMenuPortal as RPortal } from "reka-ui";
defineOptions({ inheritAttrs: false });
const p = withDefaults(defineProps<{ sideOffset?: number; align?: "start" | "center" | "end" }>(), { sideOffset: 6, align: "start" });
</script>

<template>
  <RPortal>
    <R v-bind="$attrs" :side-offset="p.sideOffset" :align="p.align" class="hb-kit hb-menu"><slot /></R>
  </RPortal>
</template>
