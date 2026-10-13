<!-- 선택 상자 — KRDS 「셀렉트(select·select_size·select_state·select_sorting)」 모양,
  동작은 WAI-ARIA 「선택 전용 콤보박스」 패턴으로 직접 구현(네이티브 <select> 쓰지 않음). React 판과 같은 마크업.
  <Select v-model="sido" :options="[{ value: 'hanbit', label: '한빛시' }]" placeholder="시·군·구 선택" />
  <Select variant="sort" size="medium" :options="정렬" model-value="new" aria-label="정렬 기준" />
  키보드: 닫힘 — ↓ ↑ Enter Space 로 열기, Home/End, 글자 입력으로 찾기
          열림 — ↑ ↓ 이동, Home/End, PageUp/Down, Enter·Space 선택, Esc 닫기, Tab 은 선택하고 다음 칸으로
  화면 아래쪽 자리가 모자라면 위로 연다. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useUid } from "./utils";
import { useFieldControl } from "./field-context";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    options: SelectOption[];
    placeholder?: string;
    variant?: "default" | "sort";
    size?: "small" | "medium" | "large";
    invalid?: boolean;
    disabled?: boolean;
    required?: boolean;
    id?: string;
    name?: string;
    ariaLabel?: string;
    ariaLabelledby?: string;
    ariaDescribedby?: string;
  }>(),
  { placeholder: "선택하세요", variant: "default", invalid: undefined, disabled: undefined, required: undefined },
);
const model = defineModel<string>();
const f = useFieldControl(() => ({
  id: props.id, invalid: props.invalid, disabled: props.disabled, required: props.required, describedBy: props.ariaDescribedby,
}));

const open = ref(false);
const active = ref(-1);
const up = ref(false);
const base = useUid("hb-sel");
const btn = ref<HTMLButtonElement | null>(null);
const list = ref<HTMLUListElement | null>(null);
let typed = { text: "", at: 0 };
const PAGE = 10;

const selIndex = computed(() => props.options.findIndex((o) => o.value === model.value));
const selected = computed(() => (selIndex.value >= 0 ? props.options[selIndex.value] : undefined));
const sz = computed(() => props.size ?? (props.variant === "sort" ? "medium" : "large"));
const listId = `${base}-list`;

function choose(i: number) {
  const o = props.options[i];
  if (!o || o.disabled) return;
  model.value = o.value;
}
function step(from: number, dir: 1 | -1, n = 1) {
  let i = from;
  let moved = 0;
  let last = from;
  while (moved < n) {
    i += dir;
    if (i < 0 || i >= props.options.length) break;
    if (!props.options[i].disabled) {
      last = i;
      moved++;
    }
  }
  return last;
}
const first = () => props.options.findIndex((o) => !o.disabled);
function lastIdx() {
  for (let i = props.options.length - 1; i >= 0; i--) if (!props.options[i].disabled) return i;
  return -1;
}
function openAt(i: number) {
  active.value = i;
  open.value = true;
}
function close(focus = true) {
  open.value = false;
  if (focus) btn.value?.focus();
}
function findTyped(ch: string, from: number) {
  const now = Date.now();
  typed = { text: now - typed.at > 600 ? ch : typed.text + ch, at: now };
  const q = typed.text.toLowerCase();
  const n = props.options.length;
  const order = Array.from({ length: n }, (_, k) => (from + 1 + k + n) % n);
  const same = q.split("").every((c) => c === q[0]);
  const hit = order.find((i) => !props.options[i].disabled && props.options[i].label.toLowerCase().startsWith(same ? q[0] : q));
  return hit ?? -1;
}

// 열릴 때 방향 정하기
watch(open, async (o) => {
  if (!o) return;
  await nextTick();
  if (!btn.value || !list.value) return;
  const r = btn.value.getBoundingClientRect();
  const h = list.value.offsetHeight;
  const below = window.innerHeight - r.bottom;
  up.value = below < h + 8 && r.top > below;
});
// 가리키는 항목 보이게
watch([open, active], async () => {
  if (!open.value || active.value < 0) return;
  await nextTick();
  list.value?.querySelector<HTMLElement>(`#${base}-o-${active.value}`)?.scrollIntoView({ block: "nearest" });
});

