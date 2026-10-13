// 관리자 표의 일시 칸 — 날짜·시각이 각각 한 덩어리로 줄바꿈되게, 좁은 화면(768 미만)에서는 시각을 감춰 날짜가 한 줄에 들어가게 한다(종합평가 3-1-2).
import { fmtAt } from "@/lib/admin";

export function AtText({ at }: { at: string | null | undefined }) {
  const s = fmtAt(at);
  const [d, t] = s.split(" ");
  if (!t) return <span className="whitespace-nowrap">{s}</span>;
  return (
    <span title={s}>
      <span className="whitespace-nowrap">{d}</span>{" "}
      <span className="whitespace-nowrap max-md:hidden">{t}</span>
    </span>
  );
}
