<script setup lang="ts">
import { Field, FieldLabel, FieldControl, FieldDescription, FieldError, Select, Input, Button } from "../../../vue";

const SIDO = [
  { value: "hanbit", label: "한빛시" },
  { value: "saesol", label: "새솔군" },
  { value: "pureun", label: "푸른구" },
  { value: "gangbyeon", label: "강변구(통합 예정)", disabled: true },
  { value: "haeon", label: "해온시" },
  { value: "dalbit", label: "달빛군" },
];
const TYPES = [
  { value: "all", label: "전체" },
  { value: "title", label: "제목" },
  { value: "body", label: "내용" },
  { value: "dept", label: "담당 부서" },
];
const SORT = [
  { value: "new", label: "최신순" },
  { value: "view", label: "조회순" },
  { value: "name", label: "이름순" },
];
</script>

<template>
  <div class="fieldset" style="max-width: 480px">
    <Field>
      <FieldLabel>거주 지역</FieldLabel>
      <FieldControl><Select :options="SIDO" placeholder="시·군·구 선택" /></FieldControl>
      <FieldDescription>주민등록상 주소지를 골라 주세요.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel>거주 지역(선택 완료)</FieldLabel>
      <FieldControl><Select size="medium" :options="SIDO" model-value="hanbit" /></FieldControl>
    </Field>
    <Field invalid>
      <FieldLabel>신청 구분</FieldLabel>
      <FieldControl><Select size="medium" :options="TYPES" placeholder="구분 선택" /></FieldControl>
      <FieldError>신청 구분을 골라 주세요.</FieldError>
    </Field>
    <Field disabled>
      <FieldLabel>처리 기관</FieldLabel>
      <FieldControl><Select size="small" :options="SIDO" model-value="hanbit" /></FieldControl>
    </Field>
  </div>
  <div class="pv-row">
    <span>정렬</span>
    <Select variant="sort" size="small" :options="SORT" model-value="new" aria-label="정렬 기준(small)" />
    <Select variant="sort" size="medium" :options="SORT" model-value="view" aria-label="정렬 기준(medium)" />
    <Select variant="sort" size="large" :options="SORT" model-value="name" aria-label="정렬 기준(large)" />
  </div>
  <form role="search" class="hb-form-row" data-same-row="" style="max-width: 720px" @submit.prevent>
    <div class="hb-fixed" style="width: 140px">
      <Select size="medium" :options="TYPES" model-value="all" aria-label="검색 범위" />
    </div>
    <div class="hb-grow">
      <Input size="medium" placeholder="공지사항 검색어를 입력하세요" aria-label="검색어" />
    </div>
    <Button type="submit" size="medium" class="hb-fixed">검색</Button>
  </form>
</template>
