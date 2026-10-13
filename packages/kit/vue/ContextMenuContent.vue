<!-- 오른쪽 클릭 메뉴 · ContextMenuContent — shadcn-vue ContextMenuContent 와 같은 사용법. 동작은 reka-ui.
  body 끝에 붙으므로 최상위 요소에 hb-kit 을 붙인다. -->
<script setup lang="ts">
import { ContextMenuContent as R, ContextMenuPortal as RPortal } from "reka-ui";
defineOptions({ inheritAttrs: false });
defineProps<{}>();
</script>

<template>
  <RPortal>
    <R v-bind="$attrs" class="hb-kit hb-menu"><slot /></R>
  </RPortal>
</template>
