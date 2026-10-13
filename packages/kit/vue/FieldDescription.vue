<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import { useField } from "./field-context";

const f = useField();
if (f) f.desc = true;
onBeforeUnmount(() => {
  if (f) f.desc = false;
});
</script>

<template>
  <p :id="f ? `${f.id}-desc` : undefined" class="form-hint"><slot /></p>
</template>
