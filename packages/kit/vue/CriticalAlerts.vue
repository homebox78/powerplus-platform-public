<!-- 긴급 공지 띠 — KRDS 「긴급 공지(critical alerts)」
  <CriticalAlerts>
    <CriticalAlert type="danger" href="/notice/1">호우 경보 — 하천변 산책로 출입을 통제합니다.</CriticalAlert>
  </CriticalAlerts> -->
<script setup lang="ts">
withDefaults(defineProps<{ ariaLabel?: string }>(), { ariaLabel: "긴급 공지" });
</script>

<template>
  <div class="main-urgent-wrap">
    <ul class="krds-critical-alerts" :aria-label="ariaLabel"><slot /></ul>
  </div>
</template>
