<script setup lang="ts">
import { TooltipTrigger as Inner } from "reka-ui";

defineProps<{ asChild?: boolean }>();
</script>

<template>
  <Inner :as-child="asChild" class="krds-tooltip"><slot /></Inner>
</template>
