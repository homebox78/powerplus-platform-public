<script setup lang="ts">
import { computed, inject, type ComputedRef } from "vue";

const props = defineProps<{ value: string }>();
const t = inject<{ value: ComputedRef<string>; base: string }>("hb-tabs")!;
const on = computed(() => t.value.value === props.value);
</script>

<template>
  <section
    role="tabpanel"
    :id="`${t.base}-p-${value}`"
    :aria-labelledby="`${t.base}-t-${value}`"
    tabindex="0"
    :hidden="!on"
    :class="['tab-conts', { active: on }]"
  >
    <slot />
  </section>
</template>
