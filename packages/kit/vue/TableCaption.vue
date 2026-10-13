<!-- 표 제목 — 기본은 화면에서 숨기고 읽어 준다(KRDS). visible 이면 보인다. -->
<script setup lang="ts">
defineProps<{ visible?: boolean }>();
</script>

<template>
  <caption :class="{ 'hb-caption-visible': visible }"><slot /></caption>
</template>
