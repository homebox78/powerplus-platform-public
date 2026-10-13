<!-- 체크박스·선택 칩 묶음 — role="group", aria-label 이나 aria-labelledby 를 준다 -->
<script setup lang="ts">
withDefaults(defineProps<{ column?: boolean }>(), { column: true }); // KRDS 132: 기본은 세로로 쌓는다(가로는 :column="false")
</script>

<template>
  <div role="group" :class="['krds-check-area', column && 'chk-column']"><slot /></div>
</template>
