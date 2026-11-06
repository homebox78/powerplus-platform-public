// 기관이 직접 낸 공식 로고(사용자가 건넨 PNG) → powerAssets 로고 등록. 멱등(legacy_key = 'official:<id>').
//   node register-official-logos.mjs <spec.json> <storage.dir> [--dry]
//   spec.json = { "group": "logo-promo", "items": [ { "id": "kaist-h", "src": "D:/…/9.png", "name": "한국과학기술원 가로", "ko": [...], "en": [...] } ] }
// 파일은 가공하지 않는다(가로 2500 넘으면 비율 유지로 줄이기만). 같은 그림(sha256)이 이미 있으면 건너뛴다.
// 옛 로고(이름이 같은 것)는 덮어쓰지 않고 판(가로·세로·흰색)마다 새 행으로 더한다.
import { readFileSync, existsSync, mkdirSync, statSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomInt, createHash } from "node:crypto";

const [SPEC, STORE] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
const DIR = "logos-official";
const MAXW = 2500;
const norm = (t) => String(t).normalize("NFC").trim().toLowerCase().slice(0, 64);
const spec = JSON.parse(readFileSync(SPEC, "utf8"));
const sharp = (await import("sharp")).default;
process.loadEnvFile(resolve(import.meta.dirname, "../../.env"));
const mysql = (await import("mysql2/promise")).default;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const out = resolve(STORE, "assets", DIR);
mkdirSync(out, { recursive: true });

let created = 0, updated = 0, dup = 0, shrunk = 0;
for (const a of spec.items) {
  if (!existsSync(a.src)) throw new Error(`파일 없음: ${a.src}`);
  const files = { original: [`${DIR}/${a.id}.png`, "image/png"], thumb: [`${DIR}/${a.id}.thumb.webp`, "image/webp"] };
  const abs = (p) => resolve(STORE, "assets", p);
  let m = await sharp(a.src).metadata();
  if (!DRY) {
    if (m.width > MAXW) { await sharp(a.src).resize({ width: MAXW }).png().toFile(abs(files.original[0])); shrunk++; }
    else copyFileSync(a.src, abs(files.original[0]));
    m = await sharp(abs(files.original[0])).metadata();
    await sharp(abs(files.original[0])).resize(360, 360, { fit: "inside" }).webp({ quality: 88, alphaQuality: 100 }).toFile(abs(files.thumb[0]));
  }
  const legacy = `official:${a.id}`;
  const [[ex]] = await db.query("SELECT id FROM asset_items WHERE legacy_key = ?", [legacy]);
  if (DRY) { console.log(`${ex ? "갱신" : "신규"} ${a.name} ${m.width}x${m.height}${m.width > MAXW ? ` → 가로 ${MAXW}` : ""}`); continue; }
  const sha = createHash("sha256").update(readFileSync(abs(files.original[0]))).digest("hex");
  const [[same]] = await db.query("SELECT id FROM asset_items WHERE sha256 = ? AND deleted_at IS NULL AND (legacy_key IS NULL OR legacy_key <> ?)", [sha, legacy]);
  if (same) { dup++; continue; }
  const alt = `${a.name} 로고`;
  let id;
  if (ex) {
    id = ex.id;
    await db.query("UPDATE asset_items SET name=?, alt=?, w=?, h=?, style_group=?, sha256=?, deleted_at=NULL WHERE id=?", [a.name, alt, m.width, m.height, spec.group, sha, id]);
    updated++;
  } else {
    const [r] = await db.query("INSERT INTO asset_items (public_id, visibility, category, name, alt, w, h, has_text, style_group, source, sha256, legacy_key, ai_generated) VALUES (?, 'public', 'logo', ?, ?, ?, ?, 0, ?, 'official', ?, ?, 0)",
      [pid(), a.name, alt, m.width, m.height, spec.group, sha, legacy]);
    id = r.insertId; created++;
  }
  for (const [kind, [p, mime]] of Object.entries(files)) {
    const fsha = createHash("sha256").update(readFileSync(abs(p))).digest("hex");
    const [[f]] = await db.query("SELECT id FROM core_files WHERE bucket='assets' AND path=?", [p]);
    let fid = f?.id;
    if (fid) await db.query("UPDATE core_files SET bytes=?, sha256=?, deleted_at=NULL WHERE id=?", [statSync(abs(p)).size, fsha, fid]);
    else { const [r] = await db.query("INSERT INTO core_files (public_id, bucket, path, mime, bytes, sha256, visibility) VALUES (?,?,?,?,?,?, 'public')", [pid(), "assets", p, mime, statSync(abs(p)).size, fsha]); fid = r.insertId; }
    await db.query("INSERT INTO asset_files (item_id, kind, file_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE file_id = VALUES(file_id)", [id, kind, fid]);
  }
  const rows = [...new Set(a.ko.map(norm))].map((t) => [t, "ko", "kw"]).concat([...new Set(a.en.map(norm))].map((t) => [t, "en", "kw"]));
  await db.query("DELETE FROM asset_tags WHERE item_id = ?", [id]);
  await db.query("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES " + rows.map(() => "(?,?,?,?)").join(","), rows.flatMap((x) => [id, ...x]));
}
console.log(`${DRY ? "[DRY] " : ""}공식 로고: 신규 ${created} · 갱신 ${updated} · 같은 그림 건너뜀 ${dup} · 가로 ${MAXW} 로 줄임 ${shrunk} / ${spec.items.length}`);
await db.end();
