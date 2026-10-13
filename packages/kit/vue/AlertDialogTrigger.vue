<script setup lang="ts">
import { AlertDialogTrigger as Inner } from "reka-ui";

defineProps<{ asChild?: boolean }>();
</script>

<template>
  <Inner :as-child="asChild"><slot /></Inner>
</template>
