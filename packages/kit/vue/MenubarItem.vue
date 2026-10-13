<!-- 메뉴 막대 · MenubarItem — shadcn-vue MenubarItem 와 같은 사용법. 동작은 reka-ui.
  @select 로 고른 것을 받는다. variant="danger" 는 삭제 같은 위험 동작. -->
<script setup lang="ts">
import { MenubarItem as R } from "reka-ui";
defineProps<{ inset?: boolean; variant?: "default" | "danger" }>();
</script>

<template>
  <R :class="['hb-menu-item', { inset, danger: variant === 'danger' }]"><slot /></R>
</template>
