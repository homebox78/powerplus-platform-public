import { HoverCard, HoverCardTrigger, HoverCardContent } from "../../../react";

export const meta = {
  id: "hover-card",
  title: "호버 카드",
  group: "overlay",
  source: "shadcn",
  note: "링크에 마우스를 올리거나 키보드로 포커스하면 미리보기 카드가 뜬다. 카드 내용은 보조 정보 — 같은 내용이 링크한 페이지에도 있어야 한다.",
};

export default function Demo() {
  return (
    <div>
      여권 민원은{" "}
      <HoverCard>
        <HoverCardTrigger href="#hover-card" className="krds-btn medium link pure">
          <span className="underline">한빛시 민원여권과</span>
        </HoverCardTrigger>
        <HoverCardContent align="start">
          <p className="hb-popover-title">민원여권과</p>
          <p>여권 발급·재발급, 주민등록 등·초본, 인감증명 발급을 맡습니다.</p>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", marginTop: 12 }}>
            <dt>위치</dt>
            <dd>한빛시청 본관 1층</dd>
            <dt>운영</dt>
            <dd>평일 09:00~18:00, 목요일 20:00까지</dd>
            <dt>전화</dt>
            <dd>내선 2345</dd>
          </dl>
        </HoverCardContent>
      </HoverCard>
      에서 처리합니다.
    </div>
  );
}
