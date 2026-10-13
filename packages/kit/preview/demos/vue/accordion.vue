<script setup lang="ts">
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../../vue";
</script>

<template>
  <Accordion type="single" collapsible default-value="q1">
    <AccordionItem value="q1">
      <AccordionTrigger>신청 자격은 어떻게 되나요?</AccordionTrigger>
      <AccordionContent>공고일 기준 관내에 주민등록을 둔 만 19세 이상 주민이면 신청할 수 있습니다.</AccordionContent>
    </AccordionItem>
    <AccordionItem value="q2">
      <AccordionTrigger>온라인으로도 신청할 수 있나요?</AccordionTrigger>
      <AccordionContent>누리집 「민원 신청」 메뉴에서 본인 인증 후 신청할 수 있습니다.</AccordionContent>
    </AccordionItem>
  </Accordion>
</template>
