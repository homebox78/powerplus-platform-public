<script setup lang="ts">
import { ref } from "vue";
import { Button } from "../../../vue";
const sent = ref(0);
const submit = () => new Promise<void>((r) => setTimeout(() => { sent.value++; r(); }, 1500));
const sizes = ["xsmall", "small", "medium", "large", "xlarge"] as const;
</script>

<template>
  <div class="pv-row">
    <Button variant="primary">민원 신청하기</Button>
    <Button variant="secondary">임시 저장</Button>
    <Button variant="tertiary">취소</Button>
    <Button variant="text">자세히 보기</Button>
    <Button disabled>신청 마감</Button>
  </div>
  <div class="pv-row">
    <Button v-for="s in sizes" :key="s" :size="s">{{ s }}</Button>
  </div>
  <div class="pv-row">
    <Button size="small" icon="sch">검색</Button>
    <Button variant="secondary" icon="down">서식 내려받기</Button>
    <Button variant="tertiary" size="large" icon="upload" icon-position="start">파일 올리기</Button>
    <Button as="a" href="#button" variant="tertiary" icon="go">정부24 바로가기</Button>
  </div>
  <div class="pv-row">
    <Button variant="text" size="xsmall" icon="like">찜하기</Button>
    <Button variant="text" size="small" icon="angle right">주민등록표초본</Button>
    <Button variant="text" size="medium" icon="sch">검색</Button>
    <Button variant="text" size="xlarge" icon="more">자세히 보기</Button>
    <Button variant="text" icon="filter" disabled>필터</Button>
  </div>
  <div class="pv-row">
    <Button icon-only icon="sch">검색</Button>
    <Button icon-only icon="help" size="medium">도움말</Button>
    <Button icon-only border icon="refresh" size="large">새로고침</Button>
    <Button icon-only border icon="angle down" size="large" disabled>열기</Button>
  </div>
  <div class="pv-row">
    <Button loading>저장 중</Button>
    <Button variant="secondary" data-pv="pending" @click="submit">신청서 제출</Button>
    <span style="font-size: 14px" aria-live="polite">제출 횟수 {{ sent }}</span>
  </div>
</template>
