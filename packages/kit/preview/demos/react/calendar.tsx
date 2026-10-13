import * as React from "react";
import { Calendar, type CalendarRange } from "../../../react";

export const meta = {
  id: "calendar",
  title: "달력",
  group: "data",
  source: "both",
  note: "하루 고르기 · 기간 고르기. 날짜 칸은 방향키로 옮기고(Home/End 주 처음·끝, PageUp/PageDown 달) Enter 로 고른다. 예시: 월요일 휴관(선택 불가).",
};

const closedMonday = (d: Date) => d.getDay() === 1;

export default function Demo() {
  const [day, setDay] = React.useState<Date>(new Date(2026, 8, 25));
  const [range, setRange] = React.useState<CalendarRange>({ from: new Date(2026, 8, 7), to: new Date(2026, 8, 16) });
  return (
    <div className="pv-row" style={{ alignItems: "flex-start", gap: 32 }}>
      <div>
        <p className="pv-note" style={{ margin: "0 0 8px" }}>
          시립도서관 방문일 — {day.getMonth() + 1}월 {day.getDate()}일
        </p>
        <Calendar selected={day} onSelect={setDay} disabled={closedMonday} aria-label="방문일 달력" />
      </div>
      <div>
        <p className="pv-note" style={{ margin: "0 0 8px" }}>
          축제 기간 — {range.from ? `${range.from.getMonth() + 1}.${range.from.getDate()}` : "?"} ~{" "}
          {range.to ? `${range.to.getMonth() + 1}.${range.to.getDate()}` : "?"}
        </p>
        <Calendar mode="range" selected={range} onSelect={setRange} aria-label="축제 기간 달력" />
      </div>
    </div>
  );
}
