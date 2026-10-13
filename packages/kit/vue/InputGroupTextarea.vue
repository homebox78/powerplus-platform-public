<script setup lang="ts">
import { useFieldControl } from "./field-context";

const props = withDefaults(defineProps<{ invalid?: boolean; id?: string }>(), { invalid: undefined });
const model = defineModel<string>();
const f = useFieldControl(() => ({ id: props.id, invalid: props.invalid }));
</script>

<template>
  <textarea v-model="model" class="hb-input-group-input" v-bind="f"></textarea>
</template>
