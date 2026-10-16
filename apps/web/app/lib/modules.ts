// 플랫폼 모듈 4종 — 기획 §2 목표 구조. 헤더·홈·푸터·하단 탭·모듈 하위 메뉴가 전부 이 목록을 읽는다.
// 하위 메뉴 = "작업 단위"(기획 §20 powerMock: 시작하기→기획→시안→컴포넌트 / §14 powerAssets 랜딩 / §4 powerGuide). 수집·내부 작업은 메뉴에 두지 않는다(§20).
import { Boxes, FileSliders, LayoutTemplate, BookOpenText, MessagesSquare, type LucideIcon } from "lucide-react";
import { DOWNLOAD_COUNT } from "@/modules/guide/downloads";

export interface ModuleMenu {
  /** 모듈 경로 뒤 조각. 빈 문자열 = 모듈 첫 화면(랜딩) */
  slug: string;
  label: string;
  /** 이 화면이 하는 일 한 줄 — 사용법 중심(기획 §20 "사이트 문구는 사용법 중심") */
  desc: string;
  /** 로그인 필요 */
  auth?: boolean;
}
export interface PlatformModule {
  id: "assets" | "deck" | "mock" | "guide";
  to: string;
  name: string;
  sub: string;
  desc: string;
  icon: LucideIcon;
  /** 기획 §13.2-1 요금제×모듈: free 로 볼 수 있는 범위 한 줄 */
  free: string;
  /** 모바일 하단 탭 짧은 이름 */
  short: string;
  menu: ModuleMenu[];
}

export const MODULES: PlatformModule[] = [
  {
    id: "assets", short: "에셋", to: "/assets", name: "powerAssets", sub: "제안서 에셋 라이브러리", icon: Boxes, free: "공개 에셋 검색·미리보기",
    desc: "아이콘·일러스트·사진·장표를 PowerPoint 에 바로 넣습니다. AI 로 만든 에셋은 따로 표시해 구분합니다.",
    menu: [
      { slug: "", label: "시작하기", desc: "에셋 둘러보기와 설치·사용 도움말." },
      { slug: "browse", label: "둘러보기", desc: "검색하거나 종류·스타일 세트·최신순으로 에셋을 훑어봅니다." },
      { slug: "requests", label: "자료 요청", desc: "없는 자료를 요청하면 등록 후 알려 드립니다.", auth: true },
    ],
  },
  {
    id: "deck", short: "장표", to: "/deck", name: "powerDeck", sub: "장표 변환", icon: FileSliders, free: "체험 3크레딧(워터마크)",
    desc: "자료만 올리면 기획부터 장표·대본까지 한 번에 만듭니다. 링크 하나로 팀이 함께 보고 의견을 달고 고칩니다.",
    menu: [
      { slug: "", label: "시작하기", desc: "어떤 파일을 올리면 무엇이 돌아오는지, 한 장 먼저 보기 흐름." },
      { slug: "convert", label: "변환", desc: "pptx 업로드 → 한 장 시안 확인 → 나머지 진행 → 내려받기.", auth: true },
      { slug: "jobs", label: "내 작업", desc: "진행 중·완료 작업. 링크로 팀과 공유하고 의견·편집 권한을 정합니다.", auth: true },
    ],
  },
  {
    id: "mock", short: "목업", to: "/mock", name: "powerMock", sub: "홈페이지 목업 제작 · MCP", icon: LayoutTemplate, free: "MCP 메타·체험 시안",
    desc: "관공서·대학·일반 홈페이지 어느 것이든 만듭니다. AI 도구에 연결해 기획부터 목업·코드까지 잇습니다.",
    menu: [
      { slug: "", label: "시작하기", desc: "파워목업으로 할 수 있는 일과 요청 예시." },
      { slug: "plan", label: "기획", desc: "와이어프레임을 짜고 판정합니다." },
      { slug: "mockups", label: "시안", desc: "목업 제작·판정·게시. 내 시안과 갤러리.", auth: true },
      { slug: "components", label: "컴포넌트", desc: "시안에서 뽑은 키트 부품과 React·Vue 코드 받기.", auth: true },
    ],
  },
  {
    id: "guide", short: "가이드", to: "/guide", name: "powerGuide", sub: "SI 디자인 규칙 안내서", icon: BookOpenText, free: "전부 무료",
    desc: "토큰·부품·KRDS 대응표·접근성 점검표를 가져다 씁니다. 코드와 디자인을 같은 규칙으로 맞춥니다.",
    menu: [
      { slug: "", label: "시작하기", desc: "이 안내서를 프로젝트에 적용하는 순서." },
      { slug: "tokens", label: "토큰", desc: `색·타이포·간격·형태. ${DOWNLOAD_COUNT}종 형식으로 내려받기.` },
      { slug: "components", label: "부품", desc: "React · CSS 두 판의 부품 카탈로그." },
      { slug: "krds", label: "KRDS 대응표", desc: "KRDS 컴포넌트·패턴과 우리 부품의 대응." },
      { slug: "a11y", label: "접근성", desc: "KWCAG 2.2 체크리스트와 자동 검사 결과." },
      { slug: "changelog", label: "변경 이력", desc: "규칙·부품이 바뀐 기록." },
    ],
  },
];

export const menuHref = (m: PlatformModule, item: ModuleMenu) => (item.slug ? `${m.to}/${item.slug}` : m.to);

/** 모듈이 아닌 상위 메뉴(사용자 2026-10-06 "기존 커뮤니티를 외부 메뉴로 — 공지사항·게시판·커뮤니티 용도"). 헤더·푸터·하단 탭이 MODULES 뒤에 붙여 쓴다. */
export const EXTRA_NAV: Array<{ to: string; name: string; short: string; icon: LucideIcon }> = [
  { to: "/community", name: "커뮤니티", short: "커뮤니티", icon: MessagesSquare },
];
