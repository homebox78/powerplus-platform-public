<!-- 표 — KRDS 「표」 · shadcn-vue Table 과 같은 사용법
  <Table>
    <TableCaption>2026년 민원 처리 현황 — 구분·접수·처리·처리율로 구성</TableCaption>
    <TableHeader><TableRow><TableHead>구분</TableHead>…</TableRow></TableHeader>
    <TableBody><TableRow><TableHead scope="row">여권</TableHead><TableCell align="right">1,204</TableCell></TableRow></TableBody>
  </Table>
  정렬: 머리칸 가운데(기본) · 긴 글 왼쪽(기본) · 비교 숫자 align="right" · 짧은 값·날짜·상태 align="center".
  class 등 속성은 <table> 에 붙는다(React 판과 같게). -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false });
defineProps<{ scroll?: boolean; wrapClass?: string }>();
</script>

<template>
  <div :class="['krds-table-wrap', { scroll }, wrapClass]">
    <table class="tbl col data hb-table" v-bind="$attrs"><slot /></table>
  </div>
</template>
