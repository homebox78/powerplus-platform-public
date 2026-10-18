// wire.mjs 타입 선언 — 와이어 일치 판정(2026-10-18)
import type { JudgeWire } from "./check.d.mts";
export type WireMeasure = { rows: Array<{ no: number; x: number; y: number; w: number; h: number; cells: Array<{ k: string; x: number; y: number; w: number; h: number; sig?: Record<string, number> }> }>; marks?: number };
export type WireMatchResult = { score: number; pass: boolean; expected: number; found: number; order_ok: boolean; rows: Array<Record<string, unknown>>; fixes: string[]; hard: string[] };
export const KIND_PROBE: Record<string, string[]>;
export function measureWire(p: unknown): Promise<WireMeasure>;
export function probeOk(k: string, s: Record<string, number> | undefined): boolean;
export function wireMatch(meas: WireMeasure, wire: JudgeWire, opt?: { mobile?: boolean; tol?: number }): WireMatchResult;
export function wireRefRows(meas: WireMeasure, wire: JudgeWire): Array<Record<string, unknown>>;
