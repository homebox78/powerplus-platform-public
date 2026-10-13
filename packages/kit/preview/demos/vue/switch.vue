<script setup lang="ts">
import { Switch } from "../../../vue";
</script>

<template>
  <div class="pv-row">
    <Switch label="민원 처리 알림 받기" />
    <Switch label="행사 소식 받기" :model-value="true" />
    <Switch label="야간 알림(준비 중)" disabled />
  </div>
  <div class="pv-row">
    <Switch size="large" label="크기 large" :model-value="true" />
    <Switch size="medium" label="크기 medium" />
  </div>
</template>
