<!-- 토글 묶음 — shadcn-vue ToggleGroup
  <ToggleGroup type="single" default-value="list" aria-label="보기 방식">
    <ToggleGroupItem value="list">목록형</ToggleGroupItem>
    <ToggleGroupItem value="card">카드형</ToggleGroupItem>
  </ToggleGroup>
  <ToggleGroup type="multiple" v-model="fields" aria-label="분야">…</ToggleGroup>
  single = radiogroup(방향키로 옮기면 선택), multiple = group(aria-pressed). 묶음 안은 ←/→(세로 ↑/↓)·Home/End. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, provide, ref } from "vue";

const props = withDefaults(
  defineProps<{
    type?: "single" | "multiple";
    modelValue?: string | string[];
    defaultValue?: string | string[];
    variant?: "default" | "outline";
    size?: "xsmall" | "small" | "medium" | "large" | "xlarge";
    orientation?: "horizontal" | "vertical";
    disabled?: boolean;
    spacing?: "attached" | "separate";
  }>(),
  { type: "single", variant: "default", size: "medium", orientation: "horizontal", spacing: "attached" },
);
const emit = defineEmits<{ "update:modelValue": [string | string[]] }>();

const toArr = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : v ? [v] : []);
const inner = ref<string[]>(toArr(props.defaultValue));
const values = computed(() => (props.modelValue !== undefined ? toArr(props.modelValue) : inner.value));
const root = ref<HTMLElement | null>(null);

function commit(next: string[]) {
  inner.value = next;
  emit("update:modelValue", props.type === "single" ? (next[0] ?? "") : next);
}
function toggle(v: string) {
  const cur = values.value;
  commit(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
}
function select(v: string) {
  commit([v]);
}
provide("hb-toggle-group", {
  type: computed(() => props.type),
  values,
  variant: computed(() => props.variant),
  size: computed(() => props.size),
  disabled: computed(() => props.disabled),
  toggle,
  select,
});

// roving tabindex — 선택된 첫 항목(없으면 첫 항목)만 Tab 으로 들어간다
function syncTab() {
  const items = Array.from(root.value?.querySelectorAll<HTMLButtonElement>("[data-hb-tgi]") ?? []);
  const enabled = items.filter((b) => !b.disabled);
  const target = enabled.find((b) => b.dataset.state === "on") ?? enabled[0];
  for (const b of items) b.tabIndex = b === target ? 0 : -1;
}
onMounted(syncTab);
onUpdated(() => nextTick(syncTab));

function onKey(e: KeyboardEvent) {
  const keys = props.orientation === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  const items = Array.from(root.value?.querySelectorAll<HTMLButtonElement>("[data-hb-tgi]:not(:disabled)") ?? []);
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  let n = -1;
  if (e.key === keys[1]) n = (i + 1) % items.length;
  else if (e.key === keys[0]) n = (i - 1 + items.length) % items.length;
  else if (e.key === "Home") n = 0;
  else if (e.key === "End") n = items.length - 1;
  if (n < 0) return;
  e.preventDefault();
  for (const b of items) b.tabIndex = -1;
  items[n].tabIndex = 0;
  items[n].focus();
  if (props.type === "single") select(items[n].dataset.value!);
}
</script>

<template>
  <div
    ref="root"
    :role="type === 'single' ? 'radiogroup' : 'group'"
    :aria-orientation="type === 'single' ? orientation : undefined"
    :data-orientation="orientation"
    :class="['hb-toggle-group', orientation, spacing]"
    @keydown="onKey"
  >
    <slot />
  </div>
</template>
