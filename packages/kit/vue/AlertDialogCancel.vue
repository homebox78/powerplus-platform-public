<!-- 취소 버튼 — 열릴 때 포커스가 먼저 간다 -->
<script setup lang="ts">
import { AlertDialogCancel as Inner } from "reka-ui";

withDefaults(
  defineProps<{ variant?: "primary" | "secondary" | "tertiary" | "text"; size?: "xsmall" | "small" | "medium" | "large" | "xlarge"; asChild?: boolean }>(),
  { variant: "tertiary", size: "medium" },
);
</script>

<template>
  <Inner :as-child="asChild" :class="['krds-btn', variant, size]"><slot /></Inner>
</template>
