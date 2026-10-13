<!-- 단계 표시기 — KRDS 「단계 표시기」
  <StepIndicator :steps="['유의 사항 확인', '신청인 정보', '이사 전 주소']" :current="2" />
  지난 단계 done(체크), 현재 단계 active. 색만으로 구분하지 않게 화면 밖 글자 "완료"·"현재단계". -->
<script setup lang="ts">
withDefaults(defineProps<{ steps: string[]; current: number; ariaLabel?: string }>(), { ariaLabel: "진행 단계" });
</script>

<template>
  <ol :aria-label="ariaLabel" class="krds-step-wrap">
    <li
      v-for="(title, i) in steps"
      :key="i"
      :class="i + 1 < current ? 'done' : i + 1 === current ? 'active' : undefined"
      :aria-current="i + 1 === current ? 'step' : undefined"
    >
      <span>
        <em v-if="i + 1 === current" class="sr-only">현재단계</em>
        <i class="step">{{ i + 1 }}단계</i>
        <span class="step-tit">{{ title }}<span v-if="i + 1 < current" class="sr-only"> 완료</span></span>
      </span>
    </li>
  </ol>
</template>
