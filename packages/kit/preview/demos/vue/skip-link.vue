<script setup lang="ts">
import { SkipLink } from "../../../vue";
const links = [
  { href: "#contents", label: "본문 바로가기" },
  { href: "#gnb", label: "주메뉴 바로가기" },
];
</script>

<template>
  <SkipLink preview :links="links" />
  <p class="pv-mt">아래 자리에 초점이 오면 "본문 바로가기"가 나타납니다.</p>
  <SkipLink inline href="#contents" />
</template>
