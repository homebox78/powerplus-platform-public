<script setup lang="ts">
import { inject } from "vue";

const s = inject<{ id: string }>("hb-sidebar")!;
</script>

<template>
  <aside :id="s.id" class="hb-sidebar"><slot /></aside>
</template>
