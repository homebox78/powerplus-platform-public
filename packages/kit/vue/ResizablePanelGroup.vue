<!-- 크기 조절 칸 — shadcn-vue Resizable 과 같은 사용법 (직접 구현)
  <ResizablePanelGroup direction="horizontal" style="height: 320px">
    <ResizablePanel :default-size="30" :min-size="20">목록</ResizablePanel>
    <ResizableHandle with-handle />
    <ResizablePanel :default-size="70">본문</ResizablePanel>
  </ResizablePanelGroup>
  크기는 %. 손잡이는 끌거나 Tab 으로 들어가 방향키(5%, Shift 10%)·Home/End. 손잡이 = separator(aria-valuenow 는 앞 칸 %). -->
<script setup lang="ts">
import { onMounted, provide, reactive, ref } from "vue";
import { useUid } from "./utils";

const props = withDefaults(defineProps<{ direction?: "horizontal" | "vertical" }>(), { direction: "horizontal" });
const emit = defineEmits<{ layout: [number[]] }>();

interface PanelInfo { min: number; max: number; id: string; defaultSize?: number }
const base = useUid("hb-panel");
const panels = reactive<PanelInfo[]>([]);
const sizes = reactive<number[]>([]);
const el = ref<HTMLDivElement>();

provide("hb-resizable", {
  direction: props.direction,
  sizes,
  panels,
  el,
  register(i: number, info: { min: number; max: number; defaultSize?: number }) {
    panels[i] = { ...info, id: `${base}-${i}` };
  },
  resize(h: number, want: number) {
    const pa = panels[h];
    const pb = panels[h + 1];
    if (!pa || !pb) return;
    const total = sizes[h] + sizes[h + 1];
    const lo = Math.max(pa.min, total - pb.max);
    const hi = Math.min(pa.max, total - pb.min);
    const a = Math.min(hi, Math.max(lo, want));
    if (a === sizes[h]) return;
    sizes[h] = a;
    sizes[h + 1] = total - a;
    emit("layout", [...sizes]);
  },
});

// 자식(칸)이 먼저 등록한 뒤 여기서 크기를 정한다 — 빈 칸은 남은 크기를 나눠 갖는다
onMounted(() => {
  const known = panels.reduce((s, p) => s + (p?.defaultSize ?? 0), 0);
  const free = panels.filter((p) => p && p.defaultSize === undefined).length;
  panels.forEach((p, i) => {
    sizes[i] = p?.defaultSize ?? (free ? (100 - known) / free : 0);
  });
});
</script>

<template>
  <div ref="el" :data-direction="direction" class="hb-resizable-group"><slot /></div>
</template>
