// 이미 등록된 에셋 중 투명 여백이 남은 그림을 경계(알파>10)까지 잘라 다시 저장한다 (2026-10-12).
//   사용: node trim-margins.mjs <storage.dir> [--apply] [--backup=<폴더>] [--min=2]
//   --apply 없으면 점검만(분류별 개수·예시). 원본·썸네일은 덮어쓰기 전에 --backup 폴더로 복사.
//   대상: 원본에 알파가 있고, 어느 한 변이라도 투명 여백이 --min px 이상인 그림. 불투명 그림(사진·장표)은 자동으로 빠진다.
//   바뀌는 것: 원본 파일·썸네일(360, 같은 형식) · core_files.bytes/sha256 · asset_items.w/h/sha256. 다시 돌리면 0건(멱등).
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const STORE = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!STORE) { console.error("사용: trim-margins.mjs <storage.dir> [--apply] [--backup=폴더]"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const opt = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const BACKUP = opt("backup", "");
const MIN = Number(opt("min", 2));
const TB = 10;
if (APPLY && !BACKUP) { console.error("--apply 에는 --backup=폴더 가 필요합니다"); process.exit(1); }

if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const sharp = (await import("sharp")).default;
const mysql = (await import("mysql2/promise")).default;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });

const [rows] = await db.query(`SELECT i.id, i.category, i.name, fo.id oid, fo.bucket ob, fo.path op, ft.id tid, ft.bucket tb, ft.path tp
  FROM asset_items i
  JOIN asset_files ao ON ao.item_id = i.id AND ao.kind = 'original' JOIN core_files fo ON fo.id = ao.file_id
  LEFT JOIN asset_files at ON at.item_id = i.id AND at.kind = 'thumb' LEFT JOIN core_files ft ON ft.id = at.file_id
  WHERE i.deleted_at IS NULL AND i.category <> 'ppt' AND fo.path REGEXP '\\\\.(png|webp)$'`);

const abs = (b, p) => resolve(STORE, b, p);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const enc = (img, ext) => ext === ".webp" ? img.webp({ quality: 90, alphaQuality: 100 }) : ext === ".jpg" ? img.flatten({ background: "#fff" }).jpeg({ quality: 88 }) : img.png();
const stat = {}; let missing = 0, done = 0;
const examples = [];
for (const r of rows) {
  const file = abs(r.ob, r.op);
  if (!existsSync(file)) { missing++; continue; }
  const src = readFileSync(file);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const meta = await sharp(src).metadata();
  if (!meta.hasAlpha) continue;
  const W = info.width, H = info.height;
  let mx = W, my = H, Mx = -1, My = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > TB) { if (x < mx) mx = x; if (x > Mx) Mx = x; if (y < my) my = y; if (y > My) My = y; }
  if (Mx < 0) continue; // 완전히 투명 — 손대지 않음
  const m = [mx, my, W - 1 - Mx, H - 1 - My];
  if (Math.max(...m) < MIN) continue;
  const w = Mx + 1 - mx, h = My + 1 - my;
  const s = (stat[r.category] ??= { n: 0, px: 0 }); s.n++; s.px += m.reduce((a, b) => a + b, 0);
  if (examples.length < 12) examples.push(`#${r.id} ${r.category} ${r.name ?? ""} ${W}×${H} → ${w}×${h} (여백 ${m.join("/")})`);
  if (!APPLY) continue;

  for (const [b, p] of [[r.ob, r.op], [r.tb, r.tp]]) if (p && existsSync(abs(b, p))) {
    const dst = resolve(BACKUP, b, p); mkdirSync(dirname(dst), { recursive: true }); if (!existsSync(dst)) copyFileSync(abs(b, p), dst);
  }
  const out = await enc(sharp(src).extract({ left: mx, top: my, width: w, height: h }), extname(r.op).toLowerCase()).toBuffer();
  writeFileSync(file, out);
  await db.query("UPDATE core_files SET bytes=?, sha256=? WHERE id=?", [out.length, sha(out), r.oid]);
  await db.query("UPDATE asset_items SET w=?, h=?, sha256=? WHERE id=?", [w, h, sha(out), r.id]);
  if (r.tp) {
    const ext = extname(r.tp).toLowerCase();
    const t = await enc(sharp(out).resize(360, 360, { fit: "inside", withoutEnlargement: true }), ext).toBuffer();
    mkdirSync(dirname(abs(r.tb, r.tp)), { recursive: true });
    writeFileSync(abs(r.tb, r.tp), t);
    await db.query("UPDATE core_files SET bytes=?, sha256=? WHERE id=?", [t.length, sha(t), r.tid]);
  }
  done++;
}
console.log(`검사 ${rows.length} · 파일 없음 ${missing}`);
for (const [k, v] of Object.entries(stat)) console.log(`  ${k}: 여백 있음 ${v.n} (평균 여백 합 ${Math.round(v.px / v.n)}px)`);
console.log(examples.join("\n"));
console.log(APPLY ? `잘라서 저장 ${done}건 (백업 ${BACKUP})` : "[점검만] --apply --backup=폴더 로 적용");
await db.end();
