<script setup lang="ts">
import { Progress } from "../../../vue";
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 20px; max-width: 480px">
    <Progress :value="3" :max="5" label="신청서 작성 (3/5단계)" show-value />
    <Progress :value="100" label="서류 제출 완료" show-value color="success" size="small" />
    <Progress :value="25" label="저장 공간 사용량" show-value color="danger" size="large" />
    <Progress label="첨부파일 올리는 중" />
  </div>
</template>
