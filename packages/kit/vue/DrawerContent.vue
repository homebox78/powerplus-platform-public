<script setup lang="ts">
import { inject, ref } from "vue";
import { DialogPortal, DialogOverlay, DialogContent as Inner, DialogClose, injectDialogRootContext } from "reka-ui";

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ showClose?: boolean; closeLabel?: string; handle?: boolean }>(), {
  showClose: true,
  closeLabel: "닫기",
  handle: true,
});
const ctx = injectDialogRootContext();
const setOpen = inject<(v: boolean) => void>("hb-drawer", () => {});
const dy = ref(0);
let start: number | null = null;
const down = (e: PointerEvent) => {
  start = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};
const move = (e: PointerEvent) => {
  if (start !== null) dy.value = Math.max(0, e.clientY - start);
};
const up = () => {
  if (start === null) return;
  start = null;
  if (dy.value > 80) setOpen(false);
  dy.value = 0;
};
</script>

<template>
  <DialogPortal>
    <div v-if="ctx.open.value" class="krds-modal fade in shown hb-kit hb-drawer" data-type="bottom-sheet">
      <div class="modal-dialog">
        <Inner v-bind="$attrs" class="modal-content" :style="dy ? { transform: 'translateY(' + dy + 'px)', transition: 'none' } : undefined">
          <div v-if="handle" class="hb-drawer-handle" aria-hidden="true" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" />
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
