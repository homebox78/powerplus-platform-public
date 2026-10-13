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
} from "../../../react";

export const meta = { id: "sidebar", title: "사이드바", group: "nav", source: "shadcn", note: "왼쪽 위 버튼으로 접으면 아이콘만 남는다(메뉴 이름은 스크린리더·마우스 풍선으로)." };

const WORK = [
  { icon: "file", label: "신청 현황", active: true },
  { icon: "calendar", label: "처리 일정" },
  { icon: "email", label: "알림함" },
];
const SETTING = [
  { icon: "my", label: "내 정보" },
  { icon: "setting", label: "환경 설정" },
];

export default function Demo() {
  return (
    <div style={{ height: 420, border: "1px solid var(--krds-light-color-border-gray-light)", borderRadius: 12, overflow: "hidden" }}>
      <SidebarProvider>
        <Sidebar aria-label="민원 업무 메뉴">
          <SidebarHeader>
            <div className="hb-sidebar-brand">
              <i className="svg-icon ico-setting" aria-hidden="true" />
              <span className="hb-sidebar-label">한빛시 민원 업무</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>업무</SidebarGroupLabel>
              <SidebarMenu>
                {WORK.map((m) => (
                  <SidebarMenuItem key={m.label}>
                    <SidebarMenuButton href="#" icon={m.icon} isActive={m.active}>{m.label}</SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>설정</SidebarGroupLabel>
              <SidebarMenu>
                {SETTING.map((m) => (
                  <SidebarMenuItem key={m.label}>
                    <SidebarMenuButton href="#" icon={m.icon}>{m.label}</SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton icon="logout">로그아웃</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderBottom: "1px solid var(--krds-light-color-border-gray-light)" }}>
            <SidebarTrigger />
            <strong>신청 현황</strong>
          </div>
          <div style={{ padding: 16 }}>
            <p>처리 중인 민원 3건, 보완 요청 1건이 있습니다.</p>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
