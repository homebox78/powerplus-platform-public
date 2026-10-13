// 사진 폴더(평평한 jpg 묶음) → powerAssets 사진·일러스트 등록. 멱등(legacy_key = 'docphoto:<원본 파일명>').
//   1) 파일 준비: node register-photos.mjs prepare <원본 폴더> <storage.dir> <태그 json(idx·name·cat·ko·en)> <번호표 json(번호→파일명)>
//      → <storage.dir>/assets/photos-doc/<파일명>.jpg(원본 그대로) + .thumb.webp(360) + manifest.json
//   2) 등록:   node register-photos.mjs register <storage.dir> [--dry]
// 태그는 번호 컨택트시트를 보고 쓴 것(cat = photo | illust). 같은 그림(sha256)이 이미 있으면 건너뜀. 원본 크기 원칙(2026-09-30).
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, copyFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const [MODE, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
const DIR = "photos-doc";
const SETS = {
  photo: { set: "photo-doc-business", style: "doc-business-photo", ko: ["사진", "실사"], en: ["photo"] },
  // 산업·기술 분야 키비주얼(왼쪽 글자 자리, 2752×1536) — 태그 json 에 set:"hero" 로 지정
  hero: { cat: "photo", set: "photo-hero-keyvisual", style: "hero-keyvisual-render", ko: ["키비주얼", "히어로", "배경", "메인비주얼", "AI이미지"], en: ["key visual", "hero", "background"] },
  // 3D 글래스 키비주얼(밝은 바탕·왼쪽 글자 자리·유리 질감 아이소메트릭) — set:"glasskv", 파일·키에 접두(옛 사진 키비주얼과 파일 이름이 같다)
  glasskv: { cat: "illust", prefix: "glasskv-", set: "illust-keyvisual-glass", style: "keyvisual-3d-glass", ko: ["키비주얼", "히어로", "메인비주얼", "배경", "3D", "글래스", "유리질감", "아이소메트릭", "AI이미지"], en: ["key visual", "hero", "background", "3d render", "glass", "isometric"] },
  // 공공사업 플랫 키비주얼(밝은 파랑 그라데이션·왼쪽 글자 자리·평면 인물 일러스트) — set:"flatkv"
  flatkv: { cat: "illust", prefix: "flatkv-", set: "illust-keyvisual-flat", style: "keyvisual-flat", ko: ["키비주얼", "히어로", "메인비주얼", "배경", "플랫", "평면일러스트", "인물", "공공사업", "제안서", "AI이미지"], en: ["key visual", "hero", "background", "flat illustration", "people", "public project"] },
  // 기후위기 키비주얼(실사풍 시네마틱, 따뜻함↔차가움 대비 — 가뭄·폭우·폭염·한파) — set:"climate"
  climate: { cat: "photo", prefix: "climate-", set: "photo-keyvisual-climate", style: "keyvisual-climate-cinematic", ko: ["키비주얼", "히어로", "메인비주얼", "배경", "기후위기", "기후변화", "이상기후", "기후적응", "탄소중립", "환경", "AI이미지"], en: ["key visual", "hero", "background", "climate crisis", "climate change", "extreme weather", "climate adaptation"] },
  // 제안서 장(章) 배경(인사말·목차·회사소개·비전·Q&A·맺음말 A/B, 밝은 실사·왼쪽 글자 자리) — set:"section"
  section: { cat: "photo", set: "photo-section-keyvisual", style: "section-keyvisual-bright", ko: ["키비주얼", "배경", "섹션배경", "장표배경", "간지", "제안서", "발표자료", "AI이미지"], en: ["key visual", "background", "section background", "slide background", "proposal"] },
  illust: { set: "illust-doc-concept", style: "doc-concept-render", ko: ["일러스트", "개념이미지", "3D"], en: ["illustration", "concept", "3d render"] },
};
const norm = (t) => String(t).normalize("NFC").trim().toLowerCase().slice(0, 64);

if (MODE === "prepare") {
  const [SRC, STORE, TAGS, IDX] = rest;
  const sharp = (await import("sharp")).default;
  const tags = JSON.parse(readFileSync(TAGS, "utf8"));
  const idx = JSON.parse(readFileSync(IDX, "utf8"));
  const out = resolve(STORE, "assets", DIR);
  mkdirSync(out, { recursive: true });
  const items = [];
  for (const t of tags) {
    const f = idx[String(t.idx)];
    if (!f) throw new Error(`번호표에 없음: ${t.idx}`);
    const S = SETS[t.set] ?? SETS[t.cat === "illust" ? "illust" : "photo"];
    const cat = S.cat ?? (t.cat === "illust" ? "illust" : "photo");
    const base = (S.prefix ?? "") + f.replace(/\.jpe?g$/i, "");
    const src = join(SRC, f);
    const m = await sharp(src).metadata();
    copyFileSync(src, join(out, `${base}.jpg`));
    await sharp(src).resize(360, 360, { fit: "inside" }).webp({ quality: 84 }).toFile(join(out, `${base}.thumb.webp`));
    const ko = [...t.ko, ...S.ko], en = [...t.en, ...S.en];
    items.push({ base, legacy: `docphoto:${S.prefix ?? ""}${f}`, name: t.name, cat, set: S.set, style: S.style, w: m.width, h: m.height, alt: t.name,
      ko: [...new Set(ko.map(norm))].filter(Boolean), en: [...new Set(en.map(norm))].filter(Boolean) });
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ items }, null, 1));
  console.log(`준비 ${items.length}개 → ${out}`);
  process.exit(0);
}

