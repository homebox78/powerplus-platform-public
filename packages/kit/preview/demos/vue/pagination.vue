<script setup lang="ts">
import { ref } from "vue";
import { Pagination } from "../../../vue";

const page = ref(4);
</script>

<template>
  <Pagination v-model:page="page" :total="99" />
  <Pagination :page="1" :total="5" :get-href="(p: number) => `#page-${p}`" aria-label="공지사항 목록 페이지 이동" />
</template>
