<!-- 버튼 — KRDS 「버튼」 · shadcn-vue Button 과 같은 사용법
  <Button variant="primary" size="large">신청하기</Button>
  <Button as="a" href="/apply">신청하기</Button>                    ← 링크 모양 버튼
  <Button icon="sch">검색</Button>                                   ← 아이콘 붙은 버튼 (KRDS button_with_icon)
  <Button icon="sch" icon-position="start">검색</Button>              ← 아이콘을 앞에
  <Button variant="text" icon="angle right">주민등록표초본</Button>   ← 텍스트 버튼 + 아이콘
  <Button icon-only icon="refresh" border size="large">새로고침</Button> ← 아이콘 버튼 (글자는 스크린리더 이름)
  <Button :loading="saving">저장</Button>                            ← 처리 중(스피너·aria-busy, 다시 눌러도 무시)
  <Button @click="async () => { await save() }">저장</Button>          ← 핸들러가 Promise 를 돌려주면 끝날 때까지 저절로 처리 중
  icon 은 KRDS 아이콘 이름(svg-icon ico-<이름>).
  처리 중에는 disabled 대신 aria-disabled 를 써서 초점이 버튼에 남게 한다(KRDS 버튼 지침). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "tertiary" | "text";
    size?: "xsmall" | "small" | "medium" | "large" | "xlarge";
    as?: string;
    icon?: string;
    iconPosition?: "start" | "end";
    iconOnly?: boolean;
    border?: boolean;
    /** 처리 중 — 스피너·aria-busy·aria-disabled, 누름은 무시 */
    loading?: boolean;
    /** 처리 중일 때 화면낭독기가 읽는 말 */
    loadingLabel?: string;
    /** Promise 를 돌려주면 끝날 때까지 처리 중 (@click 으로 줘도 같다) */
    onClick?: (e: MouseEvent) => unknown;
  }>(),
  { variant: "primary", size: "medium", as: "button", iconPosition: "end", loadingLabel: "처리 중" },
);
const pending = ref(false);
let alive = true;
onBeforeUnmount(() => (alive = false));
const busy = computed(() => !!props.loading || pending.value);

function handle(e: MouseEvent) {
  if (busy.value) {
    // 처리 중 두 번째 누름은 무시 — 제출·링크 이동도 막는다
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  const r = props.onClick?.(e) as Promise<unknown> | undefined;
  if (r && typeof r.then === "function") {
    pending.value = true;
    r.then(
      () => alive && (pending.value = false),
      () => alive && (pending.value = false),
    );
  }
}
</script>

<template>
  <component
    :is="as"
    :type="as === 'button' ? 'button' : undefined"
    v-bind="$attrs"
    :class="['krds-btn', !iconOnly && variant, size, iconOnly && 'icon', iconOnly && border && 'border', busy && 'hb-btn-loading']"
    :aria-busy="busy || undefined"
    :aria-disabled="busy || $attrs['aria-disabled'] || undefined"
    @click="handle"
  >
    <span v-if="busy && iconPosition === 'start'" class="krds-spinner hb-btn-spinner" aria-hidden="true"></span>
    <i v-else-if="icon && iconPosition === 'start'" :class="`svg-icon ico-${icon}`" data-pos="start" aria-hidden="true"></i>
    <span v-if="iconOnly" class="sr-only"><slot /></span>
    <slot v-else />
    <span v-if="busy" class="sr-only"> {{ loadingLabel }}</span>
    <span v-if="busy && iconPosition === 'end'" class="krds-spinner hb-btn-spinner" aria-hidden="true"></span>
    <i v-else-if="icon && iconPosition === 'end'" :class="`svg-icon ico-${icon}`" data-pos="end" aria-hidden="true"></i>
  </component>
</template>
