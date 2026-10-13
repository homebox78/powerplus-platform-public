import * as React from "react";
import { Toggle } from "../../../react";

export const meta = { id: "toggle", title: "토글 버튼", group: "action", source: "shadcn", note: "누를 때마다 켜짐/꺼짐(aria-pressed) · 켜짐은 색+체크 표시 · 크기는 버튼과 같다" };

export default function Demo() {
  const [caption, setCaption] = React.useState(true);
  return (
    <div className="pv-row">
      <Toggle icon="like">관심 민원</Toggle>
      <Toggle variant="outline" pressed={caption} onPressedChange={setCaption}>자막 {caption ? "켜짐" : "꺼짐"}</Toggle>
      <Toggle variant="outline" size="small" defaultPressed>새 글 알림</Toggle>
      <Toggle variant="outline" size="large">큰 글씨</Toggle>
      <Toggle variant="outline" disabled>음성 안내</Toggle>
    </div>
  );
}
