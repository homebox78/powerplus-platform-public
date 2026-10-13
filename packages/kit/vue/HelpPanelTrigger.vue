<!-- 도움 패널 · "도움말" 열기 버튼 (aria-expanded · aria-controls) -->
<script setup lang="ts">
import { inject, onMounted, ref, type Ref } from "vue";

const c = inject<{
  isOpen: Ref<boolean>;
  panelId: string;
  trigger: Ref<HTMLButtonElement | null>;
  userOpened: Ref<boolean>;
  setOpen: (v: boolean) => void;
}>("hb-help")!;
const el = ref<HTMLButtonElement>();
onMounted(() => (c.trigger.value = el.value ?? null));
function open() {
  c.userOpened.value = true;
  c.setOpen(true);
}
</script>

<template>
  <button
    ref="el"
    type="button"
    class="krds-btn small tertiary btn-help-panel expand btn-help-exec"
    :aria-expanded="c.isOpen.value"
    :aria-controls="c.panelId"
    @click="open"
  >
    <i class="svg-icon ico-fold" aria-hidden="true" /> <slot>도움말</slot>
  </button>
</template>
