<script setup lang="ts">
import { ref } from "vue";
import { DataTable } from "../../../vue";

interface Row {
  no: string;
  title: string;
  date: string;
  fee: number;
  status: string;
}

const data: Row[] = [
  { no: "2026-0915", title: "주민등록표 등본 발급", date: "2026.09.15", fee: 0, status: "처리 완료" },
  { no: "2026-0916", title: "여권 재발급(분실)", date: "2026.09.16", fee: 53000, status: "처리 중" },
  { no: "2026-0917", title: "가족관계증명서 발급", date: "2026.09.17", fee: 1000, status: "처리 완료" },
  { no: "2026-0918", title: "건축물대장 발급", date: "2026.09.18", fee: 500, status: "접수" },
  { no: "2026-0919", title: "토지이용계획확인서", date: "2026.09.19", fee: 1000, status: "처리 중" },
  { no: "2026-0920", title: "자동차 이전등록 신청", date: "2026.09.20", fee: 7000, status: "보완 요청" },
  { no: "2026-0921", title: "지방세 납세증명서", date: "2026.09.21", fee: 0, status: "처리 완료" },
];

const columns = [
  { key: "no", header: "접수번호", align: "center" as const, sortable: true, width: "130px" },
  { key: "title", header: "민원명", rowHeader: true },
  { key: "date", header: "접수일", align: "center" as const, sortable: true, width: "130px" },
  { key: "fee", header: "수수료(원)", align: "right" as const, sortable: true, width: "130px", cell: (r: Row) => r.fee.toLocaleString() },
  { key: "status", header: "처리 상태", align: "center" as const, width: "120px" },
];

const picked = ref<string[]>(["2026-0916"]);
</script>

<template>
  <DataTable
    v-model:selected="picked"
    caption="민원 신청 목록 — 선택, 접수번호, 민원명, 접수일, 수수료, 처리 상태로 구성"
    :columns="columns"
    :data="data"
    :row-key="(r: Row) => r.no"
    selectable
    :page-size="5"
    :default-sort="{ key: 'date', dir: 'descending' }"
  />
</template>
