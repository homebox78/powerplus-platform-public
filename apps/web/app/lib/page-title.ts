// 탭 제목 규칙 — "화면 이름 · 모듈 — powerPlus" (사이트 종합 평가 리포트 2-1·2-2·4-6, 2026-10-09).
// 자체 meta 가 없는 화면(모듈 탭·설정·404 등)은 root 의 meta 가 이 함수로 제목을 만든다. 화면이 자기 meta 를 내면 그쪽이 이긴다.
import { MODULES } from "@/lib/modules";

export const SITE = "powerPlus";
export const SITE_URL = "https://powerplus.hom2box.com";
export const SITE_DESC = "SI 실무자의 올인원 — 제안서 에셋(powerAssets)·장표 변환(powerDeck)·홈페이지 목업(powerMock)·디자인 규칙 안내서(powerGuide)를 한 곳에서.";
export const SITE_OG_IMAGE = `${SITE_URL}/img/home/hero-v2.webp`;

export const pageTitle = (screen: string, module?: string) => `${module ? `${screen} · ${module}` : screen} — ${SITE}`;

/** 경로로 제목을 만든다. notFound 면 404 제목 */
export function titleForPath(pathname: string, notFound = false): string {
  if (notFound) return `페이지를 찾을 수 없음 — ${SITE}`;
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length === 0) return `${SITE} — SI 실무자의 올인원`;
  const mod = MODULES.find((m) => m.to === `/${seg[0]}`);
  if (mod) {
    const item = mod.menu.find((i) => i.slug === (seg[1] ?? ""));
    if (seg[0] === "guide" && seg[1] === "components" && seg[2]) return pageTitle(decodeURIComponent(seg[2]), mod.name);
    return pageTitle(item?.label ?? "시작하기", mod.name);
  }
  switch (seg[0]) {
    case "signup": return pageTitle("회원가입");
    case "notice": return pageTitle("공지사항");
    case "changelog": return pageTitle("변경 이력");
    case "removal": return pageTitle("삭제 요청");
    case "account": return pageTitle(seg[1] === "settings" ? "설정" : "마이페이지");
    case "admin": return `관리자 — ${SITE}`;
    default: return SITE;
  }
}

/** 화면별 설명(meta description·og:description) — root 기본 설명(SITE_DESC)과 겹치지 않게 화면마다 다르게(품질 판정 SEO-002, 2026-10-10).
 *  자기 description 을 내는 화면(docs·powermcp)은 null → root 가 비운다. */
export function descForPath(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length === 0) return "자료만 올리면 제안서 장표·홈페이지 목업·디자인 규칙·에셋까지 이어서 만드는 SI 작업대입니다.";
  const mod = MODULES.find((m) => m.to === `/${seg[0]}`);
  if (mod) {
    if (seg[0] === "guide" && seg[1] === "components" && seg[2]) return `${decodeURIComponent(seg[2])} 부품의 미리보기·React·Vue 코드·사용법·KRDS 지침.`;
    const item = mod.menu.find((i) => i.slug === (seg[1] ?? ""));
    if (!item || item.slug === "") return `${mod.name} — ${mod.sub}. ${mod.desc}`;
    return `${mod.name} ${item.label} — ${item.desc}`;
  }
  switch (seg[0]) {
    case "docs": case "powermcp": return null;
    case "community": return "공지사항·질문·작업 공유·레퍼런스 제보를 나누는 powerPlus 커뮤니티입니다.";
    case "help": return "에셋·장표·목업·가이드·계정 사용법을 분류별로 찾는 도움말 센터입니다.";
    case "about": return "powerPlus 가 하는 일과 4개 모듈, 운영 원칙을 소개합니다.";
    case "contact": return "서비스 이용·제휴·오류 문의를 남기면 운영팀이 메일로 답합니다.";
    case "removal": return "게시된 화면·자료의 삭제를 요청하고 접수번호로 처리 상태를 확인합니다.";
    case "legal": return "이용약관·개인정보처리방침 등 powerPlus 정책 문서와 버전별 이력입니다.";
    case "pricing": return "회원 전용 서비스의 이용 범위와 Pro·Team 요금제 안내입니다.";
    case "search": return "에셋·가이드 문서·커뮤니티 글·내 장표와 시안을 한 번에 찾습니다.";
    case "notice": case "changelog": return "powerPlus 공지사항과 서비스 변경 이력입니다.";
    case "login": case "signup": return "이메일 인증 또는 소셜 계정으로 powerPlus 에 로그인합니다.";
    default: return null;
  }
}

/** 공유 미리보기 제목 — 탭 제목과 같은 규칙. 고유 meta 제목이 있는 화면은 그 제목을 따로 두지 않는다(같은 값이라). */
export function ogTitleForPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean);
  const fixed: Record<string, string> = {
    community: "커뮤니티", help: "도움말 센터", about: "powerPlus 소개", contact: "문의", pricing: "요금제", search: "통합 검색", legal: "약관·정책", powermcp: "powerMCP", docs: "문서",
  };
  const f = seg[0] ? fixed[seg[0]] : undefined;
  if (f) return pageTitle(f);
  return titleForPath(pathname);
}
