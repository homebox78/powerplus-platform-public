// MCP 시험 고리(시험 → 보고서 → 수정 → 재시험)의 결과를 관리자 개선 체크리스트 3종에 쌓는다.
// 출처: scripts/qc-import.mjs(접속·표 구조) + api/src/{Mock,Deck}/Checklist.php 의 record 규칙(재발 = hits+1, 고친 뒤 다시 걸리면 regressed).
// 사용: node scripts/mcp-loop-import.mjs <items.json> [--dry]
//   items.json = [{ table:"mock|deck|site", slug, area, title, detail?, status:"open|fixed|watch|wontfix", round:"r1", note?, fix_commit?, fix_note? }]
//   - 새 slug → 넣음(hits 1)
//   - 있는 slug + status open → hits+1, last_seen 갱신, 근거 추가. 그 전에 fixed 였으면 regressed=1 + 다시 open(같은 결함이 돌아온 것)
//   - status fixed → fixed 로 바꾸고 fix_commit·fix_note 기록(재시험에서 안 걸렸다는 근거 추가)
//   - 근거(evidence)는 최근 20개까지.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.error("사용: node scripts/mcp-loop-import.mjs <items.json> [--dry]"); process.exit(2); }
if (!process.env.DATABASE_URL && existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL 이 없습니다."); process.exit(2); }
const url = new URL(process.env.DATABASE_URL);
const items = JSON.parse(readFileSync(resolve(file), "utf8"));

const T = {
  mock: { table: "mock_checklist", origin: "test", areas: ["layout", "visual", "type", "behavior", "content", "data", "mcp", "preference", "mockup"], def: "mcp" },
  deck: { table: "deck_checklist", origin: "report", areas: ["plan", "wire", "mockup", "type", "assets", "build", "script", "engine", "misc"], def: "misc" },
  site: { table: "site_checklist", origin: "test", areas: null, def: "mcp" },
};
const today = new Date().toISOString().slice(0, 10);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.slice(1), charset: "utf8mb4",
});
const tally = {};
const bump = (t, k) => { tally[t] ??= { created: 0, again: 0, regressed: 0, fixed: 0, other: 0 }; tally[t][k]++; };

for (const it of items) {
  const c = T[it.table];
  if (!c || !it.slug || !it.title) { console.warn("건너뜀(형식):", JSON.stringify(it).slice(0, 120)); continue; }
  const slug = String(it.slug).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 160);
  const area = c.areas && !c.areas.includes(it.area) ? c.def : (it.area || c.def);
  const status = ["open", "fixed", "watch", "wontfix"].includes(it.status) ? it.status : "open";
  const ev = { at: today, by: "MCP 시험 " + (it.round ?? ""), status, note: String(it.note ?? it.detail ?? "").slice(0, 600) };
  const [[row]] = await db.query(`SELECT id, status, evidence FROM ${c.table} WHERE slug = ?`, [slug]);
  if (!row) {
    // 같은 차례에 찾고 고친 것도 남긴다 — 행이 있어야 다음 시험에서 다시 걸릴 때 regressed 로 잡힌다
    if (status === "fixed") {
      if (!dry) await db.query(
        `INSERT INTO ${c.table} (slug, area, title, detail, origin, status, hits, regressed, evidence, fixed_at, fix_commit, fix_note) VALUES (?, ?, ?, ?, ?, 'fixed', 1, 0, ?, NOW(3), ?, ?)`,
        [slug, area, String(it.title).slice(0, 200), it.detail ? String(it.detail).slice(0, 4000) : null, c.origin, JSON.stringify([ev]), it.fix_commit ?? null, it.fix_note ? String(it.fix_note).slice(0, 1000) : null],
      );
      bump(c.table, "fixed");
      continue;
    }
    if (!dry) await db.query(
      `INSERT INTO ${c.table} (slug, area, title, detail, origin, status, hits, regressed, evidence) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`,
      [slug, area, String(it.title).slice(0, 200), it.detail ? String(it.detail).slice(0, 4000) : null, c.origin, status, JSON.stringify([ev])],
    );
    bump(c.table, "created");
    continue;
  }
  let list = row.evidence ? (typeof row.evidence === "string" ? JSON.parse(row.evidence) : row.evidence) : [];
  if (!Array.isArray(list)) list = [];
  list = [...list, ev].slice(-20);
  if (status === "fixed") {
    if (!dry) await db.query(
      `UPDATE ${c.table} SET status='fixed', fixed_at=COALESCE(fixed_at, NOW(3)), fix_commit=COALESCE(?, fix_commit), fix_note=COALESCE(?, fix_note), evidence=? WHERE id=?`,
      [it.fix_commit ?? null, it.fix_note ? String(it.fix_note).slice(0, 1000) : null, JSON.stringify(list), row.id],
    );
    bump(c.table, "fixed");
  } else if (status === "open") {
    const regressed = row.status === "fixed";
    if (!dry) await db.query(
      `UPDATE ${c.table} SET status='open', hits=hits+1, last_seen=NOW(3), fixed_at=NULL, regressed=IF(?,1,regressed), evidence=? WHERE id=?`,
      [regressed ? 1 : 0, JSON.stringify(list), row.id],
    );
    bump(c.table, regressed ? "regressed" : "again");
  } else {
    if (!dry) await db.query(`UPDATE ${c.table} SET status=?, evidence=? WHERE id=?`, [status, JSON.stringify(list), row.id]);
    bump(c.table, "other");
  }
}
console.log(dry ? "[--dry] 쓰지 않음" : "적용함");
console.table(tally);
await db.end();
