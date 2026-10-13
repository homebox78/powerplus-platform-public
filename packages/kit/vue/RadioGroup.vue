<!-- 라디오 버튼 묶음 — KRDS 「라디오 버튼」 · shadcn-vue RadioGroup 과 같은 사용법
  <RadioGroup v-model="how" aria-label="수령 방법" column>
    <RadioGroupItem value="visit" label="방문 수령" />
  </RadioGroup>
  같은 name 의 실제 라디오라 방향키 이동·선택은 브라우저가 처리한다. RadioChip 도 이 안에서 쓴다. -->
<script setup lang="ts">
import { computed, provide, reactive } from "vue";
import { useUid } from "./utils";

const props = withDefaults(
  defineProps<{ name?: string; defaultValue?: string; disabled?: boolean; size?: "medium" | "large"; column?: boolean; fill?: boolean }>(),
  { size: "medium", column: true }, // KRDS 116: 기본은 세로로 쌓는다(가로는 :column="false")
);
const model = defineModel<string>();
if (model.value === undefined && props.defaultValue !== undefined) model.value = props.defaultValue;
const auto = useUid("hb-rdo");
provide(
  "hb-radio-group",
  reactive({
    name: computed(() => props.name ?? auto),
    value: computed(() => model.value),
    disabled: computed(() => !!props.disabled),
    size: computed(() => props.size),
    setValue: (v: string) => {
      model.value = v;
    },
  }),
);
</script>

<template>
  <div role="radiogroup" :class="[fill ? 'chip-wrap' : 'krds-check-area', column && !fill && 'chk-column']"><slot /></div>
</template>
