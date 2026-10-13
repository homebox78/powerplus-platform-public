<!-- 드롭다운 메뉴 · DropdownMenuSubTrigger — shadcn-vue DropdownMenuSubTrigger 와 같은 사용법. 동작은 reka-ui.
  → 로 하위 메뉴를 연다. -->
<script setup lang="ts">
import { DropdownMenuSubTrigger as R } from "reka-ui";
defineProps<{ inset?: boolean }>();
</script>

<template>
  <R :class="['hb-menu-item', { inset }]">
    <slot />
    <i class="svg-icon ico-angle right hb-menu-sub-arrow" aria-hidden="true" />
  </R>
</template>
