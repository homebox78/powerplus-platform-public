<!-- 텍스트 목록 항목 — num 은 번호 목록의 번호 글자("1." "가." "①") -->
<script setup lang="ts">
defineProps<{ num?: string }>();
</script>

<template>
  <li><span v-if="num" class="num">{{ num }} </span><slot /></li>
</template>
