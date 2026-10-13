<script setup lang="ts">
import { Button, ButtonGroup, ButtonGroupText } from "../../../vue";
</script>

<template>
  <div class="pv-row">
    <ButtonGroup aria-label="게시글 이동">
      <Button variant="tertiary" icon="angle left" icon-position="start">이전 글</Button>
      <Button variant="tertiary">목록</Button>
      <Button variant="tertiary" icon="angle right">다음 글</Button>
    </ButtonGroup>
    <ButtonGroup aria-label="민원 검색">
      <ButtonGroupText>민원 번호</ButtonGroupText>
      <Button variant="tertiary" icon-only icon="sch">검색</Button>
    </ButtonGroup>
  </div>
  <div class="pv-row">
    <ButtonGroup aria-label="공유">
      <Button variant="secondary" size="small" icon="print" icon-position="start">인쇄</Button>
      <Button variant="secondary" size="small" icon="share" icon-position="start">공유</Button>
      <Button variant="secondary" size="small" icon="scrap" icon-position="start">스크랩</Button>
    </ButtonGroup>
    <ButtonGroup orientation="vertical" aria-label="지도 확대·축소">
      <Button variant="tertiary" size="small">확대</Button>
      <Button variant="tertiary" size="small">축소</Button>
    </ButtonGroup>
  </div>
</template>
