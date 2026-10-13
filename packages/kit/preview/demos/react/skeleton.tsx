import { Skeleton } from "../../../react";

export const meta = { id: "skeleton", title: "스켈레톤", group: "action", source: "shadcn", note: "불러오는 동안 자리 표시 · 움직임 줄이기 설정이면 반짝임 멈춤" };

export default function Demo() {
  return (
    <div aria-busy="true" style={{ display: "flex", gap: 16, alignItems: "flex-start", maxWidth: 520 }}>
      <span className="sr-only">공지사항을 불러오는 중입니다</span>
      <Skeleton shape="circle" style={{ width: 56, height: 56, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <Skeleton style={{ width: "50%", height: 20, marginBottom: 12 }} />
        <Skeleton shape="text" lines={3} />
      </div>
    </div>
  );
}
