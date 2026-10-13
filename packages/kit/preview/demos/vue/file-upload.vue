<script setup lang="ts">
import { FileUpload } from "../../../vue";

const SAMPLE = [
  { id: "f1", name: "위임장(주민등록법 시행령 별지 제15호의2서식).hwp", size: 17 * 1024, status: "uploading" as const },
  { id: "f2", name: "가족관계증명서.pdf", size: 312 * 1024, status: "done" as const },
  {
    id: "f3",
    name: "전입재등록신고서 스캔본.jpg",
    size: 24 * 1024 * 1024,
    status: "error" as const,
    message: "등록 가능한 파일 용량을 초과하였습니다.\n20MB 미만의 파일만 등록할 수 있습니다.",
  },
];
const fakeUpload = () => new Promise<void>((ok) => setTimeout(ok, 1500));
</script>

<template>
  <FileUpload
    title="첨부 서류"
    accept=".hwp,.hwpx,.pdf,.jpg,.jpeg,.png"
    :max-files="10"
    :max-size="20 * 1024 * 1024"
    :model-value="SAMPLE"
    :upload="fakeUpload"
  />
</template>
