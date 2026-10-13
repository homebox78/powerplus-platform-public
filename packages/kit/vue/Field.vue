<!-- 필드 — KRDS 「폼 레이아웃(form_layout)」 · shadcn-vue Field 와 같은 사용법
  <Field required :invalid="!!err">
    <FieldLabel>이름</FieldLabel>
    <FieldControl><Input /></FieldControl>
    <FieldDescription>주민등록상의 이름을 적어 주세요.</FieldDescription>
    <FieldError v-if="err">{{ err }}</FieldError>
  </Field>
  안의 Input·Textarea·Select 가 id·도움말 연결·오류 상태를 자동으로 받는다. -->
<script setup lang="ts">
import { computed, provide, reactive } from "vue";
import { useUid } from "./utils";
import { HB_FIELD, type HbFieldContext } from "./field-context";

const props = defineProps<{ id?: string; required?: boolean; invalid?: boolean; disabled?: boolean }>();
const auto = useUid("hb-field");
const ctx = reactive({
  id: computed(() => props.id ?? auto),
  invalid: computed(() => !!props.invalid),
  required: computed(() => !!props.required),
  disabled: computed(() => !!props.disabled),
  desc: false,
  msg: false,
  describedBy: computed((): string | undefined => {
    const id = props.id ?? auto;
    return [ctx.desc && `${id}-desc`, ctx.msg && `${id}-msg`].filter(Boolean).join(" ") || undefined;
  }),
}) as unknown as HbFieldContext;
provide(HB_FIELD, ctx);
</script>

<template>
  <div class="form-group"><slot /></div>
</template>
