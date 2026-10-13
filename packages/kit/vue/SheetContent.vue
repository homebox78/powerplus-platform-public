<script setup lang="ts">
import { DialogPortal, DialogOverlay, DialogContent as Inner, DialogClose, injectDialogRootContext } from "reka-ui";

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ side?: "right" | "left" | "top" | "bottom"; showClose?: boolean; closeLabel?: string }>(), {
  side: "right",
  showClose: true,
  closeLabel: "닫기",
});
const ctx = injectDialogRootContext();
</script>

<template>
  <DialogPortal>
    <div v-if="ctx.open.value" class="hb-kit hb-sheet-root">
      <DialogOverlay class="hb-sheet-overlay" />
      <Inner v-bind="$attrs" :data-side="side" class="hb-sheet">
        <slot />
        <DialogClose v-if="showClose" class="krds-btn medium icon hb-sheet-close">
          <span class="sr-only">{{ closeLabel }}</span>
          <i class="svg-icon ico-popup-close" aria-hidden="true" />
        </DialogClose>
      </Inner>
    </div>
  </DialogPortal>
</template>
