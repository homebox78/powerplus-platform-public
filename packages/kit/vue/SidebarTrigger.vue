<script setup lang="ts">
import { inject, type ComputedRef } from "vue";

withDefaults(defineProps<{ label?: string }>(), { label: "사이드 메뉴 펼침" });
const s = inject<{ isOpen: ComputedRef<boolean>; id: string; toggle: () => void }>("hb-sidebar")!;
</script>

<template>
  <button type="button" :aria-expanded="s.isOpen.value" :aria-controls="s.id" class="hb-sidebar-trigger" @click="s.toggle()">
    <i class="svg-icon ico-all" aria-hidden="true" />
    <span class="sr-only">{{ label }}</span>
  </button>
</template>
