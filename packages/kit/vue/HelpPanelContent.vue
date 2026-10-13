<!-- 도움 패널 · 패널 본체 (role=complementary). 열면 패널로 포커스, "접어두기"·Esc 로 닫으면 열기 버튼으로 복귀 -->
<script setup lang="ts">
import { inject, ref, watch, type Ref } from "vue";

withDefaults(defineProps<{ label?: string; foldLabel?: string }>(), { label: "도움말", foldLabel: "접어두기" });
const c = inject<{
  isOpen: Ref<boolean>;
  panelId: string;
  inline: Ref<boolean>;
  userOpened: Ref<boolean>;
  setOpen: (v: boolean, f?: boolean) => void;
}>("hb-help")!;
const wrap = ref<HTMLElement>();
watch(c.isOpen, (on) => {
  if (on && c.userOpened.value) setTimeout(() => wrap.value?.focus(), 50);
  c.userOpened.value = false;
});
</script>

<template>
  <div :id="c.panelId" :class="['krds-help-panel', { expand: c.isOpen.value, 'hb-help-panel-inline': c.inline.value }]">
    <div
      ref="wrap"
      class="help-panel-wrap"
      role="complementary"
      :aria-label="label"
      :tabindex="c.isOpen.value ? 0 : undefined"
      @keydown.esc="c.setOpen(false, true)"
    >
      <div class="help-conts-area">
        <slot />
        <button type="button" class="krds-btn small tertiary btn-help-panel fold" @click="c.setOpen(false, true)">
          <span class="sr-only">{{ label }}</span> {{ foldLabel }} <i class="svg-icon ico-angle right" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
