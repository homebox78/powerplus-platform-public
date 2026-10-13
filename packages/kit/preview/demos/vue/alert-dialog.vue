<script setup lang="ts">
import { ref } from "vue";
import {
  Button,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "../../../vue";

const result = ref("접수 중인 신청 1건");
</script>

<template>
  <div class="pv-row">
    <AlertDialog>
      <AlertDialogTrigger as-child>
        <Button variant="secondary">신청 취소</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>신청을 취소할까요?</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogBody>
          <AlertDialogDescription>취소하면 작성한 내용과 첨부한 서류가 모두 지워지며 되돌릴 수 없습니다.</AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel>돌아가기</AlertDialogCancel>
          <AlertDialogAction @click="result = '신청이 취소되었습니다'">신청 취소하기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <p role="status">{{ result }}</p>
  </div>
</template>
