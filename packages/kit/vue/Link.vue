<!-- 링크 — KRDS 「링크」(krds-btn link)
  <Link href="/notice">공지사항 보기</Link>
  <Link href="https://www.gov.kr" external>정부24 바로가기</Link>   ← 새 창 + 이동 아이콘 + "새 창 열림" 안내
  <Link href="/guide" tone="basic" underline="hover">이용 안내</Link>
  <Link href="/files/guide.pdf" download :file-size="2400000">신청 안내서</Link>
    ← 첨부파일: 글 뒤 [pdf, 2.3MB] + 다운로드 아이콘 + 화면낭독용 "다운로드". 형식은 href 확장자로(file-type 으로 덮기)
  tone: primary · basic / underline: always · hover · none / keep-color: 상태별 색 유지(KRDS pure)
  as="router-link" 처럼 다른 요소로 바꿀 수 있다. -->
<script setup lang="ts">
import { computed, useAttrs } from "vue";

const props = withDefaults(
  defineProps<{
    size?: "xsmall" | "small" | "medium" | "large" | "xlarge" | "inherit";
    tone?: "primary" | "basic";
    underline?: "always" | "hover" | "none";
    keepColor?: boolean;
    external?: boolean;
    /** 첨부파일 형식 (기본: href 확장자) — download 와 함께 쓴다 */
    fileType?: string;
    /** 첨부파일 크기(바이트) */
    fileSize?: number;
    as?: string;
  }>(),
  { size: "large", tone: "primary", underline: "always", as: "a" },
);
const attrs = useAttrs();

function formatSize(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}MB`;
}
const isFile = computed(() => attrs.download !== undefined && attrs.download !== false);
const meta = computed(() => {
  if (!isFile.value) return "";
  const href = typeof attrs.href === "string" ? attrs.href : "";
  const ext = props.fileType ?? /\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(href)?.[1];
  return [ext?.toLowerCase(), props.fileSize != null ? formatSize(props.fileSize) : ""].filter(Boolean).join(", ");
});
</script>

<template>
  <component
    :is="as"
    :class="['krds-btn', 'link', size === 'inherit' ? 'hb-link-inherit' : size, tone === 'basic' && 'basic', keepColor && 'pure']"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
  >
    <span v-if="underline === 'none'"><slot /></span>
    <span v-else :class="['underline', underline === 'hover' && 'hidden-underline']"><slot /></span>
    <template v-if="isFile">
      <span v-if="meta" class="hb-file-meta"> [{{ meta }}]</span>
      <span class="sr-only"> 다운로드</span>
      <i class="svg-icon ico-down" data-pos="end" aria-hidden="true"></i>
    </template>
    <template v-if="external">
      <span class="sr-only">(새 창 열림)</span>
      <i class="svg-icon ico-go" data-pos="end" aria-hidden="true"></i>
    </template>
  </component>
</template>
