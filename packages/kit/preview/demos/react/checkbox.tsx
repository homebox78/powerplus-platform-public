import * as React from "react";
import { Checkbox, CheckboxGroup } from "../../../react";

export const meta = { id: "checkbox", title: "체크박스", group: "form", source: "both", note: "상태 4종, 부가 설명, 크기(medium·large), 전체 선택(일부 선택 indeterminate)." };

const ITEMS = ["주민등록등본", "가족관계증명서", "건강보험 자격득실 확인서"];

export default function Demo() {
  const [picked, setPicked] = React.useState<string[]>([ITEMS[0]]);
  const all = picked.length === ITEMS.length;
  const some = picked.length > 0 && !all;
  return (
    <>
      <CheckboxGroup aria-label="상태 예시">
        <Checkbox label="기본" />
        <Checkbox label="선택됨" defaultChecked />
        <Checkbox label="비활성화" disabled />
        <Checkbox label="선택된 비활성화" disabled defaultChecked />
      </CheckboxGroup>
      <CheckboxGroup aria-label="약관 동의" column>
        <Checkbox label="[필수] 개인정보 수집·이용 동의" description="신청 처리와 결과 안내를 위해 이름·연락처를 수집합니다." defaultChecked />
        <Checkbox label="[선택] 한빛시 소식지 받기" description="매월 첫째 주 행사·교육 소식을 문자로 보내 드립니다." />
      </CheckboxGroup>
      <CheckboxGroup aria-label="크기 예시">
        <Checkbox size="medium" label="크기 medium" />
        <Checkbox size="large" label="크기 large" defaultChecked />
      </CheckboxGroup>
      <CheckboxGroup aria-label="제출 서류" column>
        <Checkbox
          data-pv="all"
          label="서류 전체 선택"
          checked={all}
          indeterminate={some}
          onCheckedChange={(c) => setPicked(c ? ITEMS : [])}
        />
        {ITEMS.map((it) => (
          <Checkbox
            key={it}
            label={it}
            checked={picked.includes(it)}
            onCheckedChange={(c) => setPicked((p) => (c ? [...p, it] : p.filter((x) => x !== it)))}
          />
        ))}
      </CheckboxGroup>
    </>
  );
}
