<!-- 토글 스위치 — KRDS 「토글 스위치(toggle_switch·toggle_switch_size)」 · shadcn-vue Switch 와 같은 사용법
  <Switch v-model="notify" label="알림 받기" />  실제 checkbox 에 role="switch". -->
<script setup lang="ts">
import { useUid } from "./utils";
import { useSplitAttrs } from "./field-context";

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ label?: string; size?: "medium" | "large"; id?: string }>(), { size: "medium" });
const model = defineModel<boolean>({ default: false });
const sid = props.id ?? useUid("hb-sw");
const { outer, inner } = useSplitAttrs();
</script>

<template>
  <div :class="['krds-form-toggle-switch', size, outer.class]" :style="outer.style as any">
    <input :id="sid" v-model="model" type="checkbox" role="switch" v-bind="inner" />
    <label :for="sid"><span class="switch-toggle" aria-hidden="true"><i></i></span><slot>{{ label }}</slot></label>
  </div>
</template>
