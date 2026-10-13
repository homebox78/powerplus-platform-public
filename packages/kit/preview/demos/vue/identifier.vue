<script setup lang="ts">
import { Identifier } from "../../../vue";

// 시연용 자리표시 로고(실제 기관 로고가 아니다)
const ph = (label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect width="120" height="32" rx="4" fill="#e6e8ea"/><text x="60" y="21" font-size="13" text-anchor="middle" fill="#464c53" font-family="sans-serif">${label}</text></svg>`,
  )}`;
const logos = [
  { src: ph("상위 기관"), alt: "한빛시" },
  { src: ph("운영 기관"), alt: "한빛시 문화재단" },
];
</script>

<template>
  <div style="padding: 16px; background: var(--krds-light-color-surface-gray-subtler)">
  <Identifier org-name="한빛시" />
  <Identifier class="pv-mt" text="이 누리집은 한빛시 문화관광과에서 운영합니다." />
  <Identifier class="pv-mt" org-name="한빛시 문화재단" :logos="logos" />
  </div>
</template>
