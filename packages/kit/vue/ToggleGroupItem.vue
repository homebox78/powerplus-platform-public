<!-- 토글 묶음 항목 — ToggleGroup 안에 둔다. icon 은 KRDS 아이콘 이름. -->
<script setup lang="ts">
import { computed, inject, type ComputedRef } from "vue";

const props = defineProps<{ value: string; icon?: string; disabled?: boolean }>();
const g = inject<{
  type: ComputedRef<"single" | "multiple">;
  values: ComputedRef<string[]>;
  variant: ComputedRef<string>;
  size: ComputedRef<string>;
  disabled: ComputedRef<boolean | undefined>;
  toggle: (v: string) => void;
  select: (v: string) => void;
}>("hb-toggle-group")!;
const on = computed(() => g.values.value.includes(props.value));
const single = computed(() => g.type.value === "single");
function press() {
  if (single.value) g.select(props.value);
  else g.toggle(props.value);
}
</script>

<template>
  <button
    type="button"
    :role="single ? 'radio' : undefined"
    :aria-checked="single ? on : undefined"
    :aria-pressed="single ? undefined : on"
    :data-state="on ? 'on' : 'off'"
    :data-value="value"
    data-hb-tgi=""
    :disabled="disabled || g.disabled.value"
    :class="['hb-toggle', g.variant.value, g.size.value]"
    @click="press"
  >
    <i v-if="icon" :class="`svg-icon ico-${icon}`" aria-hidden="true"></i>
    <slot />
  </button>
</template>
