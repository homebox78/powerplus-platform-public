<!-- 비율 상자 — shadcn-vue AspectRatio
  <AspectRatio :ratio="16 / 9"><img src="/img/visual.jpg" alt="한빛시청 전경" /></AspectRatio>
  안의 사진·영상은 상자를 가득 채운다. fit="contain" 이면 잘리지 않게 맞춘다. -->
<script setup lang="ts">
withDefaults(defineProps<{ ratio?: number; fit?: "cover" | "contain" }>(), { ratio: 1, fit: "cover" });
</script>

<template>
  <div :class="['hb-aspect-ratio', fit === 'contain' && 'contain']" :style="{ aspectRatio: String(ratio) }"><slot /></div>
</template>
