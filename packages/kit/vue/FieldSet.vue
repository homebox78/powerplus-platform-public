<!-- 여러 필드 묶음 — legend 를 주면 fieldset 제목 -->
<script setup lang="ts">
defineProps<{ legend?: string }>();
</script>

<template>
  <fieldset class="hb-fieldset">
    <legend v-if="legend || $slots.legend" class="hb-fieldset-legend"><slot name="legend">{{ legend }}</slot></legend>
    <div class="fieldset"><slot /></div>
  </fieldset>
</template>
