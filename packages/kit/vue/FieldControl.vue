<script setup lang="ts">
import { computed } from "vue";
import { useField } from "./field-context";

const props = defineProps<{ state?: "error" | "success" | "information" }>();
const f = useField();
const s = computed(() => props.state ?? (f?.invalid ? "error" : undefined));
</script>

<template>
  <div :class="['form-conts', s && `is-${s}`]"><slot /></div>
</template>
