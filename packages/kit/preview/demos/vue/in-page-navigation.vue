<script setup lang="ts">
import { InPageNavigation } from "../../../vue";

const SECTIONS = [
  { id: "ipn-overview", label: "서비스 개요", body: "만 18세 미만 등록 장애인 아동의 보호자에게 매월 수당을 지급합니다." },
  { id: "ipn-target", label: "지원 대상", body: "한빛시에 주민등록을 둔 기초생활수급자·차상위계층 가구의 장애 아동이 대상입니다." },
  { id: "ipn-how", label: "신청 방법 및 절차", body: "주소지 행정복지센터를 방문하거나 누리집 「온라인 신청」에서 신청합니다." },
  { id: "ipn-docs", label: "제출 서류", body: "사회보장급여 신청서, 금융정보 제공 동의서, 통장 사본을 준비합니다." },
];
</script>

<template>
  <div style="display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 32px; align-items: start">
    <div>
      <section v-for="s in SECTIONS" :id="s.id" :key="s.id" style="min-height: 180px; padding-bottom: 24px">
        <h3 style="font-size: 19px; font-weight: 700; margin-bottom: 8px">{{ s.label }}</h3>
        <p>{{ s.body }}</p>
      </section>
    </div>
    <InPageNavigation position="static" title="장애아동수당" :items="SECTIONS">
      <template #action><a href="#" class="krds-btn medium primary">온라인 신청하기</a></template>
      <template #info>장애아동수당 외 <strong>1건</strong></template>
    </InPageNavigation>
  </div>
</template>
