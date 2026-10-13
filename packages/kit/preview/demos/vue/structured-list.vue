<script setup lang="ts">
import { ref } from "vue";
import {
  Button,
  StructuredList,
  StructuredListItem,
  StructuredListSort,
  StructuredListTable,
  StructuredListToolbar,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../vue";

const cards = [
  {
    badge: "접수중",
    badgeClass: "bg-light-primary",
    title: "청년 월세 한시 특별지원",
    desc: "만 19~34세 무주택 청년에게 월 최대 20만 원을 12개월 동안 지원합니다. 부모와 따로 사는 청년이 대상입니다.",
    period: "2026.09.01 ~ 2026.10.31",
    tags: ["주거", "청년"],
  },
  {
    badge: "상시",
    badgeClass: "bg-light-success",
    title: "어르신 교통카드 발급",
    desc: "만 65세 이상 한빛시민은 시내버스·도시철도를 무료로 이용할 수 있습니다. 주민센터에서 바로 발급합니다.",
    period: "상시 접수",
    tags: ["교통", "어르신"],
  },
  {
    badge: "마감",
    badgeClass: "bg-secondary",
    title: "소상공인 경영안정자금",
    desc: "매출이 줄어든 관내 소상공인에게 최대 2천만 원의 운영자금을 연 2% 이자로 빌려드립니다.",
    period: "2026.07.01 ~ 2026.08.29",
    tags: ["경제", "창업"],
  },
];

const files = [
  { kind: "고시", title: "2026년 도시계획시설 결정 고시", size: "1.2MB", date: "2026.09.22" },
  { kind: "공고", title: "한빛시 공공청사 주차장 운영 변경 공고", size: "384KB", date: "2026.09.19" },
  { kind: "계획", title: "2026 한빛시 탄소중립 이행계획", size: "5.6MB", date: "2026.09.12" },
];
const sort = ref("관련도순");
</script>

<template>
  <StructuredList>
    <StructuredListItem
      v-for="c in cards"
      :key="c.title"
      href="#"
      :title="c.title"
      :description="c.desc"
      :meta="[{ label: '신청 기간', value: c.period }]"
      :tags="c.tags"
    >
      <template #badge><span :class="['krds-badge', c.badgeClass]">{{ c.badge }}</span></template>
      <template #action>
        <Button variant="secondary" size="medium" as="a" href="#" :title="`${c.title} 신청하기`">신청하기</Button>
      </template>
    </StructuredListItem>
  </StructuredList>

  <StructuredListTable class="pv-mt">
    <StructuredListToolbar>
      <div class="krds-form-check">
        <input id="sl-all-v" type="checkbox" />
        <label for="sl-all-v">전체선택</label>
      </div>
      <Button variant="text" size="medium"><i class="svg-icon ico-down" aria-hidden="true" /> 선택 내려받기</Button>
      <template #sort>
        <StructuredListSort v-model="sort" :options="['관련도순', '최신순', '인기순']" />
      </template>
    </StructuredListToolbar>
    <Table>
      <TableCaption>고시·공고 자료 목록 — 유형, 제목, 크기, 게시일, 내려받기로 구성</TableCaption>
      <colgroup>
        <col style="width: 12%" />
        <col />
        <col style="width: 12%" />
        <col style="width: 16%" />
        <col style="width: 16%" />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead>유형</TableHead>
          <TableHead>제목</TableHead>
          <TableHead>크기</TableHead>
          <TableHead>게시일</TableHead>
          <TableHead><span class="sr-only">내려받기</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="f in files" :key="f.title">
          <TableCell align="center">{{ f.kind }}</TableCell>
          <TableHead scope="row" align="left">{{ f.title }}</TableHead>
          <TableCell align="right">{{ f.size }}</TableCell>
          <TableCell align="center">{{ f.date }}</TableCell>
          <TableCell align="center">
            <Button variant="text" size="medium" :aria-label="`${f.title} 내려받기`">
              <i class="svg-icon ico-down" aria-hidden="true" /> 내려받기
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </StructuredListTable>
</template>
