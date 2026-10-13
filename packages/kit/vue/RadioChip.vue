<!-- 라디오 칩 — KRDS 「라디오 칩(radio_chip)」. RadioGroup 안에서 쓴다. -->
<script setup lang="ts">
import { inject } from "vue";
import { useUid } from "./utils";

const props = defineProps<{ value: string; label?: string; id?: string; disabled?: boolean }>();
const g = inject<{ name: string; value: string | undefined; disabled: boolean; setValue: (v: string) => void }>("hb-radio-group")!;
const cid = props.id ?? useUid("hb-rchip");
</script>

<template>
  <div class="krds-form-chip">
    <input
      :id="cid"
      type="radio"
      class="radio"
      :name="g.name"
      :value="value"
      :checked="g.value === value"
      :disabled="disabled || g.disabled"
      @change="g.setValue(value)"
    />
    <label class="krds-form-chip-outline" :for="cid"><slot>{{ label }}</slot></label>
  </div>
</template>
