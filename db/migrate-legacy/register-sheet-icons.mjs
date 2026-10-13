// 시트를 잘라 둔 아이콘 PNG → powerAssets 등록 + 목업 샘플('kind' 태그). 멱등(legacy_key = '<접두>:<날짜>/<시트>-<번호>').
//   --preset=glass(기본): 유리 질감 입체(시트 3×2, sNN-N.png) / --preset=color: 컬러 그라데이션 평면(시트 4×3, tNN-MM.png)
//   1) 준비: node register-sheet-icons.mjs prepare <잘라 둔 폴더> <storage.dir> <키워드 json> [--preset=…]
//      → <storage.dir>/assets/<dir>/<날짜>-<시트>-<번호>.png(원본 크기) + .thumb.webp(360) + manifest.json
//   2) 등록: node register-sheet-icons.mjs register <storage.dir> [--preset=…] [--dry]
// 세트는 기존 icon-glass-3d 에 합친다(같은 유리 질감 파랑 입체). 'kind' 축 태그가 있어 MockSamples::all() 이 목업 샘플로도 읽는다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const [MODE, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
// --preset=color: 컬러 그라데이션 평면 아이콘(시트 4×3, 잘린 이름 tNN-MM.png) → 세트 icon-color-gradient-flat, kind icon-gradient (2026-10-11)
const PRESETS = {
  glass: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^s\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "반투명", "제안서"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "translucent"] },
  // 2차 유리 질감 입체(분야 10종 시트 3×2, gNN-N.png) — 같은 세트 icon-glass-3d 에 합침 (2026-10-12)
  glass2: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^g\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "반투명", "제안서"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "translucent"] },
  // 3차 유리 질감 입체(업무 분야 20종 시트 2×2, vNN-N.png) — 같은 세트 icon-glass-3d 에 합침 (2026-10-11)
  glass3: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^v\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "반투명", "제안서"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "translucent"] },
  // 4차 유리 질감 입체(인프라 8종 시트 2×2, wNN-N.png) — 같은 세트 icon-glass-3d (2026-10-11)
  glass4: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^w\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "반투명", "제안서"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "translucent"] },
  // 5차 유리 질감 입체 시트 2×2 — 바이오 10장(bNN)·비즈니스 30장(cNN)·인프라 38장(iNN, 01~08 은 4차와 같은 그림이라 sha 로 건너뜀) (2026-10-12)
  bio: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^b\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "반투명", "제안서"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "translucent"] },
  biz: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^c\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "반투명", "제안서"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "translucent"] },
  infra: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^i\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "반투명", "제안서"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "translucent"] },
  // 6차 관공서 홈페이지 3D(공지·갤러리·영상·바로가기·민원·자료실·기관소개·신청·소통·퀵메뉴, 시트 2×2, hNN-N.png) (2026-10-12)
  gov: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^h\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "홈페이지", "관공서"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "website"] },
  // 7차 의약품 심사 AI 3D(서류심사·성분분석·품질검수·판정·라벨검증·임상분석·부작용감시·문헌검토·제조감시, 시트 2×2, mNN-N.png) (2026-10-12)
  med: { dir: "icons-glass", set: "icon-glass-3d", style: "glass", kind: "icon-glass", prefix: "glassicon", file: /^m\d\d-\d\.png$/, label: "유리 질감 입체",
    ko: ["아이콘", "유리", "글래스", "입체", "3D", "파랑", "의약품", "AI"], en: ["icon", "glass", "glassmorphism", "3d", "blue", "pharma"] },
  // 비즈니스 플랫 일러스트(사람·업무 장면, 시트에서 그림마다 여백 0 으로 자름 — 2주제 시트 fNN-1·2, 1주제 시트 eNN-1) → 일러스트 분류 (2026-10-12)
  bizillust: { dir: "illust-bizflat", set: "illust-business-flat", style: "business-flat", kind: "illust-flat", prefix: "bizillust", file: /^[ef]\d\d-\d\.png$/, label: "비즈니스 플랫 일러스트",
    category: "illust", noun: "일러스트", use: ["info_cards", "hero"],
    ko: ["일러스트", "플랫", "평면", "비즈니스", "사람", "업무", "직장인", "제안서"], en: ["illustration", "flat", "business", "people", "office", "work"] },
  color: { dir: "icons-color2", set: "icon-color-gradient-flat", style: "color-gradient-flat", kind: "icon-gradient", prefix: "coloricon", file: /^t\d\d-\d\d\.png$/, label: "컬러 그라데이션 평면",
    ko: ["아이콘", "컬러", "플랫", "평면", "그라데이션", "알록달록", "제안서"], en: ["icon", "color", "flat", "gradient", "colorful"] },
};
const P = PRESETS[(process.argv.find((a) => a.startsWith("--preset=")) ?? "--preset=glass").slice(9)];
if (!P) { console.error("preset: glass|glass2|glass3|glass4|bio|biz|infra|gov|med|bizillust|color"); process.exit(1); }
const { dir: DIR, set: SET, style: STYLE, kind: KIND } = P;
const USE = P.use ?? ["quick_links", "info_cards"];
const CAT = P.category ?? "icon";
const COMMON_KO = P.ko;
const COMMON_EN = P.en;
const norm = (t) => String(t).normalize("NFC").trim().toLowerCase().slice(0, 64);

