<script setup lang="ts">
import { Label, Input } from "../../../vue";
</script>

<template>
  <div style="display: grid; gap: 16px; max-width: 480px">
    <div style="display: grid; gap: 8px">
      <Label for="lb-name-v" required>신청인 이름</Label>
      <Input id="lb-name-v" size="medium" placeholder="홍길동" autocomplete="name" />
    </div>
    <div style="display: grid; gap: 8px">
      <Label for="lb-tel-v">연락처</Label>
      <Input id="lb-tel-v" size="medium" placeholder="010-0000-0000" inputmode="tel" autocomplete="tel" />
    </div>
    <div style="display: grid; gap: 8px">
      <Label for="lb-no-v" disabled>접수번호(자동 부여)</Label>
      <Input id="lb-no-v" size="medium" model-value="2026-한빛-004817" disabled readonly />
    </div>
  </div>
</template>
