<script setup lang="ts">
import { inject, provide } from "vue";

const props = defineProps<{ value: string }>();
const c = inject<{ isOpen: (v: string) => boolean }>("hb-acc")!;
provide("hb-acc-item", props.value);
</script>

<template>
  <div :class="['accordion-item', { active: c.isOpen(value) }]"><slot /></div>
</template>
