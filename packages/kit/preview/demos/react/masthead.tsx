import { Masthead } from "../../../react";

export const meta = { id: "masthead", title: "공식 배너", group: "gov", source: "krds", note: "누리집 맨 위에 두는 '대한민국 공식 전자정부 누리집' 표시. 아래는 펼친 상태." };

export default function Demo() {
  return (
    <>
      <Masthead />
      <Masthead className="pv-mt" collapsible defaultOpen />
    </>
  );
}
