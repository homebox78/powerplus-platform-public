// 관리자 화면 공용 조각 — 제목·검색·쪽 넘김·상세 항목. 부품은 hb·ui 의 것을 그대로 쓴다(홈박스 관리자 톤).
import { SegTabs } from "@/components/hb/seg-tabs";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Copy } from "@/components/hb/copy";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableHead } from "@/components/ui/table";
import { SearchInput } from "@/components/hb/search-input";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

export function AdminTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-[-0.03em]">{title}</h1>
      <Copy className="mt-2 text-md text-ink-3" text={desc} />
    </>
  );
}

/** 주소 쿼리를 상태로 — 필터·검색·쪽이 새로고침·뒤로가기에도 남는다 */
export function useQueryState() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (patch: Record<string, string>) => setParams((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    if (!("page" in patch)) n.delete("page");
    return n;
  }, { replace: true });
  return { get, set, page: Math.max(1, Number(params.get("page") ?? 1) || 1) };
}

/** 검색창(Enter 로 적용) — 높이 36(shadcn 기본) = ChoiceButton sm·Button sm 과 같은 줄(사용자 지시 2026-10-06 "관리자 컨트롤 한 단계 작게") */
export function SearchBox({ value, onSearch, placeholder, size = "sm" }: { value: string; onSearch: (v: string) => void; placeholder: string; size?: "sm" | "md" }) {
  const [v, setV] = useState(value);
  // 주소의 검색어가 바뀌면(뒤로가기·필터 초기화) 입력칸도 따라간다 — 렌더 중 이전 값 비교
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setV(value); }
  return (
    <form className="min-w-[220px] flex-1 sm:max-w-[360px]" onSubmit={(e) => { e.preventDefault(); onSearch(v.trim()); }} role="search">
      <SearchInput kbd={false} value={v} onChange={(e) => { setV(e.target.value); if (e.target.value === "" && value) onSearch(""); }} placeholder={placeholder} aria-label={placeholder} className={size === "sm" ? "h-9 w-full px-3.5 text-sm" : "w-full"} />
    </form>
  );
}

