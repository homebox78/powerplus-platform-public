<!-- 드롭다운 메뉴 · DropdownMenuRadioItem — shadcn-vue DropdownMenuRadioItem 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { DropdownMenuRadioItem as R, DropdownMenuItemIndicator as RIndicator } from "reka-ui";
defineProps<{ value: string }>();
</script>

<template>
  <R :value="value" class="hb-menu-item has-indicator">
    <RIndicator class="hb-menu-indicator hb-menu-dot" />
    <slot />
  </R>
</template>
