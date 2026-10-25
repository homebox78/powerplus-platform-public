// 출처: homebox-handoff packages/mcp/src/qa/check.d.mts 에서 가져옴 (powerMCP 이식 2026-10-06)
// check.mjs 타입 선언 — MCP(index.ts)에서 가져다 쓴다.
/** 판정 기준 와이어(2026-10-18) — 줄마다 구역·칸(종류 k·12칸 폭 span). 주면 줄·칸 대조를 레퍼런스 대신 와이어로 한다 */
export type JudgeWire = { screen?: string; org?: string; lnb?: boolean; rows: Array<{ no?: number; zone?: string; cols: Array<{ k: string; span: number; h?: number }> }> };
export type WireMatch = { score: number; pass: boolean; expected_rows: number; found_rows: number; order_ok: boolean; rows: Array<Record<string, unknown>>; basis: string } | null;
export type CheckResult = {
  pass: boolean; score: number; hard_fails: string[]; summary: string;
  height: { reference: number; mockup: number; diff_pct: number; scope: string; kit_segments?: Record<string, { ref: number; mock: number } | null> };
  wire_match?: WireMatch;
  rows: Array<Record<string, unknown>>; similarity: number | null;
  behavior: unknown; images: { total: number; broken: string[]; foreign: string[] };
  fixes: string[];
};
export type CheckCompare = { slices: Array<{ from: number; to: number; jpeg: Buffer }>; scaleRef: number; totalH: number } | null;
export function checkMockup(o: { html: string; ref: unknown; refImage: Buffer | null; launch: () => Promise<unknown>; sharp: unknown; width?: number; peers?: unknown[]; want?: string; textKeys?: string[]; iconKeys?: string[]; wire?: JudgeWire | null }): Promise<{ result: CheckResult; compare: CheckCompare; thumb: Buffer | null }>;
/** 서버 종료 때 남은 판정을 끝내고 판정 브라우저를 닫는다(MC-125) */
export function closeJudgeBrowser(): Promise<void>;
