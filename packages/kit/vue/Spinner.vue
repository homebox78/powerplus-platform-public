<!-- 스피너 — KRDS 「스피너」(krds-spinner, role=status)
  <Spinner />  ·  <Spinner>민원 목록을 불러오는 중입니다</Spinner>  ·  <Spinner inline label="저장 중" /> -->
<script setup lang="ts">
withDefaults(defineProps<{ label?: string; inline?: boolean }>(), { label: "로딩 중" });
</script>

<template>
  <div role="status" :class="['krds-spinner', inline && 'hb-spinner-inline']">
    <span class="sr-only">{{ label }}</span>
    <slot />
  </div>
</template>
