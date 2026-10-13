<script setup lang="ts">
import { inject, ref } from "vue";

withDefaults(defineProps<{ variant?: "line" | "fill"; full?: boolean; ariaLabel?: string }>(), {
  variant: "line",
  full: false,
});
const t = inject<{ setValue: (v: string) => void }>("hb-tabs")!;
const list = ref<HTMLUListElement>();

function onKeydown(e: KeyboardEvent) {
  const tabs = Array.from(list.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []);
  const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  const next =
    e.key === "ArrowRight" ? (i + 1) % tabs.length
    : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
    : e.key === "Home" ? 0
    : e.key === "End" ? tabs.length - 1
    : -1;
  if (next < 0) return;
  e.preventDefault();
  tabs[next].focus();
  t.setValue(tabs[next].dataset.value ?? "");
}
</script>

<template>
  <div :class="['tab', variant, { full }]">
    <ul ref="list" role="tablist" :aria-label="ariaLabel" @keydown="onKeydown">
      <slot />
    </ul>
  </div>
</template>
