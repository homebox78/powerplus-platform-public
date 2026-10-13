<!-- 접기·펼치기 — KRDS 「디스클로저」 · shadcn-vue Collapsible 과 같은 사용법
  <Collapsible v-model:open="open">
    <CollapsibleTrigger>신청 서비스 안내</CollapsibleTrigger>
    <CollapsibleContent>…</CollapsibleContent>
  </Collapsible>
  닫힌 내용은 inert 라 Tab 으로 들어가지 않는다. -->
<script setup lang="ts">
import { computed, provide, ref } from "vue";
import { useUid } from "./utils";

// open 을 비우면 undefined 로 둔다(Vue 는 불리언 prop 을 기본 false 로 바꾸므로 명시)
const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean }>(), { open: undefined, defaultOpen: false });
const emit = defineEmits<{ "update:open": [boolean] }>();
const inner = ref(props.defaultOpen ?? false);
const isOpen = computed(() => props.open ?? inner.value);
const id = useUid("hb-disclosure");
provide("hb-collapsible", {
  isOpen,
  id,
  setOpen(v: boolean) {
    inner.value = v;
    emit("update:open", v);
  },
});
</script>

<template>
  <div :data-state="isOpen ? 'open' : 'closed'" :class="['krds-disclosure', 'conts-expand-area', { active: isOpen }]"><slot /></div>
</template>
