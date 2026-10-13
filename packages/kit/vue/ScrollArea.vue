<!-- 스크롤 영역 — shadcn-vue ScrollArea 와 같은 사용법 (모양은 홈박스: 얇은 막대)
  <ScrollArea aria-label="개인정보 처리방침 전문" style="height: 240px">…</ScrollArea>
  키보드 사용자도 스크롤할 수 있게 영역이 Tab 으로 들어간다 — 이름(aria-label)을 꼭 준다. -->
<script setup lang="ts">
withDefaults(defineProps<{ orientation?: "vertical" | "horizontal" | "both" }>(), { orientation: "vertical" });
</script>

<template>
  <div role="region" tabindex="0" :data-orientation="orientation" class="hb-scroll-area"><slot /></div>
</template>
