<!-- 목록 위 도구 줄 — 기본 슬롯(왼쪽: 전체선택·핵심 버튼) · #sort(오른쪽) -->
<template>
  <div class="search-list-top hb-sl-toolbar">
    <div class="sch-left"><slot /></div>
    <div v-if="$slots.sort" class="sch-sort hb-sl-right"><slot name="sort" /></div>
  </div>
</template>
