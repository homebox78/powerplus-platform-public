<!-- 토스트 표시 영역 — sonner 와 같은 사용법(toast 함수는 vue/toast.ts). 앱에 한 번 둔다.
  <Toaster position="bottom-right" />
  접근성: aria-live="polite"(오류는 role="alert"), 마우스를 올리거나 포커스가 들어가면 시간이 멈춘다(WCAG 2.2.1),
  Alt+T 로 알림 영역으로 이동, 알림마다 닫기 버튼·Esc. 상태는 아이콘과 숨은 글자로 함께 알린다. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { toast, toasts, type ToastType } from "./toast";

const props = withDefaults(
  defineProps<{
    position?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
    duration?: number;
    visibleToasts?: number;
    closeButton?: boolean;
    label?: string;
  }>(),
  { position: "bottom-right", duration: 4000, visibleToasts: 3, closeButton: true, label: "알림" },
);

const TYPE_LABEL: Record<ToastType, string> = { default: "알림", success: "성공", error: "오류", info: "안내", warning: "주의", loading: "처리 중" };
const TYPE_ICON: Partial<Record<ToastType, string>> = {
  success: "ico-success-fill",
  error: "ico-error-fill",
  info: "ico-information-fill",
  warning: "ico-urgent-danger",
};

const region = ref<HTMLElement | null>(null);
const hover = ref(false);
const focusIn = ref(false);
const paused = computed(() => hover.value || focusIn.value);
const y = computed(() => props.position.split("-")[0]);
const x = computed(() => props.position.split("-")[1]);
const shown = computed(() => {
  const s = toasts.value.slice(-props.visibleToasts);
  return y.value === "top" ? [...s].reverse() : s;
});

// 알림마다 남은 시간 — 멈췄다 다시 흐를 때 이어서 센다
const timers = new Map<string | number, { left: number; started: number; handle?: number; type: ToastType }>();
function sync() {
  for (const [id, t] of timers) {
    window.clearTimeout(t.handle);
    if (t.handle !== undefined && Number.isFinite(t.left)) t.left = Math.max(0, t.left - (Date.now() - t.started));
    t.handle = undefined;
    if (!toasts.value.some((x) => x.id === id)) timers.delete(id);
  }
  for (const t of toasts.value) {
    const cur = timers.get(t.id);
    if (cur && cur.type === t.type) continue;
    timers.set(t.id, { left: t.duration ?? props.duration, started: Date.now(), type: t.type });
  }
  if (paused.value) return;
  for (const [id, t] of timers) {
    if (!Number.isFinite(t.left)) continue;
    t.started = Date.now();
    t.handle = window.setTimeout(() => toast.dismiss(id), t.left);
  }
}
watch([toasts, paused], sync);
// 포커스가 있던 알림이 사라지면 blur 가 오지 않을 수 있다 → 목록이 바뀔 때마다 다시 확인
watch(toasts, () => nextTick(() => (focusIn.value = !!region.value?.contains(document.activeElement))));

const onKey = (e: KeyboardEvent) => {
  if (e.altKey && e.code === "KeyT") {
    e.preventDefault();
    region.value?.querySelector<HTMLElement>(".hb-toast")?.focus();
  }
};
onMounted(() => {
  document.addEventListener("keydown", onKey);
  sync();
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey);
  for (const t of timers.values()) window.clearTimeout(t.handle);
});

const onFocusOut = (e: FocusEvent) => {
  if (!region.value?.contains(e.relatedTarget as Node)) focusIn.value = false;
};
// 포커스가 들어 있던 알림을 닫으면 이웃 알림으로 포커스를 옮긴다
const dismissKeepFocus = (id: string | number, from: EventTarget | null) => {
  const li = (from as HTMLElement | null)?.closest(".hb-toast");
  const next = (li?.nextElementSibling ?? li?.previousElementSibling) as HTMLElement | null;
  const had = !!li?.contains(document.activeElement);
  toast.dismiss(id);
  if (had && next) requestAnimationFrame(() => next.focus());
};
const runAction = (id: string | number, fn: () => void, e: Event) => {
  fn();
  dismissKeepFocus(id, e.currentTarget);
};
</script>

<template>
  <Teleport to="body">
    <section
      ref="region"
      class="hb-kit hb-toaster"
      :data-y="y"
      :data-x="x"
      :aria-label="label + ' (Alt+T)'"
      @mouseenter="hover = true"
      @mouseleave="hover = false"
      @focusin="focusIn = true"
      @focusout="onFocusOut"
    >
      <ol class="hb-toast-list" aria-live="polite" aria-relevant="additions text">
        <li
          v-for="t in shown"
          :key="t.id"
          class="hb-toast"
          :data-type="t.type"
          :role="t.type === 'error' ? 'alert' : 'status'"
          tabindex="-1"
          @keydown.esc="dismissKeepFocus(t.id, $event.currentTarget)"
        >
          <span v-if="t.type === 'loading'" class="hb-toast-spinner" aria-hidden="true" />
          <i v-else-if="TYPE_ICON[t.type]" :class="['svg-icon hb-toast-icon', TYPE_ICON[t.type]]" aria-hidden="true" />
          <div class="hb-toast-body">
            <p class="hb-toast-title">
              <span v-if="t.type !== 'default'" class="sr-only">{{ TYPE_LABEL[t.type] }}: </span>{{ t.message }}
            </p>
            <p v-if="t.description" class="hb-toast-desc">{{ t.description }}</p>
          </div>
          <button v-if="t.action" type="button" class="krds-btn xsmall secondary hb-toast-action" @click="runAction(t.id, t.action.onClick, $event)">
            {{ t.action.label }}
          </button>
          <button v-if="closeButton" type="button" class="krds-btn xsmall icon hb-toast-close" @click="dismissKeepFocus(t.id, $event.currentTarget)">
            <span class="sr-only">알림 닫기</span>
            <i class="svg-icon ico-popup-close" aria-hidden="true" />
          </button>
        </li>
      </ol>
    </section>
  </Teleport>
</template>
