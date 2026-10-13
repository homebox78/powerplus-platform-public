<!-- 검색되는 선택 상자(콤보 상자) — 네이티브 select 대신 입력칸 + 목록 상자
  <div class="form-group">
    <div class="form-tit"><label for="office">담당 부서</label></div>
    <Combobox id="office" v-model="office" :options="[{ value: 'civil', label: '민원여권과' }]" placeholder="부서명을 입력하세요" />
  </div>
  키보드: 입력하면 걸러져 열림, ↓/↑ 이동(aria-activedescendant), Enter 고르기, Esc 닫기(닫혀 있으면 지우기), Alt+↓ 열기. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useUid } from "./utils";

interface Option {
  value: string;
  label: string;
  keywords?: string[];
  disabled?: boolean;
}
const props = withDefaults(
  defineProps<{
    options: Option[];
    modelValue?: string;
    defaultValue?: string;
    size?: "small" | "medium" | "large";
    placeholder?: string;
    id?: string;
    disabled?: boolean;
    emptyText?: string;
    defaultOpen?: boolean;
    listLabel?: string;
  }>(),
  { defaultValue: "", size: "medium", emptyText: "일치하는 항목이 없습니다.", defaultOpen: false, listLabel: "선택 목록" },
);
const emit = defineEmits<{ "update:modelValue": [string] }>();
defineOptions({ inheritAttrs: false }); // aria-describedby 등은 입력칸으로 보낸다

const inner = ref(props.defaultValue);
const selected = computed(() => props.modelValue ?? inner.value);
const labelOf = (v: string) => props.options.find((o) => o.value === v)?.label ?? "";
const text = ref(labelOf(selected.value));
const typed = ref(false);
const open = ref(props.defaultOpen);
const active = ref(-1);
const base = useUid("hb-cb");
const inputId = computed(() => props.id ?? `${base}-input`);
const listId = `${base}-list`;

watch(selected, (v) => (text.value = labelOf(v)));

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const shown = computed(() =>
  typed.value && text.value
    ? props.options.filter((o) => norm([o.label, ...(o.keywords ?? [])].join(" ")).includes(norm(text.value)))
    : props.options,
);
const enabled = computed(() => shown.value.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0));

function choose(o: Option) {
  if (o.disabled) return;
  inner.value = o.value;
  emit("update:modelValue", o.value);
  text.value = o.label;
  typed.value = false;
  open.value = false;
}
function openList() {
  open.value = true;
  const cur = shown.value.findIndex((o) => o.value === selected.value);
  active.value = cur >= 0 ? cur : (enabled.value[0] ?? -1);
}
function toggle() {
  if (open.value) open.value = false;
  else openList();
}
function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value;
  typed.value = true;
  open.value = true;
  active.value = 0;
}
function onKeydown(e: KeyboardEvent) {
  const en = enabled.value;
  const pos = en.indexOf(active.value);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value || e.altKey) return openList();
    active.value = en[(pos + 1) % en.length] ?? -1;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) return openList();
    active.value = en[(pos - 1 + en.length) % en.length] ?? -1;
  } else if (e.key === "Enter") {
    const o = shown.value[active.value];
    if (open.value && o) {
      e.preventDefault();
      choose(o);
    }
  } else if (e.key === "Escape") {
    if (open.value) {
      e.preventDefault();
      open.value = false;
    } else if (text.value) {
      text.value = "";
      typed.value = true;
    }
  } else if ((e.key === "Home" || e.key === "End") && open.value && e.ctrlKey) {
    e.preventDefault();
    active.value = e.key === "Home" ? (en[0] ?? -1) : (en[en.length - 1] ?? -1);
  }
}
watch([open, active], () =>
  nextTick(() => {
    if (open.value && active.value >= 0) document.getElementById(`${base}-o-${active.value}`)?.scrollIntoView({ block: "nearest" });
  }),
);
function onFocusout(e: FocusEvent) {
  if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
  open.value = false;
  typed.value = false;
  text.value = labelOf(selected.value);
}
</script>

<template>
  <div class="form-conts btn-ico-wrap hb-combobox" @focusout="onFocusout">
    <input
      v-bind="$attrs"
      :id="inputId"
      type="text"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="listId"
      aria-autocomplete="list"
      :aria-activedescendant="open && active >= 0 ? `${base}-o-${active}` : undefined"
      autocomplete="off"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="['krds-input', size]"
      :value="text"
      @input="onInput"
      @click="toggle"
      @keydown="onKeydown"
    />
    <button
      type="button"
      tabindex="-1"
      class="krds-btn medium icon hb-combobox-toggle"
      aria-label="목록 열기"
      :aria-expanded="open"
      :aria-controls="listId"
      :disabled="disabled"
      @click="toggle"
    >
      <i class="svg-icon ico-angle" aria-hidden="true" />
    </button>
    <div :id="listId" role="listbox" :aria-label="listLabel" class="hb-listbox" :hidden="!open">
      <p v-if="shown.length === 0" class="hb-listbox-status">{{ emptyText }}</p>
      <div
        v-for="(o, i) in shown"
        :key="o.value"
        :id="`${base}-o-${i}`"
        role="option"
        :aria-selected="i === active"
        :aria-disabled="o.disabled || undefined"
        class="hb-menu-item has-indicator"
        @mousedown.prevent
        @mousemove="!o.disabled && i !== active && (active = i)"
        @click="choose(o)"
      >
        <span v-if="o.value === selected" class="hb-menu-indicator hb-menu-check" aria-hidden="true" />
        {{ o.label }}
        <span v-if="o.value === selected" class="sr-only"> 선택됨</span>
        <span v-if="o.disabled" class="hb-menu-shortcut">선택 불가</span>
      </div>
    </div>
  </div>
</template>
