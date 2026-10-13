<script setup lang="ts">
import { TooltipProvider as Inner } from "reka-ui";

withDefaults(defineProps<{ delayDuration?: number }>(), { delayDuration: 200 });
</script>

<template>
  <Inner :delay-duration="delayDuration"><slot /></Inner>
</template>
