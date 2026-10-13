<!-- 확인 대화상자 — shadcn-vue AlertDialog 와 같은 사용법, 모양은 KRDS 「모달」
  role="alertdialog", 바깥을 눌러도 닫히지 않는다, 닫기(X) 없음, 열리면 '취소'에 포커스.
  <AlertDialog>
    <AlertDialogTrigger as-child><Button>신청 취소</Button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>신청을 취소할까요?</AlertDialogTitle></AlertDialogHeader>
      <AlertDialogBody><AlertDialogDescription>…</AlertDialogDescription></AlertDialogBody>
      <AlertDialogFooter><AlertDialogCancel>돌아가기</AlertDialogCancel><AlertDialogAction @click="cancel">취소하기</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog> -->
<script setup lang="ts">
import { AlertDialogRoot, useForwardPropsEmits } from "reka-ui";

const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean }>(), { open: undefined, defaultOpen: false });
const emits = defineEmits<{ "update:open": [value: boolean] }>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <AlertDialogRoot v-bind="forwarded"><slot /></AlertDialogRoot>
</template>
