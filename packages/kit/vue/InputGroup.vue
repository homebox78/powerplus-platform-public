<!-- 입력 그룹 — shadcn-vue InputGroup 과 같은 사용법 (모양은 css/parts/b-form.css)
  <InputGroup size="medium">
    <InputGroupInput v-model="amount" inputmode="numeric" />
    <InputGroupAddon align="end"><InputGroupText>원</InputGroupText></InputGroupAddon>
  </InputGroup> -->
<script setup lang="ts">
import { computed } from "vue";
import { useField } from "./field-context";

const props = withDefaults(
  defineProps<{ size?: "small" | "medium" | "large"; invalid?: boolean; disabled?: boolean; multiline?: boolean }>(),
  { size: "large", invalid: undefined, disabled: undefined },
);
const f = useField();
const bad = computed(() => props.invalid ?? f?.invalid);
const off = computed(() => props.disabled ?? f?.disabled);
</script>

<template>
  <div role="group" :class="['hb-input-group', size, bad && 'is-error', off && 'is-disabled', multiline && 'is-multiline']"><slot /></div>
</template>
