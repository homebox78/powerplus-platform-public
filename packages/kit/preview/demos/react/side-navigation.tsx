import { SideNavigation, type SideNavigationItem } from "../../../react";

export const meta = {
  id: "side-navigation",
  title: "사이드 메뉴",
  group: "nav",
  source: "krds",
  note: "현재 페이지(여권 발급)를 품은 묶음은 처음부터 펼쳐진다. 「증명서 발급」은 4뎁스 판이 메뉴 위로 덮인다(제목 버튼·Esc 로 닫기).",
};

const ITEMS: SideNavigationItem[] = [
  {
    label: "민원 신청",
    children: [
      { label: "여권 발급", href: "#", current: true },
      {
        label: "증명서 발급",
        children: [
          { label: "주민등록등본", href: "#" },
          { label: "가족관계증명서", href: "#" },
          { label: "지방세 납세증명서", href: "#" },
        ],
      },
      { label: "전입 신고", href: "#" },
    ],
  },
  {
    label: "민원 서식",
    children: [
      { label: "서식 내려받기", href: "#" },
      { label: "작성 예시", href: "#" },
    ],
  },
  { label: "자주 묻는 질문", href: "#" },
];

export default function Demo() {
  return (
    <div style={{ maxWidth: 300 }}>
      <SideNavigation title="민원 안내" items={ITEMS} />
    </div>
  );
}
