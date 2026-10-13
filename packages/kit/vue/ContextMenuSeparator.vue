<!-- 오른쪽 클릭 메뉴 · ContextMenuSeparator — shadcn-vue ContextMenuSeparator 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { ContextMenuSeparator as R } from "reka-ui";
</script>

<template>
  <R class="hb-menu-separator"><slot /></R>
</template>
