<script setup lang="ts">
import { computed, inject, onMounted, ref, type Ref } from "vue";

withDefaults(defineProps<{ withHandle?: boolean; ariaLabel?: string }>(), { ariaLabel: "칸 크기 조절" });
const g = inject<{
  direction: "horizontal" | "vertical";
  sizes: number[];
  panels: Array<{ id: string; min: number; max: number } | undefined>;
  el: Ref<HTMLDivElement | undefined>;
  resize: (h: number, want: number) => void;
}>("hb-resizable")!;
const self = ref<HTMLDivElement>();
const index = ref(-1);
const dragging = ref(false);
const horizontal = g.direction === "horizontal";
let start = { pos: 0, a: 0, len: 1 };

onMounted(() => {
  // 앞에 있는 칸 수 - 1 = 이 손잡이가 나누는 앞 칸
  let n = 0;
  let node = self.value?.previousElementSibling;
  while (node) {
    if (node.classList.contains("hb-resizable-panel")) n++;
    node = node.previousElementSibling;
  }
  index.value = n - 1;
});
const a = computed(() => g.sizes[index.value] ?? 50);
const pa = computed(() => g.panels[index.value]);

function onPointerDown(e: PointerEvent) {
  const rect = g.el.value?.getBoundingClientRect();
  if (!rect) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  (e.currentTarget as HTMLElement).focus();
  start = { pos: horizontal ? e.clientX : e.clientY, a: a.value, len: horizontal ? rect.width : rect.height };
  dragging.value = true;
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  const d = (((horizontal ? e.clientX : e.clientY) - start.pos) / start.len) * 100;
  g.resize(index.value, start.a + d);
}
function onKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 10 : 5;
  const back = horizontal ? "ArrowLeft" : "ArrowUp";
  const fwd = horizontal ? "ArrowRight" : "ArrowDown";
  let next: number | null = null;
  if (e.key === back) next = a.value - step;
  else if (e.key === fwd) next = a.value + step;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = 100;
  if (next === null) return;
  e.preventDefault();
  g.resize(index.value, next);
}
</script>

<template>
  <div
    ref="self"
    role="separator"
    tabindex="0"
    :aria-label="ariaLabel"
    :aria-orientation="horizontal ? 'vertical' : 'horizontal'"
    :aria-controls="pa?.id"
    :aria-valuenow="Math.round(a)"
    :aria-valuemin="pa?.min ?? 0"
    :aria-valuemax="pa?.max ?? 100"
    :data-dragging="dragging"
    class="hb-resizable-handle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="dragging = false"
    @pointercancel="dragging = false"
    @keydown="onKeydown"
  >
    <span v-if="withHandle" class="hb-resizable-grip" aria-hidden="true" />
  </div>
</template>
