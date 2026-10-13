<!-- 텍스트 영역 — KRDS 「텍스트 영역(textarea)」 · shadcn-vue Textarea 와 같은 사용법
  <Textarea v-model="body" show-count :maxlength="500" placeholder="민원 내용을 적어 주세요" /> -->
<script setup lang="ts">
import { computed } from "vue";
import { useUid } from "./utils";
import { useFieldControl, useSplitAttrs } from "./field-context";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{ showCount?: boolean; maxlength?: number; invalid?: boolean; id?: string; required?: boolean; disabled?: boolean }>(),
  { invalid: undefined, required: undefined, disabled: undefined },
);
const model = defineModel<string>({ default: "" });
const countId = useUid("hb-count");
const f = useFieldControl(() => ({ id: props.id, invalid: props.invalid, required: props.required, disabled: props.disabled }));
const { outer, inner } = useSplitAttrs();
const described = computed(() => [f.value["aria-describedby"], props.showCount && countId].filter(Boolean).join(" ") || undefined);
</script>

<template>
  <div v-if="showCount" :class="['textarea-wrap', f['aria-invalid'] && 'is-error', outer.class]" :style="outer.style as any">
    <textarea v-model="model" class="krds-input" :maxlength="maxlength" v-bind="{ ...inner, ...f }" :aria-describedby="described"></textarea>
    <p :id="countId" class="textarea-count">
      <span class="sr-only">입력한 글자 수</span>
      <span class="count-now">{{ model.length }}</span><span v-if="maxlength != null" class="count-total">/{{ maxlength }}</span>
    </p>
  </div>
  <textarea v-else v-model="model" :class="['krds-input', outer.class]" :style="outer.style as any" :maxlength="maxlength" v-bind="{ ...inner, ...f }"></textarea>
</template>
