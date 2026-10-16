// 출처: homebox-handoff apps/web/app/components/hb/pricing.tsx — 연간/월간 세그먼트 · 플랜 카드(Pro 옅은 강조 면 · 나머지 흰 카드 테두리).
// 플랫폼 변경: 가격은 서버 core_plans(PlanRow) 가 원천, 하이라이트는 포인트 주황 하나(파랑 #D3E2FD 제거), Enterprise 카드 없음.
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthly, PLAN_FEATURES, won, yearlySave, type Billing, type PlanRow } from "@/lib/billing";
import { cn } from "@/lib/utils";

export function BillingToggle({ value, onChange, className }: { value: Billing; onChange: (b: Billing) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-chip bg-ground-3 p-1", className)} role="radiogroup" aria-label="결제 주기">
      {([["year", "연간"], ["month", "월간"]] as const).map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("h-9 rounded-chip px-4 text-sm font-semibold transition-colors", value === v ? "bg-white text-ink shadow-sm dark:bg-ground-4" : "text-ink-4 hover:text-ink")}>{l}</button>
      ))}
    </div>
  );
}

export function SaveNote({ plan, className }: { plan?: PlanRow; className?: string }) {
  const save = yearlySave(plan);
  if (!save) return null;
  return <p className={cn("text-sm text-ink-3", className)}><b className="font-bold text-point-ink">{save}% 할인</b> · 연간 결제 시</p>;
}

function CheckDot({ point }: { point?: boolean }) {
  return <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", point ? "bg-point/15 text-point-ink" : "bg-ground-4")}><Check className="size-3" strokeWidth={3} aria-hidden /></span>;
}

/** 플랜 카드 하나. Pro 만 옅은 주황 면 + 인기 배지(강조는 여기 한 곳). */
export function PlanCard({ plan, billing, cta, onSelect, disabled, current }: { plan: PlanRow; billing: Billing; cta: string; onSelect: () => void; disabled?: boolean; current?: boolean }) {
  const def = PLAN_FEATURES[plan.code as "pro" | "team"];
  const filled = plan.code === "pro";
  return (
    <div className={cn("flex min-w-0 flex-col rounded-banner p-7", filled ? "bg-point-soft ring-1 ring-point/25" : "border border-line bg-white dark:bg-ground")}>
      <div className="flex items-center gap-2">
        <h3 className="text-2xl font-bold tracking-[-0.02em]">{plan.name}</h3>
        {filled && <span className="rounded-chip bg-point px-2 py-0.5 text-xs font-semibold text-white">인기</span>}
        {current && <span className="rounded-chip bg-ink px-2 py-0.5 text-xs font-semibold text-white">이용 중</span>}
      </div>
      <p className="mt-1 text-sm text-ink-3">{def?.desc}</p>
      <div className="mt-5 flex min-h-[64px] items-center gap-3">
        <span className="text-5xl font-extrabold tracking-[-0.03em]">{won(monthly(plan, billing))}</span>
        <span className="text-xs leading-[1.35] text-ink-3">{plan.code === "team" ? "팀 · 월" : "월"}<br />{billing === "year" ? "연간 결제" : "월간 결제"}</span>
      </div>
      {billing === "year" && <p className="-mt-1 text-xs text-ink-4">연 {won(plan.price_year_month * 12)} 한 번에 결제</p>}
      <Button size="lg" variant={filled ? "default" : "outline"} className="mt-5 w-full" onClick={onSelect} disabled={disabled}>{cta}</Button>
      <p className="mt-3 text-center text-xs text-ink-3">{def?.seatNote}</p>
      <span className="my-6 h-px bg-line" aria-hidden />
      <div className="flex flex-col gap-3">
        {def?.lead && <span className="text-md text-ink-3">{def.lead}</span>}
        {(def?.features ?? []).map((f) => <span key={f} className="flex items-center gap-2.5 text-md"><CheckDot point={filled} />{f}</span>)}
      </div>
    </div>
  );
}
