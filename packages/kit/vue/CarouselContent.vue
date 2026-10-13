<script setup lang="ts">
import { inject, onMounted, onUpdated, ref, type Ref } from "vue";

defineOptions({ inheritAttrs: false });
const c = inject<{ index: Ref<number>; playing: Ref<boolean>; setCount: (n: number) => void }>("hb-carousel")!;
const track = ref<HTMLDivElement>();
const recount = () => c.setCount(track.value?.querySelectorAll(":scope > .hb-carousel-item").length ?? 0);
onMounted(recount);
onUpdated(recount);
</script>

<template>
  <div class="hb-carousel-viewport" :aria-live="c.playing.value ? 'off' : 'polite'">
    <div ref="track" class="hb-carousel-track" :style="{ transform: `translateX(-${c.index.value * 100}%)` }" v-bind="$attrs">
      <slot />
    </div>
  </div>
</template>
