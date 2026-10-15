// 사이트 품질 판정(verdicts.json) → 관리자 개선 체크리스트 3종에 보강 자료로 넣는다.
// 출처: db/scripts/migrate.mjs 의 DATABASE_URL 읽기 방식 + api/src/{Site,Deck,Mock}/Checklist.php 의 표 구조.
// 사용: node scripts/qc-import.mjs <verdicts.json> [--dry]
//   id 접두 DCK → deck_checklist, MCK → mock_checklist, 나머지 → site_checklist. slug = 'qc-' + id 소문자.
//   상태: 미흡 → open · 통과 → fixed · 확인불가 → watch · 해당없음 → wontfix.
//   멱등: 같은 slug 가 있으면 상태·detail·evidence 만 갱신하고 hits 는 늘리지 않는다. 고침 → 미흡이면 regressed=1(장표 되먹임에 실린다), 통과면 0(2026-10-15 점검 — 전에는 다시 걸림을 지웠다).
//   장표 엔진 되먹임(Checklist::lessons)은 hits>=2 또는 regressed=1 인 열린 항목만 싣는다 → 여기서 넣은 행(hits=1, regressed=0)은 실리지 않는다.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("사용: node scripts/qc-import.mjs <verdicts.json> [--dry]");
  process.exit(2);
}
if (!process.env.DATABASE_URL && existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 이 없습니다.");
  process.exit(2);
}
const url = new URL(process.env.DATABASE_URL);
const verdicts = JSON.parse(readFileSync(resolve(file), "utf8"));

const STATUS = { "미흡": "open", "통과": "fixed", "확인불가": "watch", "해당없음": "wontfix" };
const AT = "2026-10-10";

/** 장표 체크리스트 분야(Deck\Checklist::AREAS) — 번호대와 제목으로 */
function deckArea(id, title) {
  const n = Number(id.split("-")[1] || 0);
  if (n < 100) return /처리 시간|멈추지|엔진/.test(title) ? "engine" : "misc";
  if (n < 200) return /대본|1인칭|발표 원고/.test(title) ? "script" : "plan";
  if (/넘치|글자|자간|줄 간격|키메시지|말줄임|간격/.test(title)) return "type";
  if (/그림|로고|이미지|아이콘/.test(title)) return "assets";
  if (/파랑|빨강|색|톤/.test(title)) return "mockup";
  return "build";
}
/** 목업 체크리스트 분야(Mock\Checklist::AREAS) */
function mockArea(title) {
  if (/키|도구|enum|별칭|FORBIDDEN|게시|열람|포인트/.test(title)) return "mcp";
  if (/끌어|스냅|동작|iframe|늘어나/.test(title)) return "behavior";
  if (/넘치|높이|눌리/.test(title)) return "layout";
  return "content";
}
/** JSON 비교용 — DB 가 키 순서를 바꿔 돌려주므로 키를 정렬해 비교 */
const canon = (x) => JSON.stringify(x, (k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));
const SITE_AREAS = new Set(["gen", "nav", "home", "ast", "gde", "mcp", "com", "acc", "adm", "rsp", "a11y", "seo", "sec", "perf", "legal", "ops", "data"]);

function plan(v) {
  const prefix = v.id.split("-")[0].toUpperCase();
  const slug = "qc-" + v.id.toLowerCase();
  if (prefix === "DCK") return { table: "deck_checklist", slug, area: deckArea(v.id, v.title), origin: "report" };
  if (prefix === "MCK") return { table: "mock_checklist", slug, area: mockArea(v.title), origin: "test" };
  const a = prefix.toLowerCase();
  return { table: "site_checklist", slug, area: SITE_AREAS.has(a) ? a : "qc", origin: "audit" };
}

const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.slice(1), charset: "utf8mb4",
});

const tally = {};
const bump = (t, k) => { tally[t] ??= { created: 0, updated: 0, same: 0, open: 0, fixed: 0, watch: 0, wontfix: 0 }; tally[t][k]++; };

for (const v of verdicts) {
  const status = STATUS[v.verdict];
  if (!status) { console.warn("판정 값 모름:", v.id, v.verdict); continue; }
  const p = plan(v);
  const title = String(v.title ?? "").slice(0, 200);
  const detail = v.note ? String(v.note).slice(0, 4000) : null;
  const evidence = JSON.stringify([{ at: AT, by: "판정 " + (v.by ?? ""), verdict: v.verdict, note: v.note ?? "", target: v.target ?? "", how: v.how ?? "" }]);
  bump(p.table, status);
  const [[row]] = await db.query(`SELECT id, status, title, detail, evidence FROM ${p.table} WHERE slug = ?`, [p.slug]);
  if (!row) {
    if (!dry) {
      await db.query(
        `INSERT INTO ${p.table} (slug, area, title, detail, origin, status, hits, regressed, evidence, fixed_at) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ${status === "fixed" ? "NOW(3)" : "NULL"})`,
        [p.slug, p.area, title, detail, p.origin, status, evidence],
      );
    }
    bump(p.table, "created");
    continue;
  }
  const prevEv = typeof row.evidence === "string" ? row.evidence : JSON.stringify(row.evidence);
  if (row.status === status && row.title === title && (row.detail ?? null) === detail && canon(JSON.parse(prevEv ?? "null")) === canon(JSON.parse(evidence))) {
    bump(p.table, "same");
    continue;
  }
  if (!dry) {
    await db.query(
      `UPDATE ${p.table} SET title = ?, detail = ?, status = ?, evidence = ?, fixed_at = ${status === "fixed" ? "COALESCE(fixed_at, NOW(3))" : "NULL"},
        regressed = ${row.status === "fixed" && status === "open" ? 1 : status === "fixed" ? 0 : "regressed"} WHERE id = ?`,
      [title, detail, status, evidence, row.id],
    );
  }
  bump(p.table, "updated");
}

// 장표 되먹임 확인 — 가져온 행 중 엔진 규칙에 실릴 조건(열림·고치는 중, engine 아님, hits>=2 또는 regressed=1)에 걸리는 것
const [[fed]] = await db.query(
  "SELECT COUNT(*) AS n FROM deck_checklist WHERE slug LIKE 'qc-%' AND status IN ('open','fixing') AND area <> 'engine' AND (hits >= 2 OR regressed = 1)",
);
console.log(dry ? "[--dry] 쓰지 않음" : "적용함");
console.table(tally);
console.log(`장표 엔진 되먹임에 실리는 qc 행: ${fed.n}`);
await db.end();
