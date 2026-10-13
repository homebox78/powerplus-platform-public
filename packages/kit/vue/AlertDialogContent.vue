<script setup lang="ts">
import { AlertDialogPortal, AlertDialogOverlay, AlertDialogContent as Inner, injectDialogRootContext } from "reka-ui";

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ size?: "small" | "medium" | "large" }>(), { size: "small" });
const ctx = injectDialogRootContext();
const sizeClass = { small: "modal-sm", medium: "modal-md", large: "modal-lg" }[props.size];
</script>

<template>
  <AlertDialogPortal>
    <div v-if="ctx.open.value" class="krds-modal fade in shown hb-kit hb-modal">
      <div :class="['modal-dialog', sizeClass]">
        <Inner v-bind="$attrs" class="modal-content"><slot /></Inner>
      </div>
      <AlertDialogOverlay class="modal-back in" />
    </div>
  </AlertDialogPortal>
</template>
