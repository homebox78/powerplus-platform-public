<!-- 글자 크기 조절 — KRDS 「화면 크기 조정(resize)」
  <Resize />                       ← 기본: 가장 가까운 .hb-kit 의 글자 크기를 바꾼다
  <Resize target="#contents" />    ← 특정 영역만
  <Resize mode="zoom" />           ← KRDS 원본처럼 zoom 으로 통째로 키운다
  단계: 작게 0.9 · 보통 1 · 조금 크게 1.1 · 크게 1.3 · 가장 크게 1.5 (KRDS --krds-zoom-* 토큰). v-model 로 단계를 묶는다. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { resolveTarget, useGovDrop } from "./govDrop";
import { SCALE_STEPS, applyScale, scaleOf, type ScaleStep } from "./govScale";

const props = withDefaults(
  defineProps<{
    target?: string | HTMLElement | null;
    modelValue?: ScaleStep;
    defaultValue?: ScaleStep;
    mode?: "font" | "zoom";
    label?: string;
    labels?: Partial<Record<ScaleStep, string>>;
    align?: "center" | "left" | "right";
  }>(),
  { defaultValue: "md", mode: "font", label: "화면크기", align: "center" },
);
const emit = defineEmits<{ "update:modelValue": [ScaleStep]; change: [ScaleStep, number] }>();
const d = useGovDrop();
const { wrap, btn, open, wrapClass, menuId } = d;
const inner = ref<ScaleStep>(props.defaultValue);
const value = computed(() => props.modelValue ?? inner.value);
const names = computed<Record<ScaleStep, string>>(() => ({
  sm: "작게",
  md: "보통",
  lg: "조금 크게",
  xlg: "크게",
  xxlg: "가장 크게",
  ...props.labels,
}));

let applied: { el: HTMLElement; mode: "font" | "zoom" } | null = null;
function el() {
  return props.target ? resolveTarget(props.target) : (wrap.value?.closest<HTMLElement>(".hb-kit") ?? resolveTarget(null));
}
function apply() {
  if (applied) applyScale(applied.el, 1, applied.mode);
  const t = el();
  applied = t ? { el: t, mode: props.mode } : null;
  if (t) applyScale(t, scaleOf(value.value), props.mode);
}
onMounted(apply);
watch([value, () => props.mode, () => props.target], apply);
onBeforeUnmount(() => {
  if (applied) applyScale(applied.el, 1, applied.mode);
});

function pick(step: ScaleStep) {
  inner.value = step;
  emit("update:modelValue", step);
  emit("change", step, scaleOf(step));
  d.close(true);
}
</script>

<template>
  <div
    ref="wrap"
    :class="['krds-drop-wrap krds-resize', align !== 'center' && `drop-${align}`, wrapClass]"
    data-adjust="scale"
    @keydown="d.onWrapKeyDown"
    @focusout="d.onWrapFocusOut"
  >
    <button
      ref="btn"
      type="button"
      class="krds-btn small text drop-btn"
      :aria-expanded="open"
      :aria-controls="menuId"
      @click="d.onBtnClick"
      @keydown="d.onBtnKeyDown"
    >
      {{ label }}
      <span class="sr-only">, 현재 {{ names[value] }}</span>
      <i class="svg-icon ico-toggle" aria-hidden="true" />
    </button>
    <div :id="menuId" class="drop-menu">
      <div class="drop-in">
        <ul class="drop-list">
          <li v-for="s in SCALE_STEPS" :key="s">
            <button
              type="button"
              :class="['item-link', s, { active: value === s }]"
              :aria-pressed="value === s"
              :data-adjust-scale="s"
              @click="pick(s)"
            >
              {{ names[s] }}
            </button>
          </li>
        </ul>
        <div class="drop-bottom">
          <button type="button" class="krds-btn medium text" data-adjust-scale="md" @click="pick('md')">
            <i class="svg-icon ico-reset" aria-hidden="true" /> 초기화
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