/** 쪽 넘김 — shadcn Pagination(사용자 지시: 공식 컴포넌트). 현재 쪽 주변 2쪽 + 처음·끝, 사이는 줄임표 */
export function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / limit));
  if (last <= 1) return null;
  const pages = new Set<number>([1, last, page - 1, page, page + 1, page - 2, page + 2].filter((p) => p >= 1 && p <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  return (
    <Pagination className="mt-4">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""} onClick={(e) => { e.preventDefault(); if (page > 1) onPage(page - 1); }}><ChevronLeft aria-hidden /><span className="hidden sm:inline">이전</span></PaginationPrevious>
        </PaginationItem>
        {sorted.map((p, i) => (
          <PaginationItem key={p}>
            {i > 0 && sorted[i - 1] !== p - 1 && <PaginationEllipsis className="inline-flex" />}
            <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); onPage(p); }} className="tabular-nums">{p}</PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext href="#" aria-disabled={page >= last} className={page >= last ? "pointer-events-none opacity-50" : ""} onClick={(e) => { e.preventDefault(); if (page < last) onPage(page + 1); }}><span className="hidden sm:inline">다음</span><ChevronRight aria-hidden /></PaginationNext>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

/** 상세 패널의 상태 고르기 — 세그먼트(높이 44, 같은 줄 버튼 md 와 같다). 선택지가 3~4개라 모달 대신 바로 보인다 */
export function StatusToggle<T extends string>({ value, onChange, labels }: { value: T; onChange: (v: T) => void; labels: Record<T, string> }) {
  return (
    <SegTabs label="상태" value={value} onChange={onChange} items={(Object.keys(labels) as T[]).map((k) => ({ value: k, label: labels[k] }))} />
  );
}

/** 상세 패널의 이름·값 한 줄 */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2 text-md">
      <dt className="text-ink-4">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

// ── shadcn preview 요소 모음(사용자 지시 2026-10-06)의 설정 토글 행·삭제 확인 AlertDialog — 관리자 화면 공용
/** 설정 토글 한 줄(라벨·설명 | Switch) */
export function RowSwitch({ id, label, desc, checked, onChange }: { id: string; label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0"><Label htmlFor={id} className="text-md">{label}</Label>{desc && <p className="mt-0.5 text-sm text-ink-4">{desc}</p>}</div>
      <Switch id={id} aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
/** 삭제 2단계 확인 — 되돌릴 수 없는 작업에만 */
export function ConfirmDelete({ open, onOpenChange, title, desc, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; desc: string; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{desc}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => { onConfirm(); onOpenChange(false); }}>삭제</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── 여러 개 고르기 공용(2026-10-07 사용자 "관리할 때는 한꺼번에 수정·삭제") ──────────────
 * 쓰는 법: const sel = useSelection(items.map(x => x.id), [필터 키…]);
 *   머리 칸 <SelectAllCell sel={sel} />, 행 칸 <SelectCell sel={sel} id={x.id} label="…" />,
 *   표 아래 <BulkBar sel={sel} total={전체 건수} actions={[…]} /> — 고르면 화면 아래에 붙는 막대가 뜬다.
 * 필터·쪽이 바뀌면 고른 것은 비운다(다른 쪽 항목을 모르고 지우는 일을 막는다). */
export type Selection = {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  allOn: boolean;
  someOn: boolean;
  togglePage: () => void;
  clear: () => void;
};
export function useSelection(pageIds: string[], resetKeys: unknown[] = []): Selection {
  const [ids, setIds] = useState<string[]>([]);
  const key = JSON.stringify(resetKeys);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) { setLastKey(key); setIds([]); }
  const allOn = pageIds.length > 0 && pageIds.every((id) => ids.includes(id));
  return {
    ids,
    has: (id) => ids.includes(id),
    toggle: (id) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    allOn,
    someOn: ids.length > 0 && !allOn,
    togglePage: () => setIds(allOn ? ids.filter((x) => !pageIds.includes(x)) : Array.from(new Set([...ids, ...pageIds]))),
    clear: () => setIds([]),
  };
}
/** 머리 칸 — 이 쪽 전부 고르기 */
export function SelectAllCell({ sel }: { sel: Selection }) {
  return (
    <TableHead className="w-[44px] min-w-[44px] px-0" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-center"><Checkbox aria-label="이 쪽 모두 고르기" checked={sel.allOn ? true : sel.someOn ? "indeterminate" : false} onCheckedChange={sel.togglePage} /></div>
    </TableHead>
  );
}
/** 행 칸 — 행을 눌러 여는 동작과 겹치지 않게 칸 안 클릭은 막는다 */
export function SelectCell({ sel, id, label }: { sel: Selection; id: string; label: string }) {
  return (
    <TableCell className="w-[44px] min-w-[44px] px-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex justify-center"><Checkbox aria-label={`${label} 고르기`} checked={sel.has(id)} onCheckedChange={() => sel.toggle(id)} /></div>
    </TableCell>
  );
}
export type BulkAction = {
  label: string;
  icon?: React.ReactNode;
  onRun: (ids: string[]) => void;
  /** 위험한 작업은 확인을 거친다 — 문구에 {n} 은 개수 */
  confirm?: string;
  danger?: boolean;
  disabled?: boolean;
};
/** 고르면 화면 아래에 붙는 막대 — 개수·선택 해제·작업 버튼 */
export function BulkBar({ sel, actions, children }: { sel: Selection; actions: BulkAction[]; children?: React.ReactNode }) {
  const [ask, setAsk] = useState<BulkAction | null>(null);
  if (sel.ids.length === 0) return null;
  const n = sel.ids.length;
  return (
    <>
      <div role="region" aria-label="고른 항목 작업" className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ground px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.12)]">
        <span className="text-sm font-bold tabular-nums">{n.toLocaleString()}개 고름</span>
        <Button size="sm" variant="ghost" onClick={sel.clear}>고르기 해제</Button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        {children}
        {actions.map((a) => (
          <Button key={a.label} size="sm" variant={a.danger ? "destructive" : "outline"} disabled={a.disabled}
            onClick={() => (a.confirm ? setAsk(a) : a.onRun(sel.ids))}>{a.icon}{a.label}</Button>
        ))}
      </div>
      <AlertDialog open={!!ask} onOpenChange={(v) => { if (!v) setAsk(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{ask?.label}</AlertDialogTitle><AlertDialogDescription>{ask?.confirm?.replace("{n}", n.toLocaleString())}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => { ask?.onRun(sel.ids); setAsk(null); }}>{ask?.label}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── 표 머리 정렬 ──────────────────────────────────────────────
 * 받은 목록(지금 화면의 행)을 그 자리에서 정렬한다. 같은 머리를 다시 누르면 오름↔내림, 세 번째는 원래 순서.
 * 쓰는 법: const s = useSort(items, { title: (x) => x.title, hits: (x) => x.hits });
 *         <SortHead s={s} k="hits">횟수</SortHead> … s.rows.map(…)
 */
type SortVal = string | number | boolean | null | undefined;
export type Sort<T> = { rows: T[]; key: string | null; dir: "asc" | "desc"; toggle: (k: string) => void };
export function useSort<T>(items: T[], get: Record<string, (x: T) => SortVal>): Sort<T> {
  const [key, setKey] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const fn = key ? get[key] : undefined;
  const rows = useMemo(() => {
    if (!fn) return items;
    const coll = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
    const out = items.map((x, i) => ({ x, i, v: fn(x) }));
    out.sort((a, b) => {
      const av = a.v, bv = b.v;
      const ae = av === null || av === undefined || av === "", be = bv === null || bv === undefined || bv === "";
      if (ae || be) return ae === be ? a.i - b.i : ae ? 1 : -1; // 빈 값은 늘 아래
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : typeof av === "boolean" && typeof bv === "boolean" ? Number(av) - Number(bv) : coll.compare(String(av), String(bv));
      return (dir === "asc" ? c : -c) || a.i - b.i;
    });
    return out.map((o) => o.x);
  }, [items, fn, dir]);
  const toggle = (k: string) => {
    if (key !== k) { setKey(k); setDir("asc"); }
    else if (dir === "asc") setDir("desc");
    else { setKey(null); setDir("asc"); }
  };
  return { rows, key, dir, toggle };
}
export function SortHead<T>({ s, k, children, className }: { s: Sort<T>; k: string; children: React.ReactNode; className?: string }) {
  const on = s.key === k;
  const Icon = !on ? ArrowUpDown : s.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={on ? (s.dir === "asc" ? "ascending" : "descending") : "none"} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => s.toggle(k)} className={`pp-hit inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1 py-0.5 hover:bg-ground-3 ${on ? "font-semibold text-ink" : ""}`}>
        {children}
        <Icon aria-hidden className={`size-3.5 shrink-0 ${on ? "text-ink" : "text-ink-4"}`} />
      </button>
    </TableHead>
  );
}
