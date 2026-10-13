// 목업 샘플 행(asset_items, 'hb:' 키)의 빈 w·h·alt·text_safe 를 옛 홈박스 목록(services/mockref-api/data/sample-images.json)으로 채운다.
// 파워플러스 행에 합쳐진 1,730장은 w·h 가 0 이었다 — 레퍼런스 엔진이 비율로 고르는(로고 가로형·팝업 2:1) 데 필요하다. 멱등.
//   node db/migrate-legacy/mock-sample-dims.mjs [--dry]
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const DRY = process.argv.includes("--dry");
const items = JSON.parse(readFileSync(resolve(root, "services/mockref-api/data/sample-images.json"), "utf8")).items;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });
let n = 0, miss = 0;
for (const a of items) {
  const k = `hb:${a.id}`;
  const [[row]] = await db.query("SELECT id, w, h, alt, text_safe FROM asset_items WHERE legacy_key = ? OR legacy_alt_key = ? LIMIT 1", [k, k]);
  if (!row) { miss++; continue; }
  if (row.w > 0 && row.h > 0 && row.alt && (row.text_safe || !a.text_safe)) continue;
  if (!DRY) await db.query("UPDATE asset_items SET w = IF(w > 0, w, ?), h = IF(h > 0, h, ?), alt = COALESCE(NULLIF(alt,''), ?), text_safe = COALESCE(text_safe, ?), has_text = IF(has_text, 1, ?) WHERE id = ?",
    [a.w, a.h, a.alt?.slice(0, 300) ?? null, a.text_safe ? JSON.stringify(a.text_safe) : null, a.has_text ? 1 : 0, row.id]);
  n++;
}
console.log(`${DRY ? "[DRY] " : ""}채움 ${n} · 행 없음 ${miss} / 목록 ${items.length}`);
await db.end();
