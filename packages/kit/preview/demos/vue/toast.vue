<script setup lang="ts">
import { Button, Toaster } from "../../../vue";
import { toast } from "../../../vue/toast";

const wait = (ms: number, ok = true) => new Promise<string>((res, rej) => setTimeout(() => (ok ? res("2026-0412") : rej(new Error())), ms));
const success = () => toast.success("민원이 접수되었습니다", { description: "접수번호 2026-0412 · 처리 기간 4일" });
const error = () =>
  toast.error("서류를 전송하지 못했습니다", {
    description: "네트워크 연결을 확인해 주세요.",
    action: { label: "다시 시도", onClick: () => toast.success("다시 전송했습니다") },
  });
const promise = () =>
  toast.promise(wait(1500), { loading: "신청서를 제출하는 중입니다", success: (no) => "제출했습니다(접수번호 " + no + ")", error: "제출하지 못했습니다" });
</script>

<template>
  <div class="pv-row">
    <Toaster />
    <Button variant="tertiary" @click="toast('민원 신청서를 임시 저장했습니다')">기본</Button>
    <Button variant="tertiary" @click="success">성공</Button>
    <Button variant="tertiary" @click="toast.info('10월 3일은 휴무라 민원실을 운영하지 않습니다')">안내</Button>
    <Button variant="tertiary" @click="toast.warning('첨부 파일 용량이 20MB에 가깝습니다')">주의</Button>
    <Button variant="tertiary" @click="error">오류 + 다시 시도</Button>
    <Button variant="tertiary" @click="promise">처리 중 → 완료</Button>
  </div>
</template>
