<script setup lang="ts">
import { SideNavigation } from "../../../vue";

const ITEMS = [
  {
    label: "민원 신청",
    children: [
      { label: "여권 발급", href: "#", current: true },
      {
        label: "증명서 발급",
        children: [
          { label: "주민등록등본", href: "#" },
          { label: "가족관계증명서", href: "#" },
          { label: "지방세 납세증명서", href: "#" },
        ],
      },
      { label: "전입 신고", href: "#" },
    ],
  },
  {
    label: "민원 서식",
    children: [
      { label: "서식 내려받기", href: "#" },
      { label: "작성 예시", href: "#" },
    ],
  },
  { label: "자주 묻는 질문", href: "#" },
];
</script>

<template>
  <div style="max-width: 300px">
    <SideNavigation title="민원 안내" :items="ITEMS" />
  </div>
</template>
