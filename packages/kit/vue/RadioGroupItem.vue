<script setup lang="ts">
import { inject } from "vue";
import { useUid } from "./utils";

interface HbRadioGroup {
  name: string;
  value: string | undefined;
  disabled: boolean;
  size: "medium" | "large";
  setValue: (v: string) => void;
}

const props = defineProps<{ value: string; label?: string; description?: string; id?: string; disabled?: boolean }>();
const g = inject<HbRadioGroup>("hb-radio-group")!;
const rid = props.id ?? useUid("hb-rdo-i");
</script>

<template>
  <div :class="['krds-form-check', g.size]">
    <input
      :id="rid"
      type="radio"
      :name="g.name"
      :value="value"
      :checked="g.value === value"
      :disabled="disabled || g.disabled"
      :aria-describedby="description || $slots.description ? `${rid}-desc` : undefined"
      @change="g.setValue(value)"
    />
    <label :for="rid"><slot>{{ label }}</slot></label>
    <div v-if="description || $slots.description" class="krds-form-check-cnt">
      <p :id="`${rid}-desc`" class="krds-form-check-p"><slot name="description">{{ description }}</slot></p>
    </div>
  </div>
</template>
