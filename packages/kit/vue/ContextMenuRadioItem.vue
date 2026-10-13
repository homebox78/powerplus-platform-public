<!-- 오른쪽 클릭 메뉴 · ContextMenuRadioItem — shadcn-vue ContextMenuRadioItem 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { ContextMenuRadioItem as R, ContextMenuItemIndicator as RIndicator } from "reka-ui";
defineProps<{ value: string }>();
</script>

<template>
  <R :value="value" class="hb-menu-item has-indicator">
    <RIndicator class="hb-menu-indicator hb-menu-dot" />
    <slot />
  </R>
</template>
