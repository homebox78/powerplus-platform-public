<!-- 표 행 — selected 면 배경 강조 + aria-selected -->
<script setup lang="ts">
defineProps<{ selected?: boolean }>();
</script>

<template>
  <tr :aria-selected="selected || undefined" :class="{ 'hb-row-selected': selected }"><slot /></tr>
</template>
