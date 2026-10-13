<!-- 아코디언 — KRDS 「아코디언」 · shadcn-vue Accordion 과 같은 사용법
  <Accordion type="single" collapsible default-value="q1">
    <AccordionItem value="q1">
      <AccordionTrigger>신청 자격은?</AccordionTrigger>
      <AccordionContent>…</AccordionContent>
    </AccordionItem>
  </Accordion> -->
<script setup lang="ts">
import { computed, provide, ref } from "vue";
import { useUid } from "./utils";

const props = withDefaults(
  defineProps<{
    type?: "single" | "multiple";
    modelValue?: string | string[];
    defaultValue?: string | string[];
    collapsible?: boolean;
    variant?: "default" | "line";
    headingLevel?: 2 | 3 | 4 | 5 | 6;
  }>(),
  { type: "single", collapsible: true, variant: "default", headingLevel: 3 },
);
const emit = defineEmits<{ "update:modelValue": [string | string[]] }>();
const toList = (v?: string | string[]) => (Array.isArray(v) ? v : v ? [v] : []);
const inner = ref<string[]>(toList(props.defaultValue));
const open = computed(() => (props.modelValue !== undefined ? toList(props.modelValue) : inner.value));
const base = useUid("hb-acc");

provide("hb-acc", {
  base,
  level: props.headingLevel,
  isOpen: (v: string) => open.value.includes(v),
  toggle(v: string) {
    const was = open.value.includes(v);
    let next: string[];
    if (props.type === "multiple") next = was ? open.value.filter((x) => x !== v) : [...open.value, v];
    else next = was ? (props.collapsible ? [] : open.value) : [v];
    inner.value = next;
    emit("update:modelValue", props.type === "multiple" ? next : (next[0] ?? ""));
  },
});
</script>

<template>
  <div :class="['krds-accordion', { line: variant === 'line' }]" :data-type="type === 'multiple' ? 'multiOpen' : 'singleOpen'">
    <slot />
  </div>
</template>
