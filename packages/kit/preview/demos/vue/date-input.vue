<script setup lang="ts">
import { ref } from "vue";
import { Field, FieldLabel, FieldControl, FieldDescription, DateInput, DateRangeInput } from "../../../vue";

const d = ref("2026-10-09");
const from = ref("2026-09-01");
const to = ref("2026-08-31");
const ym = ref("2021-03");
</script>

<template>
  <div class="fieldset" style="max-width: 560px">
    <Field>
      <FieldLabel>방문 예약일</FieldLabel>
      <FieldControl class="calendar-conts"><DateInput v-model="d" size="medium" /></FieldControl>
      <FieldDescription>{{ d ? `선택한 날짜: ${d}` : "날짜를 입력하세요." }}</FieldDescription>
    </Field>
    <Field>
      <FieldLabel>생년월일</FieldLabel>
      <FieldControl class="calendar-conts"><DateInput size="medium" /></FieldControl>
    </Field>
    <Field>
      <FieldLabel>입사 연월 (대략)</FieldLabel>
      <FieldControl class="calendar-conts"><DateInput v-model="ym" size="medium" precision="month" /></FieldControl>
    </Field>
    <div class="form-group" role="group" aria-labelledby="di-range-v">
      <p id="di-range-v" class="form-tit">조회 기간</p>
      <DateRangeInput v-model:start="from" v-model:end="to" size="medium" />
    </div>
  </div>
</template>
