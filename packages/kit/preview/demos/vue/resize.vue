<script setup lang="ts">
import { ref } from "vue";
import { Resize } from "../../../vue";
const step = ref<"sm" | "md" | "lg" | "xlg" | "xxlg">("md");
</script>

<template>
  <div style="min-height: 360px">
    <Resize v-model="step" target="#hb-resize-demo" align="left" />
    <div
      id="hb-resize-demo"
      class="hb-resize-demo-box pv-mt"
      style="padding: 16px; background: var(--krds-light-color-surface-gray-subtler); border-radius: 8px"
    >
      <p style="font-size: var(--krds-pc-font-size-heading-small); font-weight: 700">2026년 하반기 주민자치 프로그램 수강생 모집</p>
      <p style="font-size: var(--krds-pc-font-size-body-medium)">
        한빛시 주민자치센터에서 서예·요가·생활영어 강좌 수강생을 모집합니다. 신청은 9월 30일까지입니다.
      </p>
    </div>
  </div>
</template>
