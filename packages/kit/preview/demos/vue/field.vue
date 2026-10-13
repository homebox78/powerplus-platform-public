<script setup lang="ts">
import { computed, ref } from "vue";
import { Field, FieldLabel, FieldControl, FieldDescription, FieldError, FieldSet, Input, Select, Button } from "../../../vue";

const DONG = [
  { value: "center", label: "중앙동" },
  { value: "river", label: "강변동" },
  { value: "hill", label: "새솔동" },
];
const name = ref("");
const tried = ref(false);
const nameErr = computed(() => (tried.value && !name.value.trim() ? "신청인 이름을 입력해 주세요." : ""));
</script>

<template>
  <form novalidate style="max-width: 560px" @submit.prevent="tried = true">
    <FieldSet legend="전입 신고 신청인 정보">
      <Field required :invalid="!!nameErr">
        <FieldLabel>신청인 이름</FieldLabel>
        <FieldControl><Input v-model="name" size="medium" autocomplete="name" /></FieldControl>
        <FieldDescription>주민등록상의 이름을 적어 주세요.</FieldDescription>
        <FieldError v-if="nameErr">{{ nameErr }}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>전입할 동</FieldLabel>
        <FieldControl><Select size="medium" :options="DONG" placeholder="동 선택" /></FieldControl>
      </Field>
      <Field>
        <FieldLabel optional>상세 주소</FieldLabel>
        <FieldControl><Input size="medium" placeholder="아파트 동·호수" /></FieldControl>
      </Field>
      <div><Button type="submit" size="medium">신청하기</Button></div>
    </FieldSet>
  </form>
</template>
