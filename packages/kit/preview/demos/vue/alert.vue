<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle, CriticalAlert, CriticalAlerts } from "../../../vue";
</script>

<template>
  <div style="display: grid; gap: 12px">
    <Alert>
      <AlertTitle>민원 처리 기간 안내</AlertTitle>
      <AlertDescription>추석 연휴(10.3~10.9)에 접수한 민원은 10월 10일부터 차례로 처리합니다.</AlertDescription>
    </Alert>
    <Alert variant="success">
      <AlertTitle>신청이 접수되었습니다</AlertTitle>
      <AlertDescription>접수번호 2026-0925-0142 · 처리 결과는 문자로 알려 드립니다.</AlertDescription>
    </Alert>
    <Alert variant="warning">
      <AlertTitle>서비스 점검 안내</AlertTitle>
      <AlertDescription>9월 27일(토) 02:00~06:00 온라인 민원 신청을 잠시 멈춥니다.</AlertDescription>
    </Alert>
    <Alert variant="danger">
      <AlertTitle>첨부 파일을 확인해 주세요</AlertTitle>
      <AlertDescription>사업자등록증 사본이 빠졌습니다. 파일을 다시 올린 뒤 제출해 주세요.</AlertDescription>
    </Alert>
    <Alert variant="neutral" hide-icon>
      <AlertDescription>이 페이지는 2026년 9월 22일에 마지막으로 고쳤습니다.</AlertDescription>
    </Alert>
  </div>
  <CriticalAlerts>
    <CriticalAlert type="danger" href="#">호우 경보 발효 — 하천변 산책로와 둔치 주차장 출입을 통제합니다.</CriticalAlert>
    <CriticalAlert type="ok" href="#">한빛대교 긴급 보수 공사가 끝나 전 차로 통행을 재개했습니다.</CriticalAlert>
    <CriticalAlert type="info" href="#">10월 1일부터 시내버스 12번 노선이 한빛역까지 연장 운행합니다.</CriticalAlert>
  </CriticalAlerts>
</template>