function onKeyDown(e: KeyboardEvent) {
  const k = e.key;
  const printable = k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (!open.value) {
    if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
      e.preventDefault();
      openAt(selIndex.value >= 0 ? selIndex.value : k === "ArrowUp" ? lastIdx() : first());
    } else if (k === "Home") {
      e.preventDefault();
      openAt(first());
    } else if (k === "End") {
      e.preventDefault();
      openAt(lastIdx());
    } else if (printable) {
      const i = findTyped(k, selIndex.value);
      if (i >= 0) {
        e.preventDefault();
        openAt(i);
      }
    }
    return;
  }
  if (k === "ArrowDown") {
    e.preventDefault();
    if (!e.altKey) active.value = step(active.value, 1);
  } else if (k === "ArrowUp") {
    e.preventDefault();
    if (e.altKey) {
      choose(active.value);
      close();
    } else active.value = step(active.value, -1);
  } else if (k === "Home") {
    e.preventDefault();
    active.value = first();
  } else if (k === "End") {
    e.preventDefault();
    active.value = lastIdx();
  } else if (k === "PageDown") {
    e.preventDefault();
    active.value = step(active.value, 1, PAGE);
  } else if (k === "PageUp") {
    e.preventDefault();
    active.value = step(active.value, -1, PAGE);
  } else if (k === "Enter" || k === " ") {
    e.preventDefault();
    choose(active.value);
    close();
  } else if (k === "Escape") {
    e.preventDefault();
    close();
  } else if (k === "Tab") {
    choose(active.value);
    close(false);
  } else if (printable) {
    const i = findTyped(k, active.value);
    if (i >= 0) active.value = i;
  }
}
function onBlur(e: FocusEvent) {
  const wrap = (e.currentTarget as HTMLElement).parentElement;
  if (!wrap?.contains(e.relatedTarget as Node)) open.value = false;
}
function onClickOption(i: number) {
  if (props.options[i].disabled) return;
  choose(i);
  close();
}
</script>

<template>
  <div :class="['hb-select', variant === 'sort' && 'is-sort']">
    <button
      ref="btn"
      type="button"
      role="combobox"
      :id="f.id"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open && active >= 0 ? `${base}-o-${active}` : undefined"
      :aria-label="ariaLabel"
      :aria-labelledby="ariaLabelledby"
      :aria-describedby="f['aria-describedby']"
      :aria-invalid="f['aria-invalid']"
      :aria-required="f.required"
      :disabled="f.disabled"
      :class="[variant === 'sort' ? 'krds-form-select-sort' : 'krds-form-select', sz, selected && 'has-value', f['aria-invalid'] && 'is-error']"
      @click="open ? close() : openAt(selIndex >= 0 ? selIndex : first())"
      @keydown="onKeyDown"
      @blur="onBlur"
    >
      <span class="hb-select-value">{{ selected ? selected.label : placeholder }}</span>
    </button>
    <ul
      ref="list"
      :id="listId"
      role="listbox"
      tabindex="-1"
      :aria-label="ariaLabel"
      :aria-labelledby="ariaLabelledby ?? (ariaLabel ? undefined : f.id)"
      :hidden="!open"
      :class="['hb-select-list', up && 'is-up']"
      @mousedown.prevent
    >
      <li
        v-for="(o, i) in options"
        :key="o.value"
        :id="`${base}-o-${i}`"
        role="option"
        :aria-selected="o.value === model"
        :aria-disabled="o.disabled || undefined"
        :class="['hb-select-option', i === active && 'is-active']"
        @mouseenter="!o.disabled && (active = i)"
        @click="onClickOption(i)"
      >
        {{ o.label }}
      </li>
    </ul>
    <input v-if="name" type="hidden" :name="name" :value="model ?? ''" />
  </div>
</template>
