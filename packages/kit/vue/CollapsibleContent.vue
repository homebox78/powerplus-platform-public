<script setup lang="ts">
import { inject, type ComputedRef } from "vue";

defineOptions({ inheritAttrs: false });
const c = inject<{ isOpen: ComputedRef<boolean>; id: string }>("hb-collapsible")!;
</script>

<template>
  <div :id="c.id" class="expand-wrap" :inert="!c.isOpen.value || undefined" :aria-hidden="!c.isOpen.value">
    <div class="expand-in" v-bind="$attrs"><slot /></div>
  </div>
</template>
