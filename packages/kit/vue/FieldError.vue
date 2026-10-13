<!-- 오류 문구 — FieldMessage tone="error" 의 줄임 -->
<script setup lang="ts">
import FieldMessage from "./FieldMessage.vue";
</script>

<template>
  <FieldMessage tone="error"><slot /></FieldMessage>
</template>
