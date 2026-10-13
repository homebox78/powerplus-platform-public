<script setup lang="ts">
import { useFieldControl } from "./field-context";

const props = withDefaults(defineProps<{ type?: string; invalid?: boolean; id?: string }>(), { type: "text", invalid: undefined });
const model = defineModel<string>();
const f = useFieldControl(() => ({ id: props.id, invalid: props.invalid }));
</script>

<template>
  <input v-model="model" :type="type" class="hb-input-group-input" v-bind="f" />
</template>
