<script setup lang="ts">
withDefaults(defineProps<{ align?: "start" | "end"; text?: boolean }>(), { align: "start" });
</script>

<template>
  <div :class="['hb-input-group-addon', align, text && 'text']"><slot /></div>
</template>
