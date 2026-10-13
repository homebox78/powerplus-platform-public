// 정책 문서 버전(core_policy_versions) — 공개 판 받기, 관리자 판 쓰기, 본문 ↔ 편집용 글 변환.
// 첫 판 1.0 은 화면 코드(docs-content.ts)에 있다. DB 에 1.0 이 없으면 그것을 1.0 으로 끼워 셀렉터를 만든다.
import type { DocBlock, DocSpec } from "@/components/hb/doc-page";
import { apiFetch, apiList, postJson } from "@/lib/api";
import { BOT, COPYRIGHT, EMAIL, PRIVACY, TERMS } from "@/lib/docs-content";

export const POLICY_DOCS = [
  { id: "terms", label: "이용약관", base: TERMS },
  { id: "privacy", label: "개인정보처리방침", base: PRIVACY },
  { id: "copyright", label: "저작권 정책", base: COPYRIGHT },
  { id: "email", label: "이메일 무단수집 거부", base: EMAIL },
  { id: "bot", label: "수집 로봇 안내", base: BOT },
] as const;
export type PolicyDocId = (typeof POLICY_DOCS)[number]["id"];

export type PolicySpec = Omit<DocSpec, "updated">;
export interface PolicyVersion {
  id: string; doc: PolicyDocId; version: string; effective_on: string; summary: string;
  published: boolean; updated_at?: string; spec: PolicySpec;
}
/** 화면에서 쓰는 판 — 코드의 첫 판은 id "base". */
export interface ShownVersion extends PolicyVersion { status: "current" | "past" | "upcoming" }

export const BASE_VERSION = "1.0";
const toIso = (d: string) => d.replace(/\./g, "-");
export const fmtDate = (d: string) => d.replace(/-/g, ".");

const BASE_CACHE = new Map<PolicyDocId, PolicyVersion>();
export function baseVersion(doc: PolicyDocId): PolicyVersion {
  const hit = BASE_CACHE.get(doc);
  if (hit) return hit;
  const b = POLICY_DOCS.find((d) => d.id === doc)!.base;
  const { updated, ...spec } = b;
  const v: PolicyVersion = { id: "base", doc, version: BASE_VERSION, effective_on: toIso(updated), summary: "첫 판", published: true, spec };
  BASE_CACHE.set(doc, v);
  return v;
}

const verNum = (v: string) => v.split(".").map((n) => Number(n) || 0);
const cmpVer = (a: string, b: string) => {
  const x = verNum(a); const y = verNum(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/** DB 판 + 코드의 1.0 → 최신순, 현재·지난·시행 예정 표시. */
export function mergeVersions(doc: PolicyDocId, rows: PolicyVersion[], today: string): ShownVersion[] {
  const all = rows.some((r) => r.version === BASE_VERSION) ? [...rows] : [...rows, baseVersion(doc)];
  all.sort((a, b) => (a.effective_on === b.effective_on ? cmpVer(b.version, a.version) : a.effective_on < b.effective_on ? 1 : -1));
  const cur = all.find((v) => v.effective_on <= today) ?? all[all.length - 1];
  return all.map((v) => ({ ...v, status: v === cur ? "current" : v.effective_on > today ? "upcoming" : "past" }));
}

export async function fetchPolicy(doc: PolicyDocId) {
  return apiFetch<{ doc: PolicyDocId; today: string; versions: PolicyVersion[] }>(`/policies/${doc}`);
}

export const fetchAdminPolicies = (doc?: string) => apiList<PolicyVersion>(`/admin/policies${doc ? `?doc=${doc}` : ""}`);
export type PolicyInput = { doc: PolicyDocId; version: string; effective_on: string; summary: string; spec: PolicySpec; published: boolean };
export const createPolicy = (b: PolicyInput) => postJson<PolicyVersion>("/admin/policies", b);
export const patchPolicy = (id: string, b: Partial<PolicyInput>) => postJson<PolicyVersion>(`/admin/policies/${id}`, b, "PATCH");
export const deletePolicy = (id: string) => apiFetch<null>(`/admin/policies/${id}`, { method: "DELETE" });

/** 다음 버전 제안 — 1.0 → 1.1, 1.9 → 1.10. */
export function nextVersion(versions: { version: string }[]): string {
  const top = [...versions].sort((a, b) => cmpVer(b.version, a.version))[0]?.version ?? BASE_VERSION;
  const p = verNum(top);
  if (p.length < 2) p.push(0);
  p[p.length - 1] = (p[p.length - 1] ?? 0) + 1;
  return p.join(".");
}

/*
 * 편집용 글 형식(관리자가 고치기 쉽게):
 *   ## 제1조 목적 {#purpose}      ← 항목 제목(중괄호는 목차 주소, 생략하면 자동)
 *   문단 한 줄                     ← 빈 줄로 나누지 않아도 줄마다 한 문단
 *   - 목록 한 줄
 *   | 머리 | 머리 |                ← 표: 첫 줄이 머리. 가운데 정렬 표는 첫 줄을 |= 로 시작
 *   | 칸 | 칸 |
 */
export function blocksToText(blocks: DocBlock[]): string {
  return blocks.map((b) => {
    const lines = [`## ${b.title} {#${b.id}}`];
    for (const p of b.paras ?? []) lines.push(p);
    for (const it of b.items ?? []) lines.push(`- ${it}`);
    if (b.table) {
      lines.push(`${b.table.center ? "|=" : "|"} ${b.table.head.join(" | ")} |`);
      for (const r of b.table.rows) lines.push(`| ${r.join(" | ")} |`);
    }
    return lines.join("\n");
  }).join("\n\n");
}

export function textToBlocks(text: string): DocBlock[] {
  const out: DocBlock[] = [];
  let cur: DocBlock | null = null;
  const cells = (l: string) => l.replace(/^\|=?/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    const h = l.match(/^##\s+(.+?)(?:\s*\{#([a-z0-9-]+)\})?$/i);
    if (h) { cur = { id: h[2] ?? "", title: (h[1] ?? "").trim() }; out.push(cur); continue; }
    if (!cur) { cur = { id: "", title: "머리말" }; out.push(cur); }
    if (l.startsWith("|")) {
      if (!cur.table) cur.table = { head: cells(l), rows: [], ...(l.startsWith("|=") ? { center: true } : {}) };
      else cur.table.rows.push(cells(l));
    } else if (/^[-*]\s+/.test(l)) (cur.items ??= []).push(l.replace(/^[-*]\s+/, ""));
    else (cur.paras ??= []).push(l);
  }
  return out;
}
