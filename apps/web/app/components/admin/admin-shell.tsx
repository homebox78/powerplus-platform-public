// 관리자 전용 셸 — 공개 사이트와 분리된 별도 사이트처럼(사용자 지시 2026-10-06). 공개 헤더·푸터·문의 버튼·탭바를 쓰지 않는다.
// 상단 띠·사이드바는 admin-layout.tsx(shadcn sidebar-07)가 그리고, 로그인(/admin/login)은 login-04 카드만 — 그래서 셸은 본문 자리만 둔다.
// html[data-area=admin] — 관리자에서는 강조색을 파워플러스 주황 하나로(사용자 2026-10-06). 상태 색 토큰을 app.css 에서 덮는다.
// 시트·다이얼로그는 body 에 그려지므로 main 이 아니라 html 에 표시한다.
import { useEffect } from "react";
import { Outlet } from "react-router";

export function AdminShell() {
  useEffect(() => {
    document.documentElement.dataset.area = "admin";
    return () => { delete document.documentElement.dataset.area; };
  }, []);
  return <div id="content" className="flex min-h-dvh flex-1 flex-col"><Outlet /></div>;
}
