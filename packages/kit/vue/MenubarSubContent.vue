<!-- 메뉴 막대 · MenubarSubContent — shadcn-vue MenubarSubContent 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { MenubarSubContent as R, MenubarPortal as RPortal } from "reka-ui";
defineOptions({ inheritAttrs: false });
const p = withDefaults(defineProps<{ sideOffset?: number }>(), { sideOffset: 4 });
</script>

<template>
  <RPortal>
    <R v-bind="$attrs" :side-offset="p.sideOffset" class="hb-kit hb-menu"><slot /></R>
  </RPortal>
</template>
