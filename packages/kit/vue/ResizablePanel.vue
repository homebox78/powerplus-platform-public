<script setup lang="ts">
import { computed, inject, onMounted, ref, type Ref } from "vue";

const props = withDefaults(defineProps<{ defaultSize?: number; minSize?: number; maxSize?: number }>(), { minSize: 10, maxSize: 90 });
const g = inject<{
  sizes: number[];
  panels: Array<{ id: string } | undefined>;
  register: (i: number, info: { min: number; max: number; defaultSize?: number }) => void;
}>("hb-resizable")!;
const el = ref<HTMLDivElement>();
const index = ref(-1) as Ref<number>;

onMounted(() => {
  const parent = el.value?.parentElement;
  index.value = parent ? Array.from(parent.children).filter((c) => c.classList.contains("hb-resizable-panel")).indexOf(el.value!) : -1;
  g.register(index.value, { min: props.minSize, max: props.maxSize, defaultSize: props.defaultSize });
});
const size = computed(() => (index.value >= 0 ? g.sizes[index.value] : undefined) ?? props.defaultSize ?? 50);
</script>

<template>
  <div ref="el" :id="g.panels[index]?.id" :data-size="Math.round(size)" class="hb-resizable-panel" :style="{ flex: `${size} 1 0px` }">
    <slot />
  </div>
</template>
