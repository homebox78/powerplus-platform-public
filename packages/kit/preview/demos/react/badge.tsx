import { Badge } from "../../../react";

export const meta = { id: "badge", title: "배지", group: "action", source: "both", note: "테두리형 · 채움형 · 옅은 채움형 · 크기 · 숫자 배지(999+) · 점 배지" };

const colors = ["primary", "secondary", "gray", "point", "danger", "warning", "success", "information", "disabled"] as const;
const names: Record<(typeof colors)[number], string> = {
  primary: "접수중", secondary: "안내", gray: "일반", point: "추천", danger: "마감", warning: "임박", success: "완료", information: "공지", disabled: "종료",
};

export default function Demo() {
  return (
    <>
      <div className="pv-row">{colors.map((c) => <Badge key={c} variant="outline" color={c}>{names[c]}</Badge>)}</div>
      <div className="pv-row">{colors.map((c) => <Badge key={c} variant="solid" color={c}>{names[c]}</Badge>)}</div>
      <div className="pv-row">{colors.map((c) => <Badge key={c} variant="light" color={c}>{names[c]}</Badge>)}</div>
      <div className="pv-row">
        <Badge size="large" variant="outline">접수중</Badge>
        <Badge size="large" variant="solid" color="danger">마감</Badge>
        <Badge count={5} label="새 알림" />
        <Badge count={1200} label="새 민원 답변" color="point" />
        <span>새 글 <Badge dot color="point" label="있음" /></span>
      </div>
    </>
  );
}
