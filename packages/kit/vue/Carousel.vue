<!-- 캐러셀 — KRDS 「캐러셀」(비주얼 배너·배너형) · shadcn-vue Carousel 과 비슷한 사용법 (직접 구현, swiper 없음)
  <Carousel aria-label="주요 소식" :autoplay="5000">
    <CarouselContent>
      <CarouselItem>…</CarouselItem>
    </CarouselContent>
    <CarouselControls more-href="/news" />
  </Carousel>
  조작부(KRDS .swiper-indicator): 현재/전체 · 정지/재생 · 이전 · 다음 · 더 보기.
  자동 넘김은 마우스를 올리거나 안에 포커스가 있으면 멈추고, 「움직임 줄이기」면 멈춘 채 시작한다. -->
<script setup lang="ts">
import { onBeforeUnmount, provide, ref, watchEffect } from "vue";

const props = withDefaults(defineProps<{ autoplay?: number; loop?: boolean; defaultIndex?: number; ariaLabel?: string }>(), {
  autoplay: 0,
  loop: true,
  defaultIndex: 0,
  ariaLabel: "슬라이드",
});
const emit = defineEmits<{ "update:index": [number] }>();

const reduced = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const index = ref(props.defaultIndex);
const count = ref(0);
const playing = ref(props.autoplay > 0 && !reduced);
const hover = ref(false);
const focusIn = ref(false);

function go(i: number) {
  if (count.value < 1) return;
  const next = props.loop ? (i + count.value) % count.value : Math.min(count.value - 1, Math.max(0, i));
  if (next !== index.value) {
    index.value = next;
    emit("update:index", next);
  }
}

let timer = 0;
watchEffect((onCleanup) => {
  if (!props.autoplay || !playing.value || hover.value || focusIn.value || count.value < 2) return;
  timer = window.setInterval(() => {
    if (!props.loop && index.value >= count.value - 1) return;
    index.value = (index.value + 1) % count.value;
  }, props.autoplay);
  onCleanup(() => window.clearInterval(timer));
});
onBeforeUnmount(() => window.clearInterval(timer));

provide("hb-carousel", {
  index,
  count,
  playing,
  loop: props.loop,
  autoplay: props.autoplay,
  go,
  setCount: (n: number) => (count.value = n),
  setPlaying: (v: boolean) => (playing.value = v),
});

function onFocusout(e: FocusEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) focusIn.value = false;
}
</script>

<template>
  <section
    aria-roledescription="캐러셀"
    :aria-label="ariaLabel"
    class="hb-carousel"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
    @focusin="focusIn = true"
    @focusout="onFocusout"
  >
    <slot />
  </section>
</template>
