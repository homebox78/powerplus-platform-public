// KRDS 체크리스트 결과표 — 항목(krds-checklist.json) + 코드 판정(judge-*.json) + 자동 검사(a11y-report.json) → checklist/REPORT.md·report.json
//   node scripts/build-report.mjs
// 판정 기준: scope=kit 은 키트가 지켜야 하는 항목(P 통과 · F 미흡 · ? 판단 불가), scope=site 는 키트를 쓰는 사이트가 지켜야 하는 항목.
// fixed.json 에 적힌 idx 는 판정 뒤 고친 항목 — 결과표에 "수정됨" 으로 올린다.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../checklist");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const items = read("krds-checklist.json").items.map((x, i) => ({ ...x, idx: x.idx ?? i + 1 }));
const judged = new Map();
for (const f of ["judge-a.json", "judge-b.json", "judge-c.json"]) for (const j of read(f)) judged.set(j.idx, j);
const fixed = fs.existsSync(path.join(dir, "fixed.json")) ? read("fixed.json") : {};
const a11y = read("a11y-report.json");

const SEC = { style: "스타일", component: "컴포넌트", pattern: "기본 패턴", service: "서비스 패턴" };
const rows = items.map((it) => {
  const j = judged.get(it.idx);
  let verdict = j ? (j.scope === "site" ? "사이트" : j.verdict ?? "?") : it.section === "service" ? "사이트" : "미판정";
  if (fixed[it.idx] && verdict === "F") verdict = "수정됨";
  if (fixed.intent?.[it.idx] && verdict === "F") verdict = "의도";
  return { idx: it.idx, section: it.section, component: it.component, text: it.text, verdict, evidence: j?.evidence ?? null, fix: fixed[it.idx] ?? fixed.intent?.[it.idx] ?? j?.fix ?? null };
});

const count = (rs) => rs.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] ?? 0) + 1), m), {});
const LABEL = { P: "통과", F: "미흡", 의도: "의도된 차이(원형 모드 통과)", "?": "판단 불가", 수정됨: "수정됨", 사이트: "사이트 담당", 미판정: "미판정" };
const fmt = (c) => Object.entries(c).map(([k, v]) => `${LABEL[k] ?? k} ${v}`).join(" · ");

let md = `# 홈박스 키트 — KRDS 자체 검증 결과\n\n`;
md += `원본: 디지털 정부 서비스 UI/UX 가이드라인 자체 검증 체크리스트(2024.11) ${items.length}항목.\n`;
md += `판정: 키트 코드를 항목마다 대조(근거 파일·줄 포함) + 자동 검사(axe-core WCAG 2.1 A·AA, 키보드 포커스 표시).\n\n`;
md += `## 요약\n\n| 구분 | 결과 |\n|---|---|\n`;
for (const s of Object.keys(SEC)) md += `| ${SEC[s]} | ${fmt(count(rows.filter((r) => r.section === s)))} |\n`;
md += `| **전체** | ${fmt(count(rows))} |\n\n`;
md += `## 자동 검사\n\n| 판 | 스타일 | 부품 | axe 위반 | 포커스 안 보임 |\n|---|---|---:|---:|---:|\n`;
for (const r of a11y.runs) md += `| ${r.fw === "react" ? "React" : "Vue"} | ${r.style === "powerguide" ? "powerGuide" : "KRDS 원형"} | ${r.demos.length} | ${r.demos.reduce((s, d) => s + d.axe.length, 0)} | ${r.demos.reduce((s, d) => s + d.keyboard.invisible.length, 0)} |\n`;
md += `\nKRDS 원형 스타일의 남은 위반은 KRDS 원본 CSS 그대로라 생기는 것이다(원형 모드는 원본을 바꾸지 않는다).\n\n`;
md += `## 미흡·판단 불가 항목\n\n| 번호 | 영역 | 항목 | 결과 | 고칠 방향 |\n|---:|---|---|---|---|\n`;
const esc = (s) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
for (const r of rows.filter((r) => ["F", "?", "수정됨", "의도"].includes(r.verdict))) md += `| ${r.idx} | ${esc(r.component)} | ${esc(r.text)} | ${LABEL[r.verdict]} | ${esc(r.fix)} |\n`;
fs.writeFileSync(path.join(dir, "REPORT.md"), md);
fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify({ at: new Date().toISOString(), summary: count(rows), rows }, null, 1));
console.log("전체", fmt(count(rows)));
