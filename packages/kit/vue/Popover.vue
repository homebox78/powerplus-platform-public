<!-- 팝오버 — shadcn-vue Popover 와 같은 사용법. 모양은 KRDS 토큰(상자형 말풍선과 같은 면·테두리).
  <Popover>
    <PopoverTrigger as-child><Button variant="secondary">알림 설정</Button></PopoverTrigger>
    <PopoverContent><PopoverTitle>알림 받을 방법</PopoverTitle>…</PopoverContent>
  </Popover>
  Esc·바깥 누르면 닫힘, 닫으면 버튼으로 포커스 복귀. 짧은 설명만 보여 줄 때는 Tooltip. -->
<script setup lang="ts">
import { PopoverRoot, useForwardPropsEmits } from "reka-ui";

const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean; modal?: boolean }>(), { open: undefined, defaultOpen: false, modal: false });
const emits = defineEmits<{ "update:open": [value: boolean] }>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <PopoverRoot v-bind="forwarded"><slot /></PopoverRoot>
</template>
