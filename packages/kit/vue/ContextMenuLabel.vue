<!-- 오른쪽 클릭 메뉴 · ContextMenuLabel — shadcn-vue ContextMenuLabel 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { ContextMenuLabel as R } from "reka-ui";
defineProps<{ inset?: boolean }>();
</script>

<template>
  <R :class="['hb-menu-label', { inset }]"><slot /></R>
</template>
