<script setup lang="ts">
import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "../../../vue";

const services = [
  { icon: "ico-file", title: "주민등록표 등본 발급", desc: "온라인 발급 · 수수료 무료 · 즉시 출력" },
  { icon: "ico-calendar", title: "문화센터 강좌 예약", desc: "매월 1일 10시 접수 시작 · 선착순" },
  { icon: "ico-call", title: "120 한빛콜센터 상담", desc: "평일 08:00~22:00 · 주말 09:00~18:00" },
];
</script>

<template>
  <ItemGroup aria-label="자주 찾는 민원">
    <Item v-for="s in services" :key="s.title" variant="outline">
      <ItemMedia variant="icon"><i :class="['svg-icon', s.icon]" aria-hidden="true" /></ItemMedia>
      <ItemContent>
        <ItemTitle>{{ s.title }}</ItemTitle>
        <ItemDescription>{{ s.desc }}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button size="small" variant="secondary" :aria-label="`${s.title} 바로가기`">바로가기</Button>
      </ItemActions>
    </Item>
  </ItemGroup>
  <ItemGroup aria-label="담당자 연락처" style="max-width: 520px">
    <Item variant="muted" size="small">
      <ItemContent>
        <ItemTitle>민원여권과 · 김한빛 주무관</ItemTitle>
        <ItemDescription>여권 발급·재발급 문의 031-000-1234</ItemDescription>
      </ItemContent>
    </Item>
    <ItemSeparator />
    <Item variant="muted" size="small">
      <ItemContent>
        <ItemTitle>시민봉사과 · 이누리 주무관</ItemTitle>
        <ItemDescription>제증명 발급 문의 031-000-5678</ItemDescription>
      </ItemContent>
    </Item>
  </ItemGroup>
</template>
