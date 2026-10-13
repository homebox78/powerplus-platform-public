<!-- 버튼 묶음 안의 글자 칸 — 옆 버튼과 같은 size 를 준다. -->
<script setup lang="ts">
withDefaults(defineProps<{ size?: "xsmall" | "small" | "medium" | "large" | "xlarge" }>(), { size: "medium" });
</script>

<template>
  <span :class="['hb-button-group-text', size]"><slot /></span>
</template>
