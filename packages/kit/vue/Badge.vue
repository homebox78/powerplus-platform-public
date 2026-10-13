<!-- 배지 — KRDS 「배지」 · shadcn-vue Badge
  <Badge>접수중</Badge>
  <Badge variant="solid" color="danger">마감</Badge>
  <Badge :count="1200" :max="999" label="새 알림" />   ← 숫자 배지 → "999+"
  <Badge dot label="새 글 있음" color="point" />       ← 점 배지(글자는 스크린리더용)
  variant: outline · solid · light / color: primary·secondary·gray·point·danger·warning·success·information·disabled -->
<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "outline" | "solid" | "light";
    color?: "primary" | "secondary" | "gray" | "point" | "danger" | "warning" | "success" | "information" | "disabled";
    size?: "medium" | "large";
    count?: number;
    max?: number;
    dot?: boolean;
    label?: string;
  }>(),
  { color: "primary", size: "medium", max: 999 },
);
const PREFIX = { outline: "outline-", solid: "bg-", light: "bg-light-" } as const;
const isNumber = computed(() => props.count !== undefined);
const v = computed(() => props.variant ?? (isNumber.value || props.dot ? "solid" : "outline"));
const numText = computed(() => (props.count !== undefined && props.count > props.max ? `${props.max}+` : String(props.count)));
</script>

<template>
  <span :class="['krds-badge', `${PREFIX[v]}${color}`, size === 'large' && 'large', isNumber && 'number', dot && 'dot']">
    <template v-if="!dot">
      <template v-if="isNumber">{{ numText }}</template>
      <slot v-else />
    </template>
    <span v-if="label" class="sr-only">{{ isNumber || dot ? ` ${label}` : label }}</span>
  </span>
</template>
