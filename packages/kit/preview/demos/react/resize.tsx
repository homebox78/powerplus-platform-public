import * as React from "react";
import { Resize, type ResizeStep } from "../../../react";

export const meta = {
  id: "resize",
  title: "글자 크기 조절",
  group: "gov",
  source: "krds",
  note: "고른 단계만큼 대상 영역의 글자 크기 토큰을 키운다. 아래 예시는 회색 상자만 대상으로 했다.",
};

export default function Demo() {
  const [step, setStep] = React.useState<ResizeStep>("md");
  return (
    <div style={{ minHeight: 360 }}>
      <Resize target="#hb-resize-demo" value={step} onValueChange={(s) => setStep(s)} align="left" />
      <div id="hb-resize-demo" className="hb-resize-demo-box pv-mt" style={{ padding: 16, background: "var(--krds-light-color-surface-gray-subtler)", borderRadius: 8 }}>
        <p style={{ fontSize: "var(--krds-pc-font-size-heading-small)", fontWeight: 700 }}>2026년 하반기 주민자치 프로그램 수강생 모집</p>
        <p style={{ fontSize: "var(--krds-pc-font-size-body-medium)" }}>한빛시 주민자치센터에서 서예·요가·생활영어 강좌 수강생을 모집합니다. 신청은 9월 30일까지입니다.</p>
      </div>
    </div>
  );
}
