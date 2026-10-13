<script setup lang="ts">
defineProps<{ split?: boolean }>();
</script>

<template>
  <div :class="['modal-btn btn-wrap', { 'multi-conts': split }]"><slot /></div>
</template>
