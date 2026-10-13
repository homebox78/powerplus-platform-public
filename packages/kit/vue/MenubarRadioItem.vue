<!-- 메뉴 막대 · MenubarRadioItem — shadcn-vue MenubarRadioItem 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { MenubarRadioItem as R, MenubarItemIndicator as RIndicator } from "reka-ui";
defineProps<{ value: string }>();
</script>

<template>
  <R :value="value" class="hb-menu-item has-indicator">
    <RIndicator class="hb-menu-indicator hb-menu-dot" />
    <slot />
  </R>
</template>
