<script setup lang="ts">
import { Link, Separator } from "../../../vue";
</script>

<template>
  <div style="max-width: 480px">
    <p style="font-weight: 700">한빛시 민원 안내</p>
    <p>평일 09:00 ~ 18:00 (점심시간 12:00 ~ 13:00)</p>
    <Separator :style="{ margin: '16px 0' }" :decorative="false" />
    <div style="display: flex; align-items: center; gap: 12px; height: 24px">
      <Link href="#separator" tone="basic" underline="none" size="small">이용약관</Link>
      <Separator orientation="vertical" />
      <Link href="#separator" tone="basic" underline="none" size="small">개인정보처리방침</Link>
      <Separator orientation="vertical" />
      <Link href="#separator" tone="basic" underline="none" size="small">찾아오시는 길</Link>
    </div>
  </div>
</template>
