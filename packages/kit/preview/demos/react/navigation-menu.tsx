import { NavigationMenu, type NavigationMenuEntry } from "../../../react";

export const meta = {
  id: "navigation-menu",
  title: "주 메뉴(PC)",
  group: "nav",
  source: "both",
  note: "KRDS 「메인 메뉴: 데스크탑」 메가 메뉴. 두 번째는 「민원」이 열린 상태로 시작. Esc·바깥 누르기로 닫히고, 1뎁스끼리 ←/→, ↓ 로 판 안으로 들어간다.",
};

const GNB_ITEMS: NavigationMenuEntry[] = [
  {
    label: "민원",
    groups: [
      {
        label: "민원 신청",
        titleHref: "#",
        links: [
          { label: "여권 발급", href: "#", current: true },
          { label: "전입 신고", href: "#" },
          { label: "주민등록증 재발급", href: "#" },
          { label: "인감 증명", href: "#" },
          { label: "가족관계 등록", href: "#" },
        ],
        banner: { badge: "신규 서비스", label: "모바일 신분증 발급", href: "#" },
      },
      {
        label: "증명서 발급",
        links: [
          { label: "주민등록등본", href: "#" },
          { label: "지방세 납세증명서", href: "#" },
          { label: "토지이용계획확인서", href: "#" },
        ],
        banner: { badge: "안내", label: "무인 발급기 위치", href: "#" },
        bannerPosition: "right",
      },
      {
        label: "온라인 서비스",
        links: [
          { label: "전자 민원 창구", href: "#", description: "누리집에서 민원을 신청하고 처리 결과를 확인합니다." },
          { label: "정부24", href: "#", external: true, description: "중앙부처 민원을 한곳에서 신청합니다." },
        ],
      },
      { label: "민원 서식", href: "#" },
      { label: "국민신문고", href: "#", external: true },
    ],
  },
  {
    label: "분야별 정보",
    title: "분야별 정보",
    links: [
      { label: "복지", href: "#" },
      { label: "교통", href: "#" },
      { label: "문화·관광", href: "#" },
      { label: "환경", href: "#" },
      { label: "경제·일자리", href: "#" },
      { label: "교육", href: "#" },
      { label: "보건", href: "#" },
      { label: "안전", href: "#" },
      { label: "도시·주택", href: "#" },
    ],
    banner: { badge: "신규 서비스", label: "우리 동네 지도", href: "#" },
  },
  {
    label: "시정 소식",
    groups: [
      { label: "공지사항", links: [{ label: "공지사항", href: "#" }, { label: "고시·공고", href: "#" }, { label: "입법 예고", href: "#" }] },
      { label: "보도자료", links: [{ label: "보도자료", href: "#" }, { label: "해명 자료", href: "#" }] },
    ],
  },
  { label: "열린 시장실", href: "#" },
];

export default function Demo() {
  return (
    <>
      <NavigationMenu items={GNB_ITEMS} />
      <div className="pv-mt" style={{ minHeight: 520 }}>
        <NavigationMenu items={GNB_ITEMS} defaultValue="민원" aria-label="주 메뉴(열린 상태 예시)" />
      </div>
    </>
  );
}
