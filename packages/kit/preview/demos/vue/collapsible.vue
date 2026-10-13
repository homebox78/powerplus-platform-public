<script setup lang="ts">
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../vue";
</script>

<template>
  <Collapsible>
    <CollapsibleTrigger>신청 서비스 안내</CollapsibleTrigger>
    <CollapsibleContent>
      <ul class="krds-info-list dash">
        <li>하나의 아이디로 한빛시 누리집의 여러 전자 민원을 이용할 수 있습니다.</li>
        <li>이용 문의: 한빛시 민원콜센터 120 (평일 9시~18시, 공휴일 제외)</li>
      </ul>
    </CollapsibleContent>
  </Collapsible>
  <Collapsible default-open>
    <CollapsibleTrigger>수수료 감면 대상</CollapsibleTrigger>
    <CollapsibleContent>
      <ul class="krds-info-list dash">
        <li>국민기초생활보장 수급자와 국가유공자는 발급 수수료를 면제합니다.</li>
        <li>감면을 받으려면 신청할 때 증빙 서류를 함께 내야 합니다.</li>
      </ul>
    </CollapsibleContent>
  </Collapsible>
</template>
