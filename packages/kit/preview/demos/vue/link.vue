<script setup lang="ts">
import { Link } from "../../../vue";
</script>

<template>
  <div class="pv-row">
    <Link href="#link" size="small">공지사항 전체 보기</Link>
    <Link href="#link" size="medium" keep-color>상태가 바뀌어도 색 유지</Link>
    <Link href="https://www.gov.kr" external>정부24 바로가기</Link>
  </div>
  <div class="pv-row">
    <Link href="#link" tone="basic" external>민원 서식 모음(새 창)</Link>
    <Link href="#link" tone="basic" underline="hover">개인정보처리방침</Link>
    <Link href="#link" tone="basic" underline="none">찾아오시는 길</Link>
  </div>
  <div class="pv-row">
    <Link href="/files/guide.pdf" download :file-size="2400000">신청 안내서</Link>
    <Link href="/files/form.hwp" tone="basic" download :file-size="86000">민원 신청서 양식</Link>
  </div>
</template>
