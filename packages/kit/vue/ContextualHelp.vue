<!-- 맥락 도움말 — KRDS 「맥락적 도움말(contextual_help)」 마크업 그대로
  <ContextualHelp text="주민등록번호" title="주민등록번호를 왜 입력하나요?" side="bottom" align="left">
    본인 확인과 중복 신청 방지를 위해서만 씁니다.
    <template #action><a href="/guide" class="krds-btn xsmall link basic">개인정보 처리 안내</a></template>
  </ContextualHelp>
  v-model:open 으로 여닫이를 묶을 수 있다. 말풍선은 비모달 대화상자(role=dialog) — 열면 안으로 포커스,
  Esc·닫기로 닫으면 물음표 버튼으로 복귀, 바깥을 누르거나 포커스가 밖으로 나가면 닫힌다. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useUid } from "./utils";

const props = withDefaults(
  defineProps<{
    text?: string;
    title: string;
    side?: "top" | "bottom";
    align?: "left" | "center" | "right";
    open?: boolean;
    defaultOpen?: boolean;
    triggerLabel?: string;
  }>(),
  { side: "top", align: "left", open: undefined, defaultOpen: false, triggerLabel: "도움말" },
);
const emit = defineEmits<{ "update:open": [boolean] }>();
const inner = ref(props.defaultOpen);
const isOpen = computed(() => props.open ?? inner.value);
const base = useUid("hb-ctx-help");
const wrap = ref<HTMLElement>();
const btn = ref<HTMLButtonElement>();
const pop = ref<HTMLElement>();

function set(v: boolean, focusBack = false) {
  inner.value = v;
  emit("update:open", v);
  if (!v && focusBack) btn.value?.focus();
}
function toggle() {
  const next = !isOpen.value;
  set(next);
  if (next) nextTick(() => pop.value?.querySelector<HTMLElement>("a[href], button, [tabindex='0'], input, textarea")?.focus());
}
function onFocusout(e: FocusEvent) {
  if (isOpen.value && e.relatedTarget && !wrap.value?.contains(e.relatedTarget as Node)) set(false);
}
const onDown = (e: MouseEvent) => {
  if (isOpen.value && !wrap.value?.contains(e.target as Node)) set(false);
};
const onKey = (e: KeyboardEvent) => {
  if (isOpen.value && e.key === "Escape") set(false, wrap.value?.contains(document.activeElement) ?? false);
};
onMounted(() => {
  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDown);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div :class="['krds-contextual-help', side, align]">
    <p v-if="text" class="tooltip-txt">{{ text }}</p>
    <div ref="wrap" class="tooltip-action" @focusout="onFocusout">
      <button
        ref="btn"
        type="button"
        class="krds-btn medium icon tooltip-btn"
        :aria-expanded="isOpen"
        :aria-controls="`${base}-pop`"
        @click="toggle"
      >
        <span class="sr-only">{{ triggerLabel }}</span>
        <i class="svg-icon ico-tooltip" aria-hidden="true" />
      </button>
      <div ref="pop" :id="`${base}-pop`" role="dialog" :aria-labelledby="`${base}-title`" class="tooltip-popover" :data-open="isOpen">
        <h4 :id="`${base}-title`" class="tooltip-title">{{ title }}</h4>
        <div class="tooltip-contents">
          <div><slot /></div>
          <div v-if="$slots.action" class="btn-wrap"><slot name="action" /></div>
        </div>
        <button type="button" class="krds-btn xsmall icon tooltip-close" @click="set(false, true)">
          <span class="sr-only">닫기</span>
          <i class="svg-icon ico-modal-close" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
