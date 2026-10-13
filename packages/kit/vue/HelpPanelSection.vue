<!-- 도움 패널 · 내용 덩어리. help = 도움 본문 · related = 관련 서비스(윗줄 구분, HelpPanelGroup 여러 개) -->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: "help" | "related" }>(), { variant: "help" });
</script>

<template>
  <div :class="['conts-area', variant === 'help' ? 'help-conts' : 'related-service']">
    <div v-if="variant === 'help'" class="conts-wrap"><slot /></div>
    <slot v-else />
  </div>
</template>
