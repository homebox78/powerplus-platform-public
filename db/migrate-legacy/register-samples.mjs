// 새 목업 샘플 묶음(manifest.json + webp) → powerAssets 등록. 멱등(legacy_key = 'smp:<name>').
//   node db/migrate-legacy/register-samples.mjs <storage.dir> <폴더(버킷 assets 아래 경로)> [--dry]
//   예) node db/migrate-legacy/register-samples.mjs /var/www/platform_data samples-c20
// manifest.items[] = { name, kind, group, w, h, has_text, category, visibility, alt, use[], kw[], text_safe }
// 태그 축: kind · use · target(묶음) · kw. MockSamples::all() 이 'kind' 축이 있는 행을 목업 샘플로 읽는다(사용자 2026-10-11).
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, createHash } from "node:crypto";
import mysql from "mysql2/promise";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const [STORE, DIR] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
if (!STORE || !DIR) { console.error("사용: register-samples.mjs <storage.dir> <폴더>"); process.exit(1); }
const base = resolve(STORE, "assets", DIR);
const man = JSON.parse(readFileSync(resolve(base, "manifest.json"), "utf8")).items;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const norm = (t) => String(t).normalize("NFC").trim().toLowerCase().slice(0, 64);

let created = 0, updated = 0, tags = 0;
for (const a of man) {
  const key = `smp:${a.name}`;
  const files = { original: `${DIR}/${a.name}.webp`, thumb: `${DIR}/${a.name}.thumb.webp` };
  for (const p of Object.values(files)) if (!existsSync(resolve(STORE, "assets", p))) throw new Error(`파일 없음: ${p}`);
  if (DRY) { created++; continue; }
  const [[ex]] = await db.query("SELECT id FROM asset_items WHERE legacy_key = ?", [key]);
  const ts = a.text_safe ? JSON.stringify(a.text_safe) : null;
  let id;
  if (ex) {
    id = ex.id;
    await db.query("UPDATE asset_items SET category=?, visibility=?, alt=?, w=?, h=?, has_text=?, text_safe=?, deleted_at=NULL WHERE id=?", [a.category, a.visibility, a.alt.slice(0, 300), a.w, a.h, a.has_text ? 1 : 0, ts, id]);
    updated++;
  } else {
    const [r] = await db.query("INSERT INTO asset_items (public_id, visibility, category, name, alt, w, h, has_text, text_safe, source, legacy_key, ai_generated) VALUES (?,?,?,?,?,?,?,?,?,'own',?,1)",
      [pid(), a.visibility, a.category, a.name, a.alt.slice(0, 300), a.w, a.h, a.has_text ? 1 : 0, ts, key]);
    id = r.insertId; created++;
  }
  for (const [kind, p] of Object.entries(files)) {
    const abs = resolve(STORE, "assets", p);
    const sha = createHash("sha256").update(readFileSync(abs)).digest("hex");
    const [[f]] = await db.query("SELECT id FROM core_files WHERE bucket='assets' AND path=?", [p]);
    let fid = f?.id;
    if (fid) await db.query("UPDATE core_files SET bytes=?, sha256=? WHERE id=?", [statSync(abs).size, sha, fid]);
    else {
      const [r] = await db.query("INSERT INTO core_files (public_id, bucket, path, mime, bytes, sha256, visibility) VALUES (?,?,?,?,?,?,?)", [pid(), "assets", p, "image/webp", statSync(abs).size, sha, a.visibility]);
      fid = r.insertId;
    }
    await db.query("INSERT INTO asset_files (item_id, kind, file_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE file_id = VALUES(file_id)", [id, kind, fid]);
  }
  const rows = [[a.kind, "kind"], ...a.use.map((x) => [x, "use"]), [a.group, "target"], ...a.kw.map((x) => [x, "kw"])].map(([t, ax]) => [norm(t), ax]);
  await db.query("DELETE FROM asset_tags WHERE item_id = ? AND axis IN ('kind','use','target')", [id]);
  const [r] = await db.query("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES " + rows.map(() => "(?,?,'ko',?)").join(","), rows.flatMap(([t, ax]) => [id, t, ax]));
  tags += r.affectedRows;
}
console.log(`${DRY ? "[DRY] " : ""}${DIR}: 신규 ${created} · 갱신 ${updated} · 태그 ${tags} / ${man.length}`);
await db.end();
