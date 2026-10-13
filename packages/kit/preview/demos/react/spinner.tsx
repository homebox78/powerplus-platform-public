import { Button, Spinner } from "../../../react";

export const meta = { id: "spinner", title: "스피너", group: "action", source: "krds", note: "role=status · 보이는 안내 글 · 줄 안에 놓는 인라인형" };

export default function Demo() {
  return (
    <>
      <Spinner>민원 처리 현황을 불러오는 중입니다</Spinner>
      <div className="pv-row">
        <Spinner inline label="저장 중" />
        <span>신청서를 저장하고 있습니다</span>
        <Button variant="tertiary" size="small" disabled>저장 중</Button>
      </div>
    </>
  );
}
