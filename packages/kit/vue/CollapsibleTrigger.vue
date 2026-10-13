<script setup lang="ts">
import { inject, type ComputedRef } from "vue";

const c = inject<{ isOpen: ComputedRef<boolean>; id: string; setOpen: (v: boolean) => void }>("hb-collapsible")!;
</script>

<template>
  <button type="button" :aria-expanded="c.isOpen.value" :aria-controls="c.id" class="btn-conts-expand" @click="c.setOpen(!c.isOpen.value)">
    <slot />
  </button>
</template>
