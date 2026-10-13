import * as React from "react";
import { Button, CoachMark } from "../../../react";

export const meta = {
  id: "coach-mark",
  title: "코치 마크",
  group: "overlay",
  source: "krds",
  note: "처음 쓰는 사람에게 화면 영역을 한 단계씩 짚어 준다. 단계가 바뀌면 말풍선으로 포커스가 옮겨 간다.",
};

const STEPS = [
  { title: "1단계 : 주소 검색", desc: "이사 전 주소를 도로명이나 지번으로 검색해 고르세요." },
  { title: "2단계 : 세대원 선택", desc: "함께 이사하는 세대원을 모두 고르세요." },
  { title: "3단계 : 신청서 제출", desc: "입력한 내용을 확인하고 제출하면 처리 결과를 문자로 알려 드립니다." },
];

export default function Demo() {
  const [step, setStep] = React.useState(1);
  const box = (i: number, children: React.ReactNode) => (
    <CoachMark
      active={step === i + 1}
      step={i + 1}
      total={STEPS.length}
      title={STEPS[i].title}
      description={STEPS[i].desc}
      onNext={() => setStep(i + 2)}
      onPrev={() => setStep(i)}
      onStop={() => setStep(0)}
      className="hb-coach-target"
    >
      {children}
    </CoachMark>
  );
  return (
    <>
      <div className="hb-coach-stage">
        {box(0, <><h3>이사 전 주소</h3><p>경기도 한빛시 한빛로 123, 101동 1004호</p></>)}
        {box(1, <><h3>함께 이사하는 세대원</h3><p>홍길동(본인), 김영희(배우자), 홍하늘(자녀)</p></>)}
        {box(2, <><h3>신청서 제출</h3><p>전입 예정일 2026. 10. 15. · 접수처 한빛시 한빛동 행정복지센터</p></>)}
      </div>
      <div className="pv-row pv-mt">
        <Button variant="tertiary" size="small" onClick={() => setStep(1)} disabled={step !== 0}>
          안내 다시 보기
        </Button>
        <span className="pv-note" aria-live="polite">{step === 0 ? "안내를 마쳤습니다." : `${step} / ${STEPS.length} 단계 안내 중`}</span>
      </div>
    </>
  );
}
