<script setup lang="ts">
import { computed, inject, type ComputedRef } from "vue";

const props = defineProps<{ value: string; disabled?: boolean }>();
const t = inject<{ value: ComputedRef<string>; base: string; setValue: (v: string) => void }>("hb-tabs")!;
const on = computed(() => t.value.value === props.value);
</script>

<template>
  <li role="presentation" :class="{ active: on }">
    <button
      type="button"
      role="tab"
      :id="`${t.base}-t-${value}`"
      :aria-controls="`${t.base}-p-${value}`"
      :aria-selected="on"
      :tabindex="on ? 0 : -1"
      :data-value="value"
      :disabled="disabled"
      class="btn-tab"
      @click="t.setValue(value)"
    >
      <slot /><i v-if="on" class="sr-only"> 선택됨</i>
    </button>
  </li>
</template>
