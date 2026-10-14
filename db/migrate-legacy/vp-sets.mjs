// 세로(A4) 제안서 전용 배경을 세트로 묶는다 — 사용자 2026-10-14 "세로제안서용 이미지는 따로 분리, 9:16 세로제안서 전용으로 올린 것들은 같이 묶어서",
// "실사·3D 따로 올렸는데 디자인 테마에 따라 다르게". 원래는 가로 장표용 세트(photo-hero-keyvisual·photo-section-keyvisual)에 섞여 있었다.
//   VP1-* (실사)  → vp-bg-photo   ·  VP2-*·VP3-* … (3D 렌더) → vp-bg-3d   — 세로 비율(h > w)만. 정사각은 원래 세트에 둔다.
// 등록 키(legacy_key = 'docphoto:VPn-…')로 고르므로 멱등 — 새 묶음을 등록한 뒤 다시 돌리면 된다.
//   node vp-sets.mjs [--dry]      (DATABASE_URL — register-photos.mjs 와 같은 방식)
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const DRY = process.argv.includes("--dry");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const mysql = (await import("mysql2/promise")).default;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

// 묶음 접두 → 세트. 3D 묶음이 더 오면 접두만 더한다
const GROUPS = [
  { set: "vp-bg-photo", style: "vp-bg-photo", cat: "photo", like: ["docphoto:VP1-%"], tag: "실사" },
  { set: "vp-bg-3d", style: "vp-bg-3d", cat: "photo", like: ["docphoto:VP2-%", "docphoto:VP3-%", "docphoto:VP4-%"], tag: "3D" },
];

const touched = new Set();
for (const g of GROUPS) {
  let [[s]] = await db.query("SELECT id FROM asset_sets WHERE name = ?", [g.set]);
  let sid = s?.id;
  if (!sid && !DRY) {
    const [r] = await db.query("INSERT INTO asset_sets (public_id, name, style, category) VALUES (?,?,?,?)", [pid(), g.set, g.style, g.cat]);
    sid = r.insertId;
  }
  const where = "(" + g.like.map(() => "legacy_key LIKE ?").join(" OR ") + ") AND h > w AND deleted_at IS NULL";
  const [rows] = await db.query(`SELECT id, set_id FROM asset_items WHERE ${where}`, g.like);
  const move = rows.filter((r) => r.set_id !== sid);
  console.log(`${g.set}: 대상 ${rows.length} · 옮길 것 ${move.length}`);
  if (DRY || !move.length) continue;
  for (const r of move) if (r.set_id) touched.add(r.set_id);
  touched.add(sid);
  const ids = move.map((r) => r.id);
  await db.query(`UPDATE asset_items SET set_id = ?, style_group = ? WHERE id IN (${ids.map(() => "?").join(",")})`, [sid, g.set, ...ids]);
  // 스타일 태그도 세트에 맞게(검색 결과의 묶음 이름) + 실사/3D 낱말
  await db.query(`DELETE FROM asset_tags WHERE axis = 'style' AND item_id IN (${ids.map(() => "?").join(",")})`, ids);
  await db.query("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES " + ids.map(() => "(?,?,?,?),(?,?,?,?)").join(","),
    ids.flatMap((id) => [id, g.style, "ko", "style", id, g.tag.toLowerCase(), "ko", "kw"]));
}
if (!DRY) for (const sid of touched) await db.query("UPDATE asset_sets SET item_count = (SELECT COUNT(*) FROM asset_items WHERE set_id = ? AND deleted_at IS NULL) WHERE id = ?", [sid, sid]);
const [cnt] = await db.query("SELECT s.name, s.item_count FROM asset_sets s WHERE s.name IN ('vp-bg-photo','vp-bg-3d','photo-hero-keyvisual','photo-section-keyvisual')");
console.log(DRY ? "[DRY]" : "완료", cnt.map((c) => `${c.name} ${c.item_count}`).join(" · "));
await db.end();
