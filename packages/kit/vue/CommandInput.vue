<!-- 명령 팔레트 · 검색 입력칸 (role=combobox, aria-activedescendant) -->
<script setup lang="ts">
import { inject, type Ref } from "vue";

const props = defineProps<{ modelValue?: string; placeholder?: string; ariaLabel?: string }>();
const emit = defineEmits<{ "update:modelValue": [string] }>();
const c = inject<{ search: Ref<string>; active: Ref<string | null>; listId: string }>("hb-cmd")!;
if (props.modelValue !== undefined) c.search.value = props.modelValue;

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  c.search.value = v;
  emit("update:modelValue", v);
}

function onKeydown(e: KeyboardEvent) {
  const list = document.getElementById(c.listId);
  const opts = Array.from(list?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? []);
  if (!opts.length) return;
  const i = opts.findIndex((o) => o.id === c.active.value);
  let next = -1;
  if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % opts.length;
  else if (e.key === "ArrowUp") next = i < 0 ? opts.length - 1 : (i - 1 + opts.length) % opts.length;
  else if (e.key === "Home" && e.ctrlKey) next = 0;
  else if (e.key === "End" && e.ctrlKey) next = opts.length - 1;
  else if (e.key === "Enter" && i >= 0) {
    e.preventDefault();
    opts[i].click();
    return;
  }
  if (next < 0) return;
  e.preventDefault();
  c.active.value = opts[next].id;
  opts[next].scrollIntoView({ block: "nearest" });
}
</script>

<template>
  <div class="hb-command-input-wrap">
    <i class="svg-icon ico-sch" aria-hidden="true" />
    <input
      type="text"
      role="combobox"
      aria-expanded="true"
      :aria-controls="c.listId"
      aria-autocomplete="list"
      :aria-activedescendant="c.active.value ?? undefined"
      :aria-label="ariaLabel ?? placeholder ?? '검색어'"
      autocomplete="off"
      :placeholder="placeholder"
      class="hb-command-input"
      :value="c.search.value"
      @input="onInput"
      @keydown="onKeydown"
    />
  </div>
</template>
