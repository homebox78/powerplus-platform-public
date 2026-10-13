<!-- 슬라이더 — shadcn-vue Slider 와 비슷한 사용법 (KRDS 에 없음 → css/parts/b-form.css)
  <Slider v-model="size" label="글자 크기" :min="80" :max="150" :step="10" unit="%" />
  실제 input[type=range] — 방향키·Home·End·PageUp/Down 이 브라우저 기본으로 동작, aria-valuetext 로 단위를 붙여 읽힌다. -->
<script setup lang="ts">
import { computed } from "vue";
import { useUid } from "./utils";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{ label?: string; min?: number; max?: number; step?: number; unit?: string; marks?: string[]; hideValue?: boolean; id?: string }>(),
  { min: 0, max: 100, step: 1, unit: "" },
);
const model = defineModel<number>();
const current = computed(() => model.value ?? props.min);
const sid = props.id ?? useUid("hb-slider");
const pct = computed(() => (props.max > props.min ? ((current.value - props.min) / (props.max - props.min)) * 100 : 0));
const text = computed(() => `${current.value}${props.unit}`);
</script>

<template>
  <div class="hb-slider-wrap">
    <div v-if="label || !hideValue" class="hb-slider-head">
      <label v-if="label" class="hb-label" :for="sid">{{ label }}</label>
      <output v-if="!hideValue" class="hb-slider-output" :for="sid">{{ text }}</output>
    </div>
    <input
      :id="sid"
      type="range"
      class="hb-slider"
      :min="min"
      :max="max"
      :step="step"
      :value="current"
      :aria-valuetext="text"
      :style="{ '--hb-slider-pct': `${pct}%` }"
      v-bind="$attrs"
      @input="model = Number(($event.target as HTMLInputElement).value)"
    />
    <div v-if="marks && marks.length" class="hb-slider-marks" aria-hidden="true">
      <span v-for="m in marks" :key="m">{{ m }}</span>
    </div>
  </div>
</template>
