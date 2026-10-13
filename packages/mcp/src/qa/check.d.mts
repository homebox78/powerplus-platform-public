// 출처: homebox-handoff packages/mcp/src/qa/check.d.mts 에서 가져옴 (powerMCP 이식 2026-10-06)
// check.mjs 타입 선언 — MCP(index.ts)에서 가져다 쓴다.
export type CheckResult = {
  pass: boolean; score: number; hard_fails: string[]; summary: string;
  height: { reference: number; mockup: number; diff_pct: number; scope: string };
  rows: Array<Record<string, unknown>>; similarity: number | null;
  behavior: unknown; images: { total: number; broken: string[]; foreign: string[] };
  fixes: string[];
};
export type CheckCompare = { slices: Array<{ from: number; to: number; jpeg: Buffer }>; scaleRef: number; totalH: number } | null;
export function checkMockup(o: { html: string; ref: unknown; refImage: Buffer | null; launch: () => Promise<unknown>; sharp: unknown; width?: number; peers?: unknown[]; want?: string }): Promise<{ result: CheckResult; compare: CheckCompare; thumb: Buffer | null }>;
