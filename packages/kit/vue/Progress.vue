<!-- 진행 막대 — shadcn-vue Progress (KRDS 토큰)
  <Progress :value="60" aria-label="신청서 작성 진행률" />
  <Progress :value="3" :max="5" label="신청 단계" show-value />
  <Progress aria-label="파일 올리는 중" />      ← value 없으면 진행 중(값 모름) -->
<script setup lang="ts">
import { computed } from "vue";
import { useUid } from "./utils";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    value?: number;
    max?: number;
    label?: string;
    showValue?: boolean;
    size?: "small" | "medium" | "large";
    color?: "primary" | "success" | "danger";
  }>(),
  { max: 100, size: "medium", color: "primary" },
);
const id = useUid("hb-progress");
const known = computed(() => props.value !== undefined);
const pct = computed(() => (props.value === undefined ? 0 : Math.min(100, Math.max(0, (props.value / props.max) * 100))));
const text = computed(() => (known.value ? `${Math.round(pct.value)}%` : undefined));
</script>

<template>
  <div :class="['hb-progress-wrap', $attrs.class]">
    <div v-if="label || showValue" class="hb-progress-head">
      <span v-if="label" :id="`${id}-l`">{{ label }}</span>
      <span v-if="showValue && text" class="hb-progress-value" aria-hidden="true">{{ text }}</span>
    </div>
    <div
      v-bind="{ ...$attrs, class: undefined }"
      role="progressbar"
      :aria-labelledby="label ? `${id}-l` : undefined"
      :aria-valuemin="0"
      :aria-valuemax="max"
      :aria-valuenow="known ? value : undefined"
      :aria-valuetext="text"
      :class="['hb-progress', size, color, !known && 'indeterminate']"
    >
      <div class="hb-progress-bar" :style="known ? { width: `${pct}%` } : undefined"></div>
    </div>
  </div>
</template>
