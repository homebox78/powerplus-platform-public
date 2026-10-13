<!-- 스켈레톤 — shadcn-vue Skeleton (KRDS 회색 토큰)
  <Skeleton :style="{ width: '240px', height: '20px' }" />
  <Skeleton shape="circle" :style="{ width: '48px', height: '48px' }" />
  <Skeleton shape="text" :lines="3" />
  스크린리더에서는 숨긴다 — 불러오는 영역에 aria-busy 와 안내 글을 따로 둔다. -->
<script setup lang="ts">
withDefaults(defineProps<{ shape?: "rect" | "circle" | "text"; lines?: number }>(), { shape: "rect", lines: 1 });
</script>

<template>
  <div v-if="shape === 'text'" aria-hidden="true" class="hb-skeleton-lines">
    <div v-for="i in lines" :key="i" class="hb-skeleton text"></div>
  </div>
  <div v-else aria-hidden="true" :class="['hb-skeleton', shape === 'circle' && 'circle']"></div>
</template>
