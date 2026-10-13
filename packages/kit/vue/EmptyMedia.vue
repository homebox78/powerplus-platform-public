<!-- 빈 상태 그림 — variant="icon" 이면 원형 배경 안의 아이콘. icon 은 KRDS 아이콘 이름. -->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: "default" | "icon"; icon?: string }>(), { variant: "default" });
</script>

<template>
  <div aria-hidden="true" :class="['hb-empty-media', variant === 'icon' && 'icon']">
    <i v-if="icon" :class="`svg-icon ico-${icon}`"></i>
    <slot v-else />
  </div>
</template>
