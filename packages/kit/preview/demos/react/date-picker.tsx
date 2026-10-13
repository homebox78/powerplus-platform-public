import * as React from "react";
import { DatePicker, DateRangePicker, type CalendarRange } from "../../../react";

export const meta = {
  id: "date-picker",
  title: "날짜 선택",
  group: "data",
  source: "both",
  note: "입력칸에 직접 쓰거나(2026.09.25 · 20260925) 달력 버튼으로 고른다. 달력에서는 [확인] 을 눌러야 들어간다.",
};

export default function Demo() {
  const [day, setDay] = React.useState<Date | null>(new Date(2026, 8, 25));
  const [range, setRange] = React.useState<CalendarRange | null>(null);
  return (
    <div className="pv-row" style={{ alignItems: "flex-start", gap: 32 }}>
      <DatePicker label="방문 희망일" value={day} onValueChange={setDay} disabled={(d) => d.getDay() === 0} />
      <DateRangePicker label="신청 기간" value={range} onValueChange={setRange} />
    </div>
  );
}
