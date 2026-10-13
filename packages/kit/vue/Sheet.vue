<!-- 시트 — shadcn-vue Sheet 와 같은 사용법(화면 가장자리에서 밀려 나오는 패널). 모양은 KRDS 모달 토큰.
  <Sheet>
    <SheetTrigger as-child><Button>검색 조건</Button></SheetTrigger>
    <SheetContent side="right">
      <SheetHeader><SheetTitle>검색 조건</SheetTitle><SheetDescription>…</SheetDescription></SheetHeader>
      <SheetBody>…</SheetBody>
      <SheetFooter>…</SheetFooter>
    </SheetContent>
  </Sheet> -->
<script setup lang="ts">
import { DialogRoot, useForwardPropsEmits } from "reka-ui";

const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean; modal?: boolean }>(), { open: undefined, defaultOpen: false, modal: true });
const emits = defineEmits<{ "update:open": [value: boolean] }>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DialogRoot v-bind="forwarded"><slot /></DialogRoot>
</template>
