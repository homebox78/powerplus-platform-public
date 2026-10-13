<!-- 구분선 — shadcn-vue Separator (KRDS 테두리 토큰)
  <Separator />  ·  <Separator orientation="vertical" />  ·  <Separator :decorative="false" /> -->
<script setup lang="ts">
withDefaults(defineProps<{ orientation?: "horizontal" | "vertical"; decorative?: boolean }>(), {
  orientation: "horizontal",
  decorative: true,
});
</script>

<template>
  <div
    :role="decorative ? 'none' : 'separator'"
    :aria-orientation="!decorative && orientation === 'vertical' ? 'vertical' : undefined"
    :data-orientation="orientation"
    :class="['hb-separator', orientation]"
  ></div>
</template>
