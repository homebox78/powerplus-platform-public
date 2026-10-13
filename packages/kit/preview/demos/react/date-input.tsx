import * as React from "react";
import { Field, FieldLabel, FieldControl, FieldDescription, DateInput, DateRangeInput } from "../../../react";

export const meta = { id: "date-input", title: "날짜 입력", group: "form", source: "krds", note: "숫자만 입력해도 YYYY.MM.DD 로 바뀝니다. 형식 안내가 칸 아래 붙고, 틀린 날짜는 오류 문구가 뜹니다. precision 으로 연·월만 받을 수 있습니다." };

export default function Demo() {
  const [d, setD] = React.useState("2026-10-09");
  const [from, setFrom] = React.useState("2026-09-01");
  const [to, setTo] = React.useState("2026-08-31");
  return (
    <div className="fieldset" style={{ maxWidth: 560 }}>
      <Field>
        <FieldLabel>방문 예약일</FieldLabel>
        <FieldControl className="calendar-conts"><DateInput size="medium" value={d} onValueChange={setD} /></FieldControl>
        <FieldDescription>{d ? `선택한 날짜: ${d}` : "날짜를 입력하세요."}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>생년월일</FieldLabel>
        <FieldControl className="calendar-conts"><DateInput size="medium" defaultValue="" /></FieldControl>
      </Field>
      <Field>
        <FieldLabel>입사 연월 (대략)</FieldLabel>
        <FieldControl className="calendar-conts"><DateInput size="medium" precision="month" defaultValue="2021-03" /></FieldControl>
      </Field>
      <div className="form-group" role="group" aria-labelledby="di-range">
        <p className="form-tit" id="di-range">조회 기간</p>
        <DateRangeInput size="medium" start={from} end={to} onStartChange={setFrom} onEndChange={setTo} />
      </div>
    </div>
  );
}
