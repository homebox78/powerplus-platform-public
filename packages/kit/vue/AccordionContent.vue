<script setup lang="ts">
import { inject } from "vue";

const c = inject<{ base: string }>("hb-acc")!;
const v = inject<string>("hb-acc-item")!;
</script>

<template>
  <div :id="`${c.base}-c-${v}`" role="region" :aria-labelledby="`${c.base}-h-${v}`" class="accordion-collapse collapse">
    <div class="accordion-body"><slot /></div>
  </div>
</template>
