<!-- 드롭다운 메뉴 · DropdownMenuCheckboxItem — shadcn-vue DropdownMenuCheckboxItem 와 같은 사용법. 동작은 reka-ui.
  v-model 로 체크 상태를 묶는다(role=menuitemcheckbox, aria-checked). -->
<script setup lang="ts">
import { DropdownMenuCheckboxItem as R, DropdownMenuItemIndicator as RIndicator } from "reka-ui";
</script>

<template>
  <R class="hb-menu-item has-indicator">
    <RIndicator class="hb-menu-indicator hb-menu-check" />
    <slot />
  </R>
</template>
