<!-- 카드 제목 — 기본 <h3>, 문서 구조에 맞게 as="h2" 등 -->
<script setup lang="ts">
withDefaults(defineProps<{ as?: "h2" | "h3" | "h4" | "h5" | "h6" }>(), { as: "h3" });
</script>

<template>
  <component :is="as" class="hb-card-title"><slot /></component>
</template>
