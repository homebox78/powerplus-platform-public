<!-- 구조화 목록(카드형) — KRDS 「구조화 목록」
  <StructuredList>
    <StructuredListItem href="/support/1" title="청년 월세 한시 특별지원" description="…"
      :meta="[{ label: '신청 기간', value: '2026.09.01 ~ 2026.10.31' }]" :tags="['주거', '청년']">
      <template #badge><span class="krds-badge bg-light-primary">접수중</span></template>
      <template #action><Button variant="secondary" as="a" href="/apply">신청하기</Button></template>
    </StructuredListItem>
  </StructuredList>
  size: small · medium(기본) · large, full = 한 줄에 하나씩 -->
<script setup lang="ts">
withDefaults(defineProps<{ size?: "small" | "medium" | "large"; full?: boolean }>(), { size: "medium" });
</script>

<template>
  <ul :class="['krds-structured-list', { sm: size === 'small', lg: size === 'large', 'type-full': full }]"><slot /></ul>
</template>
