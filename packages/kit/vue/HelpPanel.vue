<!-- 도움 패널 — KRDS 「도움 패널(help_panel)」. 열기 버튼·패널을 묶는 뿌리(요소를 만들지 않는다)
  <HelpPanel v-model:open="open">
    <HelpPanelTrigger />
    <HelpPanelContent>…</HelpPanelContent>
  </HelpPanel>
  inline 을 주면 화면 고정이 아니라 가장 가까운 .hb-help-stage 안에 붙는다(미리보기·문서용). -->
<script setup lang="ts">
import { computed, provide, ref } from "vue";
import { useUid } from "./utils";

const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean; inline?: boolean }>(), {
  open: undefined,
  defaultOpen: false,
  inline: false,
});
const emit = defineEmits<{ "update:open": [boolean] }>();
const inner = ref(props.defaultOpen);
const isOpen = computed(() => props.open ?? inner.value);
const trigger = ref<HTMLButtonElement | null>(null);
const userOpened = ref(false);

provide("hb-help", {
  isOpen,
  panelId: useUid("hb-help"),
  inline: computed(() => props.inline),
  trigger,
  userOpened,
  setOpen(v: boolean, focusBack = false) {
    inner.value = v;
    emit("update:open", v);
    if (!v && focusBack) setTimeout(() => trigger.value?.focus(), 0);
  },
});
</script>

<template>
  <slot />
</template>
