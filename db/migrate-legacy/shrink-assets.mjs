// 자산 원본 가로 상한 — 가로 2500px 넘는 원본을 2500 으로 줄여 덮어쓰고 DB(w·h·sha256·bytes)를 맞춘다(2026-10-18 사용자 "원본파일의 가로넓이가 모두 2500 이하").
//   node shrink-assets.mjs <storage.dir> [--dry] [--backup=<폴더>] [--max=2500]
//   - 대상: asset_items(삭제 안 됨, w > max)의 original 파일. 썸네일은 그대로(360 이하).
//   - --backup 이 있으면 덮어쓰기 전에 <폴더>/<bucket>/<path> 로 복사(되돌릴 길). 이미 있으면 덮지 않는다.
//   - 파일이 없거나 실제 가로가 이미 max 이하면 DB 의 w·h 만 실제 값으로 고친다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const args = process.argv.slice(2);
const STORE = args.find((a) => !a.startsWith("--"));
const DRY = args.includes("--dry");
const BACKUP = args.find((a) => a.startsWith("--backup="))?.slice(9);
const MAX = Number(args.find((a) => a.startsWith("--max="))?.slice(6) ?? 2500);
if (!STORE) { console.error("사용: shrink-assets.mjs <storage.dir> [--dry] [--backup=<폴더>]"); process.exit(1); }
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const sharp = (await import("sharp")).default;
sharp.cache(false);
const mysql = (await import("mysql2/promise")).default;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });

const [rows] = await db.query(
  `SELECT i.id, i.w, i.h, f.id AS fid, f.bucket, f.path FROM asset_items i
   JOIN asset_files af ON af.item_id = i.id AND af.kind = 'original' JOIN core_files f ON f.id = af.file_id
   WHERE i.deleted_at IS NULL AND i.w > ? ORDER BY i.id`, [MAX]);
let shrunk = 0, fixed = 0, missing = 0, before = 0, after = 0;
const sha = (b) => createHash("sha256").update(b).digest("hex");
for (const r of rows) {
  const abs = resolve(STORE, r.bucket, r.path);
  if (!existsSync(abs)) { missing++; console.log(`파일 없음: #${r.id} ${r.bucket}/${r.path}`); continue; }
  const m = await sharp(abs).metadata();
  if (m.width <= MAX) {
    if (!DRY) await db.query("UPDATE asset_items SET w=?, h=? WHERE id=?", [m.width, m.height, r.id]);
    fixed++; continue;
  }
  const size0 = statSync(abs).size;
  before += size0;
  if (DRY) { shrunk++; continue; }
  if (BACKUP) {
    const bk = resolve(BACKUP, r.bucket, r.path);
    if (!existsSync(bk)) { mkdirSync(dirname(bk), { recursive: true }); copyFileSync(abs, bk); }
  }
  const ext = extname(abs).toLowerCase();
  const img = sharp(abs).resize({ width: MAX });
  const buf = ext === ".png" ? await img.png({ compressionLevel: 9 }).toBuffer()
    : ext === ".webp" ? await img.webp({ quality: 90 }).toBuffer()
    : await img.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const nm = await sharp(buf).metadata();
  writeFileSync(abs, buf);
  after += buf.length;
  const h = sha(buf);
  await db.query("UPDATE asset_items SET w=?, h=?, sha256=? WHERE id=?", [nm.width, nm.height, h, r.id]);
  await db.query("UPDATE core_files SET bytes=?, sha256=? WHERE id=?", [buf.length, h, r.fid]);
  shrunk++;
}
console.log(`${DRY ? "[DRY] " : ""}가로 ${MAX} 초과 ${rows.length} · 줄임 ${shrunk} · 크기만 고침 ${fixed} · 파일 없음 ${missing} · ${(before / 1e9).toFixed(2)}GB → ${(after / 1e9).toFixed(2)}GB`);
await db.end();
