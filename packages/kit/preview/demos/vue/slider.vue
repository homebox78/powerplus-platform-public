<script setup lang="ts">
import { Slider } from "../../../vue";
</script>

<template>
  <div style="display: grid; gap: 28px; max-width: 480px">
    <Slider label="글자 크기" :min="80" :max="150" :step="10" :model-value="100" unit="%" :marks="['80%', '115%', '150%']" />
    <Slider label="검색 반경" :min="1" :max="20" :model-value="5" unit="km" :marks="['1km', '20km']" />
    <Slider label="음성 읽기 속도(준비 중)" :min="0" :max="2" :step="0.5" :model-value="1" unit="배" disabled />
  </div>
</template>
