<!-- 확인(실행) 버튼 — 누르면 닫힌다 -->
<script setup lang="ts">
import { AlertDialogAction as Inner } from "reka-ui";

withDefaults(
  defineProps<{ variant?: "primary" | "secondary" | "tertiary" | "text"; size?: "xsmall" | "small" | "medium" | "large" | "xlarge"; asChild?: boolean }>(),
  { variant: "primary", size: "medium" },
);
</script>

<template>
  <Inner :as-child="asChild" :class="['krds-btn', variant, size]"><slot /></Inner>
</template>
