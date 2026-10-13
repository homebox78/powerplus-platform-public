<!-- 레이블 — shadcn-vue Label 과 같은 사용법
  <Label for="apply-name" required>신청인 이름</Label> -->
<script setup lang="ts">
defineProps<{ required?: boolean; disabled?: boolean }>();
</script>

<template>
  <label :class="['hb-label', disabled && 'is-disabled']">
    <slot /><template v-if="required"><span class="hb-required" aria-hidden="true">*</span><span class="sr-only">(필수)</span></template>
  </label>
</template>
