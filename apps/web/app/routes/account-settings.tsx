// 마이페이지 · 설정 — 모든 설정을 이 한 화면에 모은다(사용자 지시 2026-10-06).
// 항목·하위 메뉴는 마이페이지 왼쪽 "설정" 아래에 펼친다 — 본문 안에 탭·사이드를 또 두지 않는다(사용자 지시: UI 공간 낭비).
// 항목이 늘면 SETTINGS 에 한 줄 추가. 주소: /account/settings/<항목>/<하위>, 없으면 첫 항목·첫 하위.
import type { ComponentType } from "react";
import { useParams } from "react-router";
import { useMe } from "@/lib/auth";
import { DeckSettingsScreen } from "@/modules/deck/screens";
import { NotifySettingsScreen } from "@/components/hb/notify-settings";
import { DECK_SETTINGS_MENU } from "@/modules/deck/legacy/screens/Settings";
import { pageTitle } from "@/lib/page-title";
import type { Route } from "./+types/account-settings";

export type SettingsSub = { id: string; label: string; admin: boolean };
export const SETTINGS: { id: string; label: string; desc: string; subs: SettingsSub[]; Screen: ComponentType }[] = [
  { id: "deck", label: "장표 변환", desc: "AI 상태와 내 작업 이력을 봅니다.", subs: DECK_SETTINGS_MENU, Screen: DeckSettingsScreen },
  { id: "notify", label: "알림", desc: "메일로 받을 알림 종류를 고릅니다.", subs: [], Screen: NotifySettingsScreen },
];

/** 마이페이지에는 개인 설정만 — 서비스 설정(admin:true)은 관리자 모드(/admin/deck-settings)로 갔다 */
export const meta: Route.MetaFunction = ({ params }) => {
  const cur = SETTINGS.find((s) => s.id === params.section) ?? SETTINGS[0]!;
  const sub = cur.subs.filter((x) => !x.admin).find((x) => x.id === params.sub);
  return [{ title: pageTitle(sub ? `${cur.label} · ${sub.label}` : cur.label, "설정") }];
};

export const visibleSubs = (subs: SettingsSub[], _isAdmin: boolean) => subs.filter((s) => !s.admin);

export default function AccountSettingsPage() {
  const { section, sub } = useParams();
  const { isAdmin } = useMe();
  const cur = SETTINGS.find((s) => s.id === section) ?? SETTINGS[0]!;
  const subs = visibleSubs(cur.subs, isAdmin);
  const curSub = subs.find((s) => s.id === sub) ?? subs[0];
  return (
    <div>
      <p className="text-sm text-ink-4">설정 · {cur.label}</p>
      <h1 className="mt-1 text-4xl font-extrabold tracking-[-0.03em]">{curSub?.label ?? cur.label}</h1>
      <p className="mt-2 text-md text-ink-3">{cur.desc}</p>
      <div className="mt-8"><cur.Screen /></div>
    </div>
  );
}
