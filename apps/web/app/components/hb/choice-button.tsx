// 출처: homebox-handoff apps/web/app/components/hb/choice-button.tsx (2026-10-06 그대로 이식 — 플랫폼 디자인 베이스 = 홈박스)
import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// 선택 버튼 + 모달 (사용자 지시 2026-09-24): 칩을 줄줄이 늘어놓지 않는다(줄바꿈되며 화면마다 모양이 달라짐).
// 버튼 하나에 "라벨 · 현재 값"을 보여 주고, 누르면 모달에서 고른다 — PC·모바일이 같은 동선.
// 단일 선택(value: string) / 다중 선택(multiple, value: string[]) 둘 다.
// 톤 = 필터 팔레트와 같은 다크(#2A2A2C) — 작은 선택·옵션 모달은 다크, 흰 모달은 요금제·상담 폼처럼 크고 긴 것만 (사용자 지시 2026-09-24).
interface Choice { id: string; label: string; count?: number | null; hint?: string }

interface Base { label: string; options: Choice[]; allLabel?: string; /** false = "전체" 칸을 두지 않는다(종류처럼 항상 하나가 골라진 선택) */ showAll?: boolean; description?: string; className?: string; size?: "sm" | "md" }
type Props = Base & ({ multiple?: false; value: string; onChange: (v: string) => void } | { multiple: true; value: string[]; onChange: (v: string[]) => void });

export function ChoiceButton(props: Props) {
  const { label, options, allLabel = "전체", showAll = true, description, className, size = "md" } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = props.multiple ? props.value : props.value ? [props.value] : [];
  const current = selected.length === 0 ? allLabel : selected.length === 1 ? (options.find((o) => o.id === selected[0])?.label ?? selected[0]) : `${selected.length}개 선택`;
  // 모달 크기는 항목 수에 맞춘다(사용자 2026-10-07 "가로로 너무 넓다" → "한 줄에 2개, 글자·줄 간격 작게"): 2열 기본, 17개 이상은 넓은 화면 3열. 8개 이하는 검색 없음
  const n = options.length + (props.multiple || !showAll ? 0 : 1);
  const layout = n <= 8 ? "s" : n <= 16 ? "m" : "l";
  const shown = useMemo(() => { const k = q.trim(); return k ? options.filter((o) => o.label.includes(k)) : options; }, [q, options]);

  const pick = (id: string) => {
    if (props.multiple) { props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]); return; }
    props.onChange(id); setOpen(false); setQ("");
  };
  const clear = () => { if (props.multiple) props.onChange([]); else { props.onChange(""); setOpen(false); } };

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={() => setOpen(true)} className={cn("max-w-full gap-1.5 focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2", selected.length > 0 && "border-ink", className)} aria-haspopup="dialog">
        <span className="text-ink-4">{label}</span>
        <span className="truncate font-semibold">{current}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
        <DialogContent showCloseButton={false} className={`flex max-h-[80vh] w-[calc(100vw-32px)] flex-col gap-0 overflow-hidden rounded-panel border-0 bg-[#2A2A2C] p-0 text-white shadow-[0_24px_80px_rgba(0,0,0,.45)] outline-none ring-0 ${layout === "l" ? "sm:max-w-[520px] lg:max-w-[760px]" : "sm:max-w-[480px]"}`}>
          {layout === "s" ? (
            <div className="flex items-center gap-3 border-b border-white/10 py-3 pr-3 pl-6">
              <span className="flex-1 text-sm font-bold">{label}</span>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label="닫기"><X className="size-[18px]" /></button>
            </div>
          ) : (
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3.5">
            <Search className="size-[18px] shrink-0 text-white/50" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${label} 검색`} aria-label={`${label} 검색`} className="min-w-0 flex-1 bg-transparent text-md text-white outline-none placeholder:text-white/40" />
            <button type="button" onClick={() => setOpen(false)} className="inline-flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label="닫기"><X className="size-[18px]" /></button>
          </div>
          )}
          <div className={cn("hb-dark-scroll min-h-0 flex-1 overflow-y-auto", layout === "s" ? "p-2" : "p-4")}>
            <DialogTitle className={layout === "s" ? "sr-only" : "px-3 pb-2 text-sm font-medium text-white/50"}>{label}</DialogTitle>
            <DialogDescription className={description ? "px-3 pb-3 text-sm text-white/50" : "sr-only"}>{description ?? `${label}을 고르세요`}</DialogDescription>
            <ul className={cn("grid grid-cols-2 gap-x-1 gap-y-0.5", layout === "l" && "lg:grid-cols-3")}>
              {!props.multiple && showAll && !q && (
                <li><Item on={selected.length === 0} label={allLabel} onClick={clear} /></li>
              )}
              {shown.map((o) => <li key={o.id}><Item on={selected.includes(o.id)} label={o.label} count={o.count} hint={o.hint} onClick={() => pick(o.id)} check={props.multiple} /></li>)}
              {shown.length === 0 && <li className="col-span-full px-3 py-6 text-center text-md text-white/50">맞는 항목이 없습니다.</li>}
            </ul>
          </div>
          {props.multiple && (
            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3.5">
              <Button variant="ghost" size="sm" onClick={clear} disabled={selected.length === 0} className="text-white/70 hover:bg-white/10 hover:text-white"><X aria-hidden />선택 해제</Button>
              <Button size="sm" onClick={() => setOpen(false)} className="bg-white text-ink hover:bg-white/90">{selected.length ? `${selected.length}개 적용` : "닫기"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Item({ on, label, count, hint, onClick, check }: { on: boolean; label: string; count?: number | null; hint?: string; onClick: () => void; check?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm font-semibold text-white transition-colors", on ? "bg-white/15" : "hover:bg-white/10")}>
      {check && <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-white bg-white text-ink" : "border-white/30")}>{on && <Check className="size-3.5" aria-hidden />}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate font-medium", count === 0 && !on && "text-white/45")}>{label}</span>
        {hint && <span className="truncate text-xs font-normal text-white/50">{hint}</span>}
      </span>
      {count != null && <span className={cn("shrink-0 text-xs font-normal tabular-nums", count === 0 ? "text-white/30" : "text-white/50")}>{count.toLocaleString()}</span>}
      {!check && on && <Check className="size-4 shrink-0" aria-hidden />}
    </button>
  );
}
