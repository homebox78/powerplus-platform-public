<script setup lang="ts">
import { computed, inject } from "vue";

const c = inject<{ base: string; level: number; isOpen: (v: string) => boolean; toggle: (v: string) => void }>("hb-acc")!;
const v = inject<string>("hb-acc-item")!;
const on = computed(() => c.isOpen(v));
</script>

<template>
  <component :is="`h${c.level}`" class="accordion-header">
    <button
      type="button"
      :id="`${c.base}-h-${v}`"
      :aria-controls="`${c.base}-c-${v}`"
      :aria-expanded="on"
      :class="['btn-accordion', { active: on }]"
      @click="c.toggle(v)"
    >
      <slot />
    </button>
  </component>
</template>
