<!-- 안내 상자 — shadcn-vue Alert 와 같은 사용법 (KRDS 토큰·아이콘)
  <Alert variant="warning">
    <AlertTitle>서비스 점검 안내</AlertTitle>
    <AlertDescription>9월 27일(토) 02:00~06:00 민원 신청이 멈춥니다.</AlertDescription>
  </Alert>
  variant: info(기본) · success · warning · danger · neutral. 아이콘 + 숨은 글로 상태를 알린다.
  danger·warning 은 role="alert", 나머지는 role="status"(role 속성을 주면 그것을 쓴다). -->
<script setup lang="ts">
import { computed, useAttrs } from "vue";

const props = withDefaults(
  defineProps<{ variant?: "info" | "success" | "warning" | "danger" | "neutral"; hideIcon?: boolean }>(),
  { variant: "info" },
);
const attrs = useAttrs();
const ICON = {
  info: "ico-information-fill",
  success: "ico-success-fill",
  warning: "hb-ico-warning",
  danger: "ico-error-fill",
  neutral: "ico-information-fill",
} as const;
const WORD = { info: "안내", success: "완료", warning: "주의", danger: "오류", neutral: "알림" } as const;
const role = computed(() => (attrs.role as string) ?? (props.variant === "danger" || props.variant === "warning" ? "alert" : "status"));
</script>

<template>
  <div :role="role" :class="['hb-alert', `hb-alert-${variant}`]">
    <i v-if="!hideIcon" :class="['svg-icon', ICON[variant], 'hb-alert-icon']" aria-hidden="true" />
    <span class="sr-only">{{ WORD[variant] }}: </span>
    <div class="hb-alert-body"><slot /></div>
  </div>
</template>
