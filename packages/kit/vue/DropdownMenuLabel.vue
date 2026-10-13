<!-- 드롭다운 메뉴 · DropdownMenuLabel — shadcn-vue DropdownMenuLabel 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { DropdownMenuLabel as R } from "reka-ui";
defineProps<{ inset?: boolean }>();
</script>

<template>
  <R :class="['hb-menu-label', { inset }]"><slot /></R>
</template>
