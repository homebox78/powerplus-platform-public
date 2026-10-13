<script setup lang="ts">
import { CheckboxGroup, CheckboxChip, RadioGroup, RadioChip } from "../../../vue";
</script>

<template>
  <CheckboxGroup aria-label="관심 분야" :column="false">
    <CheckboxChip label="복지·건강" :model-value="true" />
    <CheckboxChip label="교통·주차" />
    <CheckboxChip label="문화·관광" :model-value="true" />
    <CheckboxChip label="일자리(모집 마감)" disabled />
  </CheckboxGroup>
  <RadioGroup aria-label="조회 기간" default-value="1m" :column="false">
    <RadioChip value="1w" label="1주일" />
    <RadioChip value="1m" label="1개월" />
    <RadioChip value="3m" label="3개월" />
    <RadioChip value="1y" label="1년" />
  </RadioGroup>
  <RadioGroup aria-label="답변 방식" default-value="sms" fill>
    <RadioChip value="sms" label="문자" />
    <RadioChip value="email" label="이메일" />
    <RadioChip value="call" label="전화" />
  </RadioGroup>
</template>
