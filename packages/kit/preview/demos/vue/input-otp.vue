<script setup lang="ts">
import { ref } from "vue";
import { InputOTP } from "../../../vue";
const done = ref("");
</script>

<template>
  <div style="display: grid; gap: 24px">
    <div style="display: grid; gap: 8px">
      <p class="hb-label">휴대전화 인증번호</p>
      <InputOTP :length="6" size="medium" aria-label="휴대전화 인증번호" model-value="4821" @complete="done = $event" />
      <p class="form-hint" style="font-size: 15px">{{ done ? `입력 완료: ${done}` : "문자로 받은 6자리 숫자를 입력하세요. (남은 시간 2:48)" }}</p>
    </div>
    <div style="display: grid; gap: 8px">
      <p class="hb-label">이메일 확인 코드</p>
      <InputOTP :length="6" size="medium" pattern="alphanumeric" :separator-after="3" aria-label="이메일 확인 코드" />
    </div>
    <div style="display: grid; gap: 8px">
      <p class="hb-label">잘못된 인증번호</p>
      <InputOTP :length="4" size="medium" invalid model-value="1234" aria-label="잘못된 인증번호 예시" />
    </div>
  </div>
</template>
