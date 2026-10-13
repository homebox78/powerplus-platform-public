<!-- 항목 앞 아이콘·그림 자리 — variant: default · icon(둥근 면) · image(그림 틀) -->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: "default" | "icon" | "image" }>(), { variant: "default" });
</script>

<template>
  <div :class="['hb-item-media', variant !== 'default' && `hb-item-media-${variant}`]"><slot /></div>
</template>
