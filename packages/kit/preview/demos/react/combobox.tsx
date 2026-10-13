import * as React from "react";
import { Button, Combobox } from "../../../react";

export const meta = {
  id: "combobox",
  title: "검색 선택 상자",
  group: "overlay",
  source: "shadcn",
  note: "네이티브 select 대신 입력칸 + 목록 상자. 입력해서 거르고 ↓/↑·Enter 로 고른다(Alt+↓ 열기, Esc 닫기).",
};

const DEPTS = [
  { value: "civil", label: "민원여권과", keywords: ["여권", "민원"] },
  { value: "welfare", label: "복지정책과", keywords: ["복지", "기초연금"] },
  { value: "youth", label: "청년정책과", keywords: ["청년", "월세"] },
  { value: "traffic", label: "교통행정과", keywords: ["주차", "버스"] },
  { value: "clean", label: "자원순환과", keywords: ["폐기물", "재활용"] },
  { value: "tax", label: "세무과", keywords: ["지방세", "재산세"] },
  { value: "build", label: "건축과", keywords: ["건축", "인허가"], disabled: true },
];

export default function Demo() {
  const [dept, setDept] = React.useState("welfare");
  return (
    <>
      <div className="form-group" style={{ maxWidth: 480 }}>
        <div className="form-tit">
          <label htmlFor="pv-cb-dept">담당 부서</label>
        </div>
        {/* 같은 줄 입력칸·버튼은 높이를 맞춘다: 입력칸 medium(48) = 버튼 medium(48) */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Combobox id="pv-cb-dept" options={DEPTS} value={dept} onValueChange={setDept} placeholder="부서명이나 업무를 입력하세요" aria-describedby="pv-cb-hint" />
          <Button size="medium" style={{ flexShrink: 0 }}>문의하기</Button>
        </div>
        <p id="pv-cb-hint" className="form-hint">예: 여권, 주차, 재산세 (건축과는 개편 중이라 고를 수 없음)</p>
      </div>
      <p className="pv-note" aria-live="polite">고른 부서: {DEPTS.find((d) => d.value === dept)?.label}</p>
    </>
  );
}
