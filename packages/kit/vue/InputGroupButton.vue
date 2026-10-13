<!-- 그룹 안 버튼 — KRDS 버튼 모양, 기본은 작은 텍스트 버튼 -->
<script setup lang="ts">
withDefaults(
  defineProps<{ variant?: "primary" | "secondary" | "tertiary" | "text"; size?: "xsmall" | "small" | "medium"; type?: "button" | "submit" | "reset" }>(),
  { variant: "text", size: "small", type: "button" },
);
</script>

<template>
  <button :type="type" :class="['krds-btn', variant, size]"><slot /></button>
</template>
