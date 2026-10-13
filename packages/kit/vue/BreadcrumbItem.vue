<script setup lang="ts">
/** home = 첫 항목(홈) — 집 아이콘이 붙는다 */
defineProps<{ home?: boolean }>();
</script>

<template>
  <li :class="{ home }"><slot /></li>
</template>
