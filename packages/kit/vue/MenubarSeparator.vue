<!-- 메뉴 막대 · MenubarSeparator — shadcn-vue MenubarSeparator 와 같은 사용법. 동작은 reka-ui. -->
<script setup lang="ts">
import { MenubarSeparator as R } from "reka-ui";
</script>

<template>
  <R class="hb-menu-separator"><slot /></R>
</template>
