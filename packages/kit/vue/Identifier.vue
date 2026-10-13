<!-- 운영기관 식별자 — KRDS 「운영기관 식별자(identifier)」
  <Identifier org-name="한빛시" />                         ← "이 누리집은 한빛시 누리집입니다."
  <Identifier org-name="한빛시" logo-src="/img/logo.svg" />
  <Identifier org-name="한빛시 문화재단" :logos="[{ src: '/img/hanbit.svg', alt: '한빛시' }, { src: '/img/f.svg', alt: '한빛시 문화재단' }]" />
  로고는 이미지로만 받는다(정부 상징·기관 로고를 코드로 그리지 않는다). 없으면 문구만 보인다.
  logos 는 여러 기관이 함께 운영할 때 — 배열 순서가 곧 위계(상위 기관 → 운영 기관)다. -->
<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ orgName?: string; text?: string; logoSrc?: string; logoAlt?: string; logos?: { src: string; alt: string }[] }>();
const list = computed(() =>
  props.logos?.length ? props.logos : props.logoSrc ? [{ src: props.logoSrc, alt: props.logoAlt ?? props.orgName ?? "" }] : [],
);
</script>

<template>
  <div class="krds-identifier">
    <span v-if="list.length > 1" class="hb-identifier-logos">
      <span v-for="(l, i) in list" :key="`${l.src}-${i}`" class="logo hb-gov-logo"><img :src="l.src" :alt="l.alt" /></span>
    </span>
    <span v-else-if="list.length === 1" class="logo hb-gov-logo"><img :src="list[0].src" :alt="list[0].alt" /></span>
    <span class="ban-txt"><slot>{{ text ?? `이 누리집은 ${orgName ?? ""} 누리집입니다.` }}</slot></span>
  </div>
</template>
