<!-- 체크박스 — KRDS 「체크박스(checkbox·checkbox_size)」
  <Checkbox v-model="agree" label="개인정보 수집·이용에 동의합니다" description="필수 동의 항목입니다." />
  실제 input[type=checkbox] + label. class·style 은 바깥 틀에, 나머지 속성은 input 에 붙는다. -->
<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { useUid } from "./utils";
import { useSplitAttrs } from "./field-context";

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ label?: string; description?: string; size?: "medium" | "large"; id?: string; /** 일부만 선택된 상태(전체 선택 체크박스) */ indeterminate?: boolean }>(), { size: "medium" });
const model = defineModel<boolean>({ default: false });
const cid = props.id ?? useUid("hb-chk");
const { outer, inner } = useSplitAttrs();
// indeterminate 는 HTML 속성이 아니라 DOM 프로퍼티라 요소가 생긴 뒤에 넣는다
const box = ref<HTMLInputElement | null>(null);
watchEffect(() => {
  if (box.value) box.value.indeterminate = !!props.indeterminate;
});
</script>

<template>
  <div :class="['krds-form-check', size, outer.class]" :style="outer.style as any">
    <input :id="cid" ref="box" v-model="model" type="checkbox" :aria-describedby="description || $slots.description ? `${cid}-desc` : undefined" v-bind="inner" />
    <label :for="cid"><slot>{{ label }}</slot></label>
    <div v-if="description || $slots.description" class="krds-form-check-cnt">
      <p :id="`${cid}-desc`" class="krds-form-check-p"><slot name="description">{{ description }}</slot></p>
    </div>
  </div>
</template>
