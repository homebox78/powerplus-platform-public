<!-- 도움 패널 · 링크 하나. icon: go(바깥) · angle(안쪽) · call · faq(앞 아이콘). new-window 면 새 창 + "새 창 열림" -->
<script setup lang="ts">
withDefaults(defineProps<{ href?: string; icon?: "go" | "angle" | "call" | "faq"; newWindow?: boolean }>(), { icon: "angle" });
</script>

<template>
  <li>
    <a
      :href="href"
      class="krds-btn xsmall link basic"
      :target="newWindow ? '_blank' : undefined"
      :rel="newWindow ? 'noopener' : undefined"
      :title="newWindow ? '새 창 열림' : undefined"
    >
      <i v-if="icon === 'call' || icon === 'faq'" :class="['svg-icon', `ico-${icon}`]" aria-hidden="true" />
      <slot />
      <i v-if="icon === 'go'" class="svg-icon ico-go" aria-hidden="true" />
      <i v-if="icon === 'angle'" class="svg-icon ico-angle right" aria-hidden="true" />
    </a>
  </li>
</template>
