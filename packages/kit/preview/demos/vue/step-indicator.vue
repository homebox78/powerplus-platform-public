<script setup lang="ts">
import { StepIndicator } from "../../../vue";
</script>

<template>
  <StepIndicator aria-label="전입 신고 단계" :steps="['유의 사항 확인', '신청인 정보', '이사 전 주소', '이사 온 주소']" :current="3" />
  <StepIndicator aria-label="여권 발급 신청 단계" :steps="['본인 인증', '신청서 작성', '사진 등록', '수수료 결제', '접수 완료']" :current="1" />
</template>
