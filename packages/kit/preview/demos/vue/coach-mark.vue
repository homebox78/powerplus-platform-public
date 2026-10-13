<script setup lang="ts">
import { ref } from "vue";
import { Button, CoachMark } from "../../../vue";

const STEPS = [
  { title: "1단계 : 주소 검색", desc: "이사 전 주소를 도로명이나 지번으로 검색해 고르세요.", head: "이사 전 주소", body: "경기도 한빛시 한빛로 123, 101동 1004호" },
  { title: "2단계 : 세대원 선택", desc: "함께 이사하는 세대원을 모두 고르세요.", head: "함께 이사하는 세대원", body: "홍길동(본인), 김영희(배우자), 홍하늘(자녀)" },
  { title: "3단계 : 신청서 제출", desc: "입력한 내용을 확인하고 제출하면 처리 결과를 문자로 알려 드립니다.", head: "신청서 제출", body: "전입 예정일 2026. 10. 15. · 접수처 한빛시 한빛동 행정복지센터" },
];
const step = ref(1);
</script>

<template>
  <div class="hb-coach-stage">
    <CoachMark
      v-for="(s, i) in STEPS"
      :key="s.title"
      :active="step === i + 1"
      :step="i + 1"
      :total="STEPS.length"
      :title="s.title"
      :description="s.desc"
      class="hb-coach-target"
      @next="step = i + 2"
      @prev="step = i"
      @stop="step = 0"
    >
      <h3>{{ s.head }}</h3>
      <p>{{ s.body }}</p>
    </CoachMark>
  </div>
  <div class="pv-row pv-mt">
    <Button variant="tertiary" size="small" :disabled="step !== 0" @click="step = 1">안내 다시 보기</Button>
    <span class="pv-note" aria-live="polite">{{ step === 0 ? "안내를 마쳤습니다." : `${step} / ${STEPS.length} 단계 안내 중` }}</span>
  </div>
</template>
