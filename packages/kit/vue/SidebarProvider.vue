<!-- 사이드바 — shadcn-vue Sidebar 와 같은 사용법 (모양은 KRDS 토큰으로 새로 지음)
  <SidebarProvider v-model:open="open">
    <Sidebar aria-label="업무 메뉴">
      <SidebarHeader>…</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>민원 업무</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton icon="file" href="/apply" is-active>신청 현황</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
    <SidebarInset><SidebarTrigger /> 본문</SidebarInset>
  </SidebarProvider>
  접으면 아이콘만 남고, 메뉴 이름은 화면 밖 글자와 마우스 풍선(title)으로 남는다. -->
<script setup lang="ts">
import { computed, provide, ref } from "vue";
import { useUid } from "./utils";

// open 을 비우면 undefined 로 둔다(Vue 는 불리언 prop 을 기본 false 로 바꾸므로 명시)
const props = withDefaults(defineProps<{ open?: boolean; defaultOpen?: boolean }>(), { open: undefined, defaultOpen: true });
const emit = defineEmits<{ "update:open": [boolean] }>();
const inner = ref(props.defaultOpen ?? true);
const isOpen = computed(() => props.open ?? inner.value);
const id = useUid("hb-sidebar");
const setOpen = (v: boolean) => {
  inner.value = v;
  emit("update:open", v);
};
provide("hb-sidebar", { isOpen, id, setOpen, toggle: () => setOpen(!isOpen.value) });
</script>

<template>
  <div :data-state="isOpen ? 'expanded' : 'collapsed'" class="hb-sidebar-wrapper"><slot /></div>
</template>
