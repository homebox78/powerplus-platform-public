<!-- 드로어 — 아래에서 올라오는 시트. 모양은 KRDS 「모달」 바텀시트, 사용법은 shadcn-vue Drawer.
  <Drawer>
    <DrawerTrigger as-child><Button>정렬·보기 설정</Button></DrawerTrigger>
    <DrawerContent>
      <DrawerHeader><DrawerTitle>정렬</DrawerTitle></DrawerHeader>
      <DrawerBody>…</DrawerBody>
      <DrawerFooter><DrawerClose as-child><Button>적용</Button></DrawerClose></DrawerFooter>
    </DrawerContent>
  </Drawer>
  손잡이를 아래로 80px 이상 끌면 닫힌다(마우스·터치 보조 동작, 키보드는 Esc·닫기 버튼). -->
<script setup lang="ts">
import { computed, provide, ref } from "vue";
import { DialogRoot } from "reka-ui";

const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean }>(), { open: undefined, defaultOpen: false });
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const inner = ref(props.defaultOpen);
const current = computed(() => props.open ?? inner.value);
const setOpen = (v: boolean) => {
  inner.value = v;
  emit("update:open", v);
};
provide("hb-drawer", setOpen);
</script>

<template>
  <DialogRoot :open="current" @update:open="setOpen"><slot /></DialogRoot>
</template>
