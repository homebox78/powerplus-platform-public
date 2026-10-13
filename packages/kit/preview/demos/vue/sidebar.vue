<script setup lang="ts">
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "../../../vue";

const WORK = [
  { icon: "file", label: "신청 현황", active: true },
  { icon: "calendar", label: "처리 일정" },
  { icon: "email", label: "알림함" },
];
const SETTING = [
  { icon: "my", label: "내 정보" },
  { icon: "setting", label: "환경 설정" },
];
</script>

<template>
  <div style="height: 420px; border: 1px solid var(--krds-light-color-border-gray-light); border-radius: 12px; overflow: hidden">
    <SidebarProvider>
      <Sidebar aria-label="민원 업무 메뉴">
        <SidebarHeader>
          <div class="hb-sidebar-brand">
            <i class="svg-icon ico-setting" aria-hidden="true" />
            <span class="hb-sidebar-label">한빛시 민원 업무</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>업무</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem v-for="m in WORK" :key="m.label">
                <SidebarMenuButton href="#" :icon="m.icon" :is-active="m.active">{{ m.label }}</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>설정</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem v-for="m in SETTING" :key="m.label">
                <SidebarMenuButton href="#" :icon="m.icon">{{ m.label }}</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton icon="logout">로그아웃</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div style="display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--krds-light-color-border-gray-light)">
          <SidebarTrigger />
          <strong>신청 현황</strong>
        </div>
        <div style="padding: 16px"><p>처리 중인 민원 3건, 보완 요청 1건이 있습니다.</p></div>
      </SidebarInset>
    </SidebarProvider>
  </div>
</template>
