import * as React from "react";
import { MobileMenu, type MobileMenuSection } from "../../../react";

export const meta = {
  id: "mobile-menu",
  title: "전체 메뉴(모바일)",
  group: "nav",
  source: "krds",
  note: "KRDS 는 1024px 이상 화면에서 이 메뉴를 숨긴다 — 여기서는 inline 으로 문서 안에 펼쳐 두었다. 실제로는 open/onOpenChange 로 여닫는 대화상자다.",
};

const ITEMS: MobileMenuSection[] = [
  {
    label: "민원",
    children: [
      { label: "여권 발급", href: "#", current: true },
      { label: "전입 신고", href: "#" },
      {
        label: "증명서 발급",
        children: [
          { label: "주민등록등본", href: "#" },
          { label: "가족관계증명서", href: "#" },
          { label: "지방세 납세증명서", href: "#" },
        ],
      },
      { label: "민원 서식", href: "#" },
    ],
  },
  { label: "분야별 정보", children: [{ label: "복지", href: "#" }, { label: "교통", href: "#" }, { label: "문화·관광", href: "#" }, { label: "환경", href: "#" }] },
  { label: "시정 소식", children: [{ label: "공지사항", href: "#" }, { label: "보도자료", href: "#" }, { label: "고시·공고", href: "#" }] },
  { label: "열린 시장실", children: [{ label: "시장 소개", href: "#" }, { label: "시정 방침", href: "#" }, { label: "시장에게 바란다", href: "#" }] },
  { label: "한빛시 소개", children: [{ label: "연혁", href: "#" }, { label: "상징물", href: "#" }, { label: "찾아오시는 길", href: "#" }] },
];

export default function Demo() {
  const [found, setFound] = React.useState("");
  return (
    <div style={{ maxWidth: 400 }}>
      <MobileMenu
        inline
        items={ITEMS}
        utilities={[{ label: "누리집 안내", href: "#" }, { label: "English", href: "#" }]}
        loginLabel="로그인을 해 주세요"
        services={[{ label: "민원 신청", href: "#", icon: "file" }, { label: "공지사항", href: "#", icon: "email" }, { label: "행사 달력", href: "#", icon: "calendar" }, { label: "민원 상담", href: "#", icon: "call" }]}
        onSearch={(q) => setFound(q ? `「${q}」 메뉴를 찾습니다` : "")}
        bottomLinks={[{ label: "누리집 이용 안내", href: "#" }, { label: "정부24", href: "#", external: true }]}
      />
      {found && <p role="status" style={{ marginTop: 8 }}>{found}</p>}
    </div>
  );
}
