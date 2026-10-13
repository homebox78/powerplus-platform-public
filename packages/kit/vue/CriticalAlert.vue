<!-- 긴급 공지 한 줄 — type: danger(긴급) · ok(안전) · info(안내). href 가 없으면 링크를 두지 않는다. -->
<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ type?: "danger" | "ok" | "info"; badge?: string; href?: string; linkText?: string }>(),
  { type: "danger", linkText: "자세히 보기" },
);
const word = computed(() => props.badge ?? { danger: "긴급", ok: "안전", info: "안내" }[props.type]);
</script>

<template>
  <li>
    <div class="critical-ban">
      <span :class="['critical-badge', type]">{{ word }}</span>
      <p class="critical-txt"><slot /></p>
      <a v-if="href" :href="href" class="krds-btn medium link basic">
        <span class="m-hide">{{ linkText }}</span>
        <span class="sr-only"> ({{ word }} 공지)</span>
        <i class="svg-icon ico-angle right" aria-hidden="true" />
      </a>
    </div>
  </li>
</template>
