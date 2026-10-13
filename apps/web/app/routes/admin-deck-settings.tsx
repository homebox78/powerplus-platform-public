// 관리자 · 장표 설정 — AI 키·모델·한도(엔진), 이력·과금, 참조 자료. 서비스 전체 설정이라 마이페이지가 아니라 관리자 모드에 둔다(사용자 지시 2026-10-06).
// 마이페이지 설정 > 장표 변환에는 사용자 개인 것(내 현황)만 남는다. 화면 본체는 옛 powerDeck Settings 그대로.
import { Navigate, NavLink, useParams } from "react-router";
import { AdminTitle } from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";
import { DeckSettingsScreen } from "@/modules/deck/screens";
import { DECK_SETTINGS_MENU } from "@/modules/deck/legacy/screens/Settings";
import type { Route } from "./+types/admin-deck-settings";

export const meta: Route.MetaFunction = ({ params }) => [{ title: `${params.sub === "ref" ? "참조 자료" : "이력 · 과금"} · powerDeck — powerPlus 관리자` }];

// AI · 엔진(키·모델·한도)은 관리자 AI 설정(/admin/ai)으로 옮겼다 — 옛 주소는 그쪽으로 보낸다
const SUBS = DECK_SETTINGS_MENU.filter((s) => s.admin && s.id !== "engine");

export default function AdminDeckSettings() {
  const { sub } = useParams();
  if (sub === "engine") return <Navigate to="/admin/ai" replace />;
  const cur = SUBS.find((s) => s.id === sub) ?? SUBS[0]!;
  return (
    <div>
      <AdminTitle title={`장표 설정 · ${cur.label}`} desc="장표 변환의 과금 이력과 참조 자료입니다. AI 키·모델은 AI 설정에서 바꿉니다." />
      <nav className="mt-6 flex flex-wrap gap-1 border-b border-line" aria-label="장표 설정 메뉴">
        {SUBS.map((s) => (
          <NavLink key={s.id} to={`/admin/deck-settings/${s.id}`} className={({ isActive }) => cn("relative flex h-11 items-center px-3 text-sm transition-colors", isActive || (s.id === cur.id && !sub) ? "font-bold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink" : "font-medium text-ink-4 hover:text-ink")}>
            {s.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6"><DeckSettingsScreen forceMenu={cur.id} /></div>
    </div>
  );
}
