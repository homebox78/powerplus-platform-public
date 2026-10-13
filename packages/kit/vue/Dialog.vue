<!-- 대화상자 — KRDS 「모달」 · shadcn-vue Dialog 와 같은 사용법
  <Dialog>
    <DialogTrigger as-child><Button>신청 안내 보기</Button></DialogTrigger>
    <DialogContent size="medium">
      <DialogHeader><DialogTitle>신청 안내</DialogTitle></DialogHeader>
      <DialogBody><DialogDescription>…</DialogDescription></DialogBody>
      <DialogFooter><DialogClose as-child><Button variant="tertiary">닫기</Button></DialogClose></DialogFooter>
    </DialogContent>
  </Dialog>
  v-model:open 으로 열림을 묶을 수 있다. 동작은 reka-ui Dialog(포커스 가두기·Esc·바깥 누르면 닫기·포커스 복귀). -->
<script setup lang="ts">
import { DialogRoot, useForwardPropsEmits } from "reka-ui";

const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean; modal?: boolean }>(), { open: undefined, defaultOpen: false, modal: true });
const emits = defineEmits<{ "update:open": [value: boolean] }>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DialogRoot v-bind="forwarded"><slot /></DialogRoot>
</template>
