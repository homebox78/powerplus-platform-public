<script setup lang="ts">
import { computed, inject, onMounted, ref, type Ref } from "vue";

const c = inject<{ index: Ref<number>; count: Ref<number> }>("hb-carousel")!;
const el = ref<HTMLDivElement>();
const i = ref(0);
onMounted(() => {
  const parent = el.value?.parentElement;
  i.value = parent ? Array.from(parent.children).indexOf(el.value!) : 0;
});
const on = computed(() => i.value === c.index.value);
</script>

<template>
  <div
    ref="el"
    role="group"
    aria-roledescription="슬라이드"
    :aria-label="`${i + 1} / ${c.count.value}`"
    :aria-hidden="!on"
    :inert="!on || undefined"
    class="hb-carousel-item"
  >
    <slot />
  </div>
</template>
