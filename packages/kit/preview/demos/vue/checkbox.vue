<script setup lang="ts">
import { computed, ref } from "vue";
import { Checkbox, CheckboxGroup } from "../../../vue";

const ITEMS = ["주민등록등본", "가족관계증명서", "건강보험 자격득실 확인서"];
const picked = ref<string[]>([ITEMS[0]]);
const all = computed(() => picked.value.length === ITEMS.length);
const some = computed(() => picked.value.length > 0 && !all.value);
function setAll(c: boolean) {
  picked.value = c ? [...ITEMS] : [];
}
function setOne(it: string, c: boolean) {
  picked.value = c ? [...picked.value, it] : picked.value.filter((x) => x !== it);
}
</script>

<template>
  <CheckboxGroup aria-label="상태 예시">
    <Checkbox label="기본" />
    <Checkbox label="선택됨" :model-value="true" />
    <Checkbox label="비활성화" disabled />
    <Checkbox label="선택된 비활성화" disabled :model-value="true" />
  </CheckboxGroup>
  <CheckboxGroup aria-label="약관 동의" column>
    <Checkbox label="[필수] 개인정보 수집·이용 동의" description="신청 처리와 결과 안내를 위해 이름·연락처를 수집합니다." :model-value="true" />
    <Checkbox label="[선택] 한빛시 소식지 받기" description="매월 첫째 주 행사·교육 소식을 문자로 보내 드립니다." />
  </CheckboxGroup>
  <CheckboxGroup aria-label="크기 예시">
    <Checkbox size="medium" label="크기 medium" />
    <Checkbox size="large" label="크기 large" :model-value="true" />
  </CheckboxGroup>
  <CheckboxGroup aria-label="제출 서류" column>
    <Checkbox data-pv="all" label="서류 전체 선택" :model-value="all" :indeterminate="some" @update:model-value="setAll" />
    <Checkbox v-for="it in ITEMS" :key="it" :label="it" :model-value="picked.includes(it)" @update:model-value="(c: boolean) => setOne(it, c)" />
  </CheckboxGroup>
</template>
