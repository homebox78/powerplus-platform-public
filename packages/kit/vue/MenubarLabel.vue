<!-- 메뉴 막대 · MenubarLabel — shadcn-vue MenubarLabel 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { MenubarLabel as R } from "reka-ui";
defineProps<{ inset?: boolean }>();
</script>

<template>
  <R :class="['hb-menu-label', { inset }]"><slot /></R>
</template>
