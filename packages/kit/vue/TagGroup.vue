<!-- 태그 묶음 — KRDS krds-tag-wrap. 크기(small·medium·large)는 여기서 정한다.
  <TagGroup size="medium" aria-label="선택한 조건"><Tag removable @remove="…">복지</Tag></TagGroup> -->
<script setup lang="ts">
import { useAttrs } from "vue";

withDefaults(defineProps<{ size?: "small" | "medium" | "large" }>(), { size: "medium" });
const attrs = useAttrs();
</script>

<template>
  <div :role="attrs['aria-label'] ? 'group' : undefined" :class="['krds-tag-wrap', size]"><slot /><span class="sr-only hb-tag-live" aria-live="polite" /></div>
</template>
