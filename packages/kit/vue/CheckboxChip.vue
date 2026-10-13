<!-- 체크박스 칩 — KRDS 「체크박스 칩(checkbox_chip)」 -->
<script setup lang="ts">
import { useUid } from "./utils";
import { useSplitAttrs } from "./field-context";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ label?: string; id?: string }>();
const model = defineModel<boolean>({ default: false });
const cid = props.id ?? useUid("hb-chip");
const { outer, inner } = useSplitAttrs();
</script>

<template>
  <div :class="['krds-form-chip', outer.class]" :style="outer.style as any">
    <input :id="cid" v-model="model" type="checkbox" class="checkbox" v-bind="inner" />
    <label class="krds-form-chip-outline" :for="cid"><slot>{{ label }}</slot></label>
  </div>
</template>
