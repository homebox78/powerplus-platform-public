<!-- 입력 필드 — KRDS 「텍스트 입력(text_input)」 · shadcn-vue Input 과 같은 사용법
  <Input v-model="name" size="medium" placeholder="이름을 입력하세요" />
  Field 안에서 쓰면 id·도움말 연결·오류 상태를 자동으로 받는다. -->
<script setup lang="ts">
import { useFieldControl } from "./field-context";

const props = withDefaults(
  defineProps<{ size?: "small" | "medium" | "large" | "xlarge"; type?: string; invalid?: boolean; id?: string; required?: boolean; disabled?: boolean }>(),
  { size: "large", type: "text", invalid: undefined, required: undefined, disabled: undefined },
);
const model = defineModel<string>();
const f = useFieldControl(() => ({ id: props.id, invalid: props.invalid, required: props.required, disabled: props.disabled }));
</script>

<template>
  <input v-model="model" :type="type" :class="['krds-input', size]" v-bind="f" />
</template>