if (MODE !== "register") { console.error("사용: register-photos.mjs prepare|register …"); process.exit(1); }
const [STORE] = rest;
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const mysql = (await import("mysql2/promise")).default;
const man = JSON.parse(readFileSync(resolve(STORE, "assets", DIR, "manifest.json"), "utf8")).items;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

const sets = {};
for (const a of man) {
  if (sets[a.set]) continue;
  const [[s]] = await db.query("SELECT id FROM asset_sets WHERE name = ?", [a.set]);
  if (s) sets[a.set] = s.id;
  else if (!DRY) { const [r] = await db.query("INSERT INTO asset_sets (public_id, name, style, category) VALUES (?,?,?,?)", [pid(), a.set, a.style, a.cat]); sets[a.set] = r.insertId; }
}

let created = 0, updated = 0, tags = 0, dup = 0;
for (const a of man) {
  const files = { original: [`${DIR}/${a.base}.jpg`, "image/jpeg"], thumb: [`${DIR}/${a.base}.thumb.webp`, "image/webp"] };
  const abs = (p) => resolve(STORE, "assets", p);
  for (const [p] of Object.values(files)) if (!existsSync(abs(p))) throw new Error(`파일 없음: ${p}`);
  const sha = createHash("sha256").update(readFileSync(abs(files.original[0]))).digest("hex");
  const [[same]] = await db.query("SELECT id FROM asset_items WHERE sha256 = ? AND deleted_at IS NULL AND (legacy_key IS NULL OR legacy_key <> ?)", [sha, a.legacy]);
  if (same) { dup++; console.log(`같은 그림 이미 있음: ${a.base} = #${same.id}`); continue; }
  if (DRY) { created++; continue; }
  const [[ex]] = await db.query("SELECT id FROM asset_items WHERE legacy_key = ?", [a.legacy]);
  let id;
  if (ex) {
    id = ex.id;
    await db.query("UPDATE asset_items SET category=?, name=?, alt=?, w=?, h=?, style_group=?, set_id=?, sha256=?, deleted_at=NULL WHERE id=?", [a.cat, a.name, a.alt, a.w, a.h, a.set, sets[a.set], sha, id]);
    updated++;
  } else {
    const [r] = await db.query("INSERT INTO asset_items (public_id, visibility, category, name, alt, w, h, has_text, style_group, set_id, source, sha256, legacy_key, ai_generated) VALUES (?, 'public', ?, ?, ?, ?, ?, 0, ?, ?, 'own', ?, ?, 1)",
      [pid(), a.cat, a.name, a.alt, a.w, a.h, a.set, sets[a.set], sha, a.legacy]);
    id = r.insertId; created++;
  }
  for (const [kind, [p, mime]] of Object.entries(files)) {
    const fsha = createHash("sha256").update(readFileSync(abs(p))).digest("hex");
    const [[f]] = await db.query("SELECT id FROM core_files WHERE bucket='assets' AND path=?", [p]);
    let fid = f?.id;
    if (fid) await db.query("UPDATE core_files SET bytes=?, sha256=? WHERE id=?", [statSync(abs(p)).size, fsha, fid]);
    else { const [r] = await db.query("INSERT INTO core_files (public_id, bucket, path, mime, bytes, sha256, visibility) VALUES (?,?,?,?,?,?, 'public')", [pid(), "assets", p, mime, statSync(abs(p)).size, fsha]); fid = r.insertId; }
    await db.query("INSERT INTO asset_files (item_id, kind, file_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE file_id = VALUES(file_id)", [id, kind, fid]);
  }
  const rows = [...a.ko.map((t) => [t, "ko", "kw"]), ...a.en.map((t) => [t, "en", "kw"]), [norm(a.style), "ko", "style"]];
  await db.query("DELETE FROM asset_tags WHERE item_id = ?", [id]);
  const [r] = await db.query("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES " + rows.map(() => "(?,?,?,?)").join(","), rows.flatMap((x) => [id, ...x]));
  tags += r.affectedRows;
}
if (!DRY) for (const sid of Object.values(sets)) await db.query("UPDATE asset_sets SET item_count = (SELECT COUNT(*) FROM asset_items WHERE set_id = ? AND deleted_at IS NULL) WHERE id = ?", [sid, sid]);
console.log(`${DRY ? "[DRY] " : ""}사진: 신규 ${created} · 갱신 ${updated} · 같은 그림 건너뜀 ${dup} · 태그 ${tags} / ${man.length}`);
await db.end();
