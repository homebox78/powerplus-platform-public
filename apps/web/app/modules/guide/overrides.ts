// powerGuide 관리자 덮어쓰기 — 코드 원본(토큰·키트 빌드·KRDS 추출·체크리스트 판정) 위에 관리자가 고친 글·판정·숨김·순서를 합친다.
// 서버 api/src/Guide/Overrides.php 와 같은 규칙(REST·MCP 도 같은 값을 본다). 저장은 /admin/guide 화면(PUT /admin/guide/overrides/{section}).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/auth";

export type GuideCopy = {
  module?: { sub?: string; desc?: string; free?: string };
  menu?: Record<string, { label?: string; desc?: string }>;
  steps?: { title?: string; desc?: string }[];
  intro?: Partial<Record<"tokens" | "components" | "krds" | "a11y" | "changelog", string>>;
};
export type CompOv = { title?: string; summary?: string; note?: string; notes?: string[]; hidden?: boolean; order?: number };
export type KrdsOv = { usage?: string[]; a11y?: string[]; interaction?: string[]; dev?: string[]; note?: string; desc?: string; hidden?: boolean };
export type CheckOv = { verdict?: string; evidence?: string; fix?: string; hidden?: boolean };
export type GuideOverrides = {
  copy: GuideCopy;
  components: Record<string, CompOv>;
  krds: Record<string, KrdsOv>;
  patterns: Record<string, KrdsOv>;
  checklist: Record<string, CheckOv>;
  tokens: Record<string, { description?: string }>;
  downloads: Record<string, { label?: string; use?: string; hidden?: boolean }>;
};
export type GuideSection = keyof GuideOverrides;

const EMPTY_OVERRIDES: GuideOverrides = { copy: {}, components: {}, krds: {}, patterns: {}, checklist: {}, tokens: {}, downloads: {} };

// PHP 빈 배열은 [] 로 온다 — 열쇠 맵으로 맞춘다
const obj = <T,>(v: unknown): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : ({} as T));
async function fetchGuideOverrides(): Promise<GuideOverrides> {
  type Raw = Partial<Record<GuideSection, unknown>>;
  const d = await apiFetch<Raw>("/guide/overrides").catch((): Raw => ({}));
  const o: Raw = d ?? {};
  return {
    copy: obj(o.copy), components: obj(o.components), krds: obj(o.krds), patterns: obj(o.patterns),
    checklist: obj(o.checklist), tokens: obj(o.tokens), downloads: obj(o.downloads),
  };
}

const GUIDE_OVERRIDES_KEY = ["guide-overrides"] as const;
/** 읽기 실패·로딩 중에도 원본이 보이게 빈 덮어쓰기를 준다.
 *  /guide/overrides 는 회원 전용 경로 — 비회원(공개 랜딩)은 부르지 않고 원본 글을 쓴다(401 콘솔 오류 방지, 2026-10-17 점검). */
export function useGuideOverrides(): GuideOverrides {
  const { canView } = useMe();
  const q = useQuery({ queryKey: GUIDE_OVERRIDES_KEY, queryFn: fetchGuideOverrides, staleTime: 60_000, enabled: canView });
  return q.data ?? EMPTY_OVERRIDES;
}

export async function saveGuideOverride<S extends GuideSection>(section: S, data: GuideOverrides[S]): Promise<GuideOverrides[S]> {
  const r = await apiFetch<{ data: GuideOverrides[S] }>(`/admin/guide/overrides/${section}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  return (r?.data ?? data) as GuideOverrides[S];
}
export function useInvalidateGuide() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: GUIDE_OVERRIDES_KEY });
}

// ── 합치기 ─────────────────────────────────────────
type Meta = { id: string; title: string; note?: string };
/** 부품 목록 — 숨김 빼고, 이름·메모 바꾸고, 순서(order) 있으면 그 순서 */
export function applyMetas<M extends Meta>(metas: M[], ov: Record<string, CompOv>): M[] {
  return metas
    .map((m, i) => ({ m, o: ov[m.id] ?? {}, i }))
    .filter(({ o }) => !o.hidden)
    .map(({ m, o, i }) => ({ m: { ...m, ...(o.title ? { title: o.title } : {}), ...(o.note ? { note: o.note } : {}) }, k: o.order ?? 1000 + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.m);
}
/** KRDS 컴포넌트·패턴(열쇠 = 한글 이름) */
export function applyItems<I extends { ko: string }>(items: I[], ov: Record<string, KrdsOv>): (I & { note?: string })[] {
  return items.filter((it) => !ov[it.ko]?.hidden).map((it) => {
    const { hidden: _h, ...o } = ov[it.ko] ?? {};
    return { ...it, ...o } as I & { note?: string };
  });
}
/** 체크리스트(열쇠 = idx) — 판정을 바꾸면 요약도 다시 센다 */
export function applyChecklist<R extends { idx: number; verdict: string; evidence: string | null; fix?: string | null }>(rows: R[], ov: Record<string, CheckOv>): { rows: R[]; summary: Record<string, number> } {
  const out: R[] = [];
  const summary: Record<string, number> = {};
  for (const r of rows) {
    const o = ov[String(r.idx)] ?? {};
    if (o.hidden) continue;
    const x = { ...r, ...(o.verdict ? { verdict: o.verdict } : {}), ...(o.evidence ? { evidence: o.evidence } : {}), ...(o.fix ? { fix: o.fix } : {}) };
    summary[x.verdict] = (summary[x.verdict] ?? 0) + 1;
    out.push(x);
  }
  return { rows: out, summary };
}
