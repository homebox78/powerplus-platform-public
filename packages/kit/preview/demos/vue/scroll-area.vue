<script setup lang="ts">
import { ScrollArea } from "../../../vue";

const TERMS = [
  "제1조(목적) 이 약관은 한빛시 누리집이 제공하는 전자 민원 서비스의 이용 조건과 절차를 정합니다.",
  "제2조(정의) 「이용자」란 누리집에 접속하여 이 약관에 따라 서비스를 받는 사람을 말합니다.",
  "제3조(약관의 효력) 이 약관은 누리집에 게시하여 공지함으로써 효력이 생깁니다.",
  "제4조(서비스의 제공) 시는 민원 신청, 증명서 발급, 수수료 결제 서비스를 제공합니다.",
  "제5조(서비스의 중단) 시스템 점검 등 부득이한 경우 서비스를 일시 중단할 수 있으며 미리 알립니다.",
  "제6조(개인정보 보호) 시는 관계 법령에 따라 이용자의 개인정보를 보호합니다.",
  "제7조(이용자의 의무) 이용자는 다른 사람의 정보를 도용하여서는 안 됩니다.",
];
const LINKS = ["정부24", "국민신문고", "한빛시 평생학습관", "한빛시 공공 도서관", "한빛시 문화재단", "한빛시 시설관리공단", "한빛시 보건소", "한빛시 의회"];
</script>

<template>
  <ScrollArea aria-label="전자 민원 서비스 이용약관 전문" style="height: 200px; border: 1px solid var(--krds-light-color-border-gray-light); padding: 16px">
    <p v-for="t in TERMS" :key="t" style="margin-bottom: 12px">{{ t }}</p>
  </ScrollArea>
  <ScrollArea orientation="horizontal" aria-label="관련 누리집" style="border: 1px solid var(--krds-light-color-border-gray-light); padding: 12px">
    <ul style="display: flex; gap: 12px; width: max-content">
      <li v-for="l in LINKS" :key="l"><a href="#" class="krds-btn tertiary medium">{{ l }}</a></li>
    </ul>
  </ScrollArea>
</template>
