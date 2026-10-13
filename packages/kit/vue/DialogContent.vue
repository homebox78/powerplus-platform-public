<!-- 대화상자 내용 — KRDS modal 마크업. 포털 최상위(.krds-modal)에 hb-kit 을 붙인다. -->
<script setup lang="ts">
import { computed } from "vue";
import { DialogPortal, DialogOverlay, DialogContent as Inner, DialogClose, injectDialogRootContext } from "reka-ui";

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ size?: "small" | "medium" | "large"; showClose?: boolean; closeLabel?: string }>(), {
  showClose: true,
  closeLabel: "닫기",
});
const ctx = injectDialogRootContext();
const sizeClass = computed(() => (props.size ? { small: "modal-sm", medium: "modal-md", large: "modal-lg" }[props.size] : ""));
</script>

<template>
  <DialogPortal>
    <div v-if="ctx.open.value" class="krds-modal fade in shown hb-kit hb-modal">
      <div :class="['modal-dialog', sizeClass]">
        <Inner v-bind="$attrs" class="modal-content">
          <slot />
          <DialogClose v-if="showClose" class="krds-btn medium icon btn-close">
            <span class="sr-only">{{ closeLabel }}</span>
            <i class="svg-icon ico-popup-close" aria-hidden="true" />
          </DialogClose>
        </Inner>
      </div>
      <DialogOverlay class="modal-back in" />
    </div>
  </DialogPortal>
</template>
