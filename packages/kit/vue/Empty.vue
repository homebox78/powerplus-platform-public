<!-- 빈 상태 — shadcn-vue Empty (KRDS 토큰)
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon" icon="sch" />
      <EmptyTitle>검색 결과가 없습니다</EmptyTitle>
      <EmptyDescription>다른 낱말로 검색해 보세요.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent><Button variant="secondary">전체 목록 보기</Button></EmptyContent>
  </Empty> -->
<script setup lang="ts">
defineProps<{ bordered?: boolean }>();
</script>

<template>
  <div :class="['hb-empty', bordered && 'bordered']"><slot /></div>
</template>