if (MODE === "prepare") {
  const [SRC, STORE, KW] = rest;
  const sharp = (await import("sharp")).default;
  const kw = JSON.parse(readFileSync(KW, "utf8"));
  const tag = basename(KW).match(/(\d{8})/)?.[1] ?? "x";
  const out = resolve(STORE, "assets", DIR);
  mkdirSync(out, { recursive: true });
  const items = [];
  for (const f of readdirSync(SRC).filter((x) => P.file.test(x)).sort()) {
    const key = f.replace(/\.png$/, "");
    const k = kw[key];
    if (!k) throw new Error(`키워드 없음: ${key}`);
    const [name, koSyn, enSyn] = k;
    const [tko, ten] = kw._topics?.[key.slice(0, 3)] ?? ["", ""];
    const base = `${tag}-${key}`;
    const file = join(SRC, f);
    const m = await sharp(file).metadata();
    writeFileSync(join(out, `${base}.png`), readFileSync(file));
    await sharp(file).resize(360, 360, { fit: "inside" }).webp({ quality: 86 }).toFile(join(out, `${base}.thumb.webp`));
    const ko = [name, ...name.split(" "), ...koSyn.split(" "), ...tko.split(" "), ...COMMON_KO];
    const en = [enSyn.split(" ").slice(0, 2).join(" "), ...enSyn.split(" "), ...ten.split(" "), ...COMMON_EN];
    items.push({ base, legacy: `${P.prefix}:${tag}/${key}`, name, w: m.width, h: m.height, alt: `${name} ${P.noun ?? "아이콘"} — ${P.label}`,
      ko: [...new Set(ko.map(norm))].filter(Boolean).slice(0, 25), en: [...new Set(en.map(norm))].filter(Boolean).slice(0, 25) });
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ items }, null, 1));
  console.log(`준비 ${items.length}개 → ${out}`);
  process.exit(0);
}

if (MODE !== "register") { console.error("사용: register-glass-icons.mjs prepare|register …"); process.exit(1); }

const [STORE] = rest;
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const mysql = (await import("mysql2/promise")).default;
const man = JSON.parse(readFileSync(resolve(STORE, "assets", DIR, "manifest.json"), "utf8")).items;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

let [[set]] = await db.query("SELECT id FROM asset_sets WHERE name = ?", [SET]);
if (!set && !DRY) { const [r] = await db.query("INSERT INTO asset_sets (public_id, name, style, category) VALUES (?,?,?,?)", [pid(), SET, STYLE, CAT]); set = { id: r.insertId }; }

let created = 0, updated = 0, tags = 0, dup = 0;
for (const a of man) {
  const files = { original: [`${DIR}/${a.base}.png`, "image/png"], thumb: [`${DIR}/${a.base}.thumb.webp`, "image/webp"] };
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
    await db.query("UPDATE asset_items SET category=?, name=?, alt=?, w=?, h=?, style_group=?, set_id=?, sha256=?, deleted_at=NULL WHERE id=?", [CAT, a.name, a.alt, a.w, a.h, SET, set.id, sha, id]);
    updated++;
  } else {
    const [r] = await db.query("INSERT INTO asset_items (public_id, visibility, category, name, alt, w, h, has_text, style_group, set_id, source, sha256, legacy_key, ai_generated) VALUES (?, 'public', ?, ?, ?, ?, ?, 0, ?, ?, 'own', ?, ?, 1)",
      [pid(), CAT, a.name, a.alt, a.w, a.h, SET, set.id, sha, a.legacy]);
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
  const rows = [...a.ko.map((t) => [t, "ko", "kw"]), ...a.en.map((t) => [t, "en", "kw"]), [STYLE, "ko", "style"], [KIND, "ko", "kind"], ...USE.map((x) => [x, "ko", "use"])];
  await db.query("DELETE FROM asset_tags WHERE item_id = ?", [id]);
  const [r] = await db.query("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES " + rows.map(() => "(?,?,?,?)").join(","), rows.flatMap((x) => [id, ...x]));
  tags += r.affectedRows;
}
if (!DRY && set) await db.query("UPDATE asset_sets SET item_count = (SELECT COUNT(*) FROM asset_items WHERE set_id = ? AND deleted_at IS NULL) WHERE id = ?", [set.id, set.id]);
console.log(`${DRY ? "[DRY] " : ""}${P.label}: 신규 ${created} · 갱신 ${updated} · 같은 그림 건너뜀 ${dup} · 태그 ${tags} / ${man.length}`);
await db.end();
