<script setup lang="ts">
import { computed, inject, type Ref } from "vue";

withDefaults(defineProps<{ counter?: boolean; moreHref?: string }>(), { counter: true });
const c = inject<{
  index: Ref<number>;
  count: Ref<number>;
  playing: Ref<boolean>;
  loop: boolean;
  autoplay: number;
  go: (i: number) => void;
  setPlaying: (v: boolean) => void;
}>("hb-carousel")!;
const atStart = computed(() => !c.loop && c.index.value <= 0);
const atEnd = computed(() => !c.loop && c.index.value >= c.count.value - 1);
</script>

<template>
  <div class="swiper-indicator hb-carousel-controls">
    <div v-if="counter" class="swiper-pagination swiper-pagination-fraction">
      <span class="sr-only">전체 {{ c.count.value }}개 중 </span>
      <span class="swiper-pagination-current">{{ c.index.value + 1 }}</span>
      <span aria-hidden="true"> / </span>
      <span class="swiper-pagination-total" aria-hidden="true">{{ c.count.value }}</span>
      <span class="sr-only">번째</span>
    </div>
    <div v-if="c.autoplay > 0" class="swiper-controller">
      <button type="button" :class="c.playing.value ? 'swiper-button-stop' : 'swiper-button-play'" @click="c.setPlaying(!c.playing.value)">
        <span class="sr-only">{{ c.playing.value ? "슬라이드 멈춤" : "슬라이드 재생" }}</span>
      </button>
    </div>
    <div class="swiper-navigation">
      <button type="button" :class="['swiper-button-prev', { 'swiper-button-disabled': atStart }]" :disabled="atStart" @click="c.go(c.index.value - 1)">
        <span class="sr-only">이전 슬라이드</span>
      </button>
      <button type="button" :class="['swiper-button-next', { 'swiper-button-disabled': atEnd }]" :disabled="atEnd" @click="c.go(c.index.value + 1)">
        <span class="sr-only">다음 슬라이드</span>
      </button>
      <a v-if="moreHref" :href="moreHref" class="swiper-button-more">
        <span class="sr-only">더 보기</span>
      </a>
    </div>
  </div>
</template>
