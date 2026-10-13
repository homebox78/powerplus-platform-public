<script setup lang="ts">
import { Button, Spinner } from "../../../vue";
</script>

<template>
  <Spinner>민원 처리 현황을 불러오는 중입니다</Spinner>
  <div class="pv-row">
    <Spinner inline label="저장 중" />
    <span>신청서를 저장하고 있습니다</span>
    <Button variant="tertiary" size="small" disabled>저장 중</Button>
  </div>
</template>
