import { Progress } from "../../../react";

export const meta = { id: "progress", title: "진행 막대", group: "action", source: "shadcn", note: "값 표시 · 크기 · 색 · 값을 모를 때(진행 중)" };

export default function Demo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 480 }}>
      <Progress value={3} max={5} label="신청서 작성 (3/5단계)" showValue />
      <Progress value={100} label="서류 제출 완료" showValue color="success" size="small" />
      <Progress value={25} label="저장 공간 사용량" showValue color="danger" size="large" />
      <Progress label="첨부파일 올리는 중" />
    </div>
  );
}
