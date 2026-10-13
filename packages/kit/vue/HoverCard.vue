<!-- 호버 카드 — shadcn-vue HoverCard 와 같은 사용법(링크에 마우스를 올리거나 포커스하면 미리보기 카드).
  <HoverCard>
    <HoverCardTrigger href="/org/passport">민원여권과</HoverCardTrigger>
    <HoverCardContent>…</HoverCardContent>
  </HoverCard>
  카드 안 내용은 보조 정보여야 한다 — 꼭 필요한 정보는 링크가 가리키는 페이지에도 둔다. -->
<script setup lang="ts">
import { HoverCardRoot, useForwardPropsEmits } from "reka-ui";

const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean; openDelay?: number; closeDelay?: number }>(), { open: undefined, defaultOpen: false, openDelay: 300, closeDelay: 200 });
const emits = defineEmits<{ "update:open": [value: boolean] }>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <HoverCardRoot v-bind="forwarded"><slot /></HoverCardRoot>
</template>
