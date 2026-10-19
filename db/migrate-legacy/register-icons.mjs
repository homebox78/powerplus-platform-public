// 아이콘 폴더(묶음/주제/번호_이름.png) → powerAssets 아이콘 등록. 멱등(legacy_key = 'docicon:<묶음키>/<주제번호>-<번호>').
//   1) 파일 준비: node register-icons.mjs prepare <원본 폴더(docs/icon)> <storage.dir> <키워드 json>
//      → <storage.dir>/assets/icons-doc/<묶음키>-<주제>-<번호>.png(원본 크기 그대로) + .thumb.webp(360) + manifest.json
//   2) 등록:   node register-icons.mjs register <storage.dir> [--dry]
// 묶음마다 asset_sets 하나(style_group 같은 이름) — 웹의 "같은 스타일 세트"가 그대로 묶인다. 원본 크기 원칙(2026-09-30).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const [MODE, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
const DIR = "icons-doc";

// 원본 묶음 폴더 이름 → 묶음키·세트·스타일 낱말
const GROUPS = {
  "SI장표아이콘_96개": { key: "si", set: "icon-si-deck-blue", style: "si-deck-blue", ko: ["SI장표", "제안서", "파랑", "투톤", "라인"], en: ["proposal", "blue", "duotone", "line icon"] },
  "장표아이콘_공공플랫폼": { key: "pub", set: "icon-si-deck-blue", style: "si-deck-blue", ko: ["공공플랫폼", "제안서", "파랑", "투톤", "라인"], en: ["public platform", "blue", "duotone", "line icon"] },
  "손그림아이콘_120개": { key: "hand", set: "icon-handdrawn-blue", style: "handdrawn-blue", ko: ["손그림", "낙서", "드로잉", "파랑포인트", "라인"], en: ["hand drawn", "doodle", "sketch", "line icon"] },
  // 2026-10-18 스타일 6종(세트 icon-pict-* — icon-line-navy·icon-duotone-blue 는 10-06 옛 파워플러스 관공서 아이콘 24개씩이 이미 쓰는 이름이라 피함) × 같은 주제 108개(라인 두 벌은 120) — IT·관공서·회사소개 공통 픽토그램, 투명 PNG
  "S1_솔리드네이비": { key: "solnavy", set: "icon-pict-solid-navy", style: "pict-solid-navy", ko: ["솔리드", "채움", "네이비", "단색", "픽토그램"], en: ["solid", "filled", "navy", "glyph", "pictogram"] },
  "S2_라인": { key: "linenavy", set: "icon-pict-line-navy", style: "pict-line-navy", ko: ["라인", "선", "외곽선", "네이비", "단색"], en: ["line", "outline", "stroke", "navy"] },
  "S3_라인포인트": { key: "linept", set: "icon-pict-line-point", style: "pict-line-point", ko: ["라인", "포인트", "노랑포인트", "투톤", "네이비"], en: ["line", "outline", "yellow accent", "two tone"] },
  "S4_원형배지": { key: "cbadge", set: "icon-pict-circle-badge", style: "pict-circle-badge", ko: ["원형", "배지", "동그라미", "파랑", "흰아이콘"], en: ["circle", "badge", "round", "blue", "white glyph"] },
  "S5_듀오톤블루": { key: "duoblue", set: "icon-pict-duotone-blue", style: "pict-duotone-blue", ko: ["듀오톤", "투톤", "파랑", "라인", "옅은면"], en: ["duotone", "two tone", "blue", "line"] },
  "S6_플랫컬러": { key: "flatcolor", set: "icon-pict-flat-color", style: "pict-flat-color", ko: ["플랫", "컬러", "다색", "알록달록", "평면"], en: ["flat", "color", "multicolor", "colorful"] },
  // 2026-10-18 12차 — 스타일 7종(세트 icon-pict-*) × 같은 주제 100개(하드웨어·의료·도시 시설·생활·사무·경영). S1~S6 은 109~144 추가·일부 다시 그린 판 교체
  "T1_그라데이션채움": { key: "gradfill", set: "icon-pict-gradient-fill", style: "pict-gradient-fill", ko: ["그라데이션", "채움", "솔리드", "파랑", "단색"], en: ["gradient", "filled", "solid", "blue", "glyph"] },
  "T2_아이소메트릭": { key: "isoblue", set: "icon-pict-isometric", style: "pict-isometric-blue", ko: ["아이소메트릭", "입체", "3D", "파랑", "투톤"], en: ["isometric", "3d", "blue", "two tone"] },
  "T3_클레이3D": { key: "clay3d", set: "icon-pict-clay-3d", style: "pict-clay-3d-blue", ko: ["클레이", "3D", "입체", "점토", "파랑", "노랑포인트"], en: ["clay", "3d", "render", "blue", "yellow accent"] },
  "T4_굵은선어긋난채움": { key: "boldoff", set: "icon-pict-bold-offset", style: "pict-bold-offset", ko: ["굵은선", "라인", "어긋난채움", "파랑", "노랑", "투톤"], en: ["bold line", "outline", "offset fill", "blue", "yellow"] },
  "T5_둥근사각앱타일": { key: "apptile", set: "icon-pict-app-tile", style: "pict-app-tile", ko: ["앱아이콘", "둥근사각", "타일", "컬러", "다색", "흰아이콘"], en: ["app icon", "rounded square", "tile", "color", "multicolor"] },
  "T6_가는선그라데이션": { key: "thingrad", set: "icon-pict-thin-gradient", style: "pict-thin-gradient", ko: ["가는선", "라인", "외곽선", "그라데이션", "파랑", "청록"], en: ["thin line", "outline", "gradient", "blue", "teal"] },
  "T7_반투명겹침면": { key: "overlap", set: "icon-pict-overlap", style: "pict-overlap-blue", ko: ["반투명", "겹침", "면", "플랫", "파랑", "하늘색"], en: ["translucent", "overlap", "flat", "blue", "sky blue"] },
  // 2026-10-19 13차 — 흰색 아이콘(투명 바탕 흰 선, 짙은 면·사진 위에 얹는 용도) 120개. S1~S6 145~300·T3~T7 101~300 은 같은 세트에 이어 붙는다
  "T8_흰색아이콘": { key: "white", set: "icon-pict-white", style: "pict-white-line", ko: ["흰색", "화이트", "흰아이콘", "라인", "어두운배경용", "투명"], en: ["white", "white icon", "line", "for dark background", "transparent"] },
  "컬러플랫아이콘": { key: "color", set: "icon-color-gradient-flat", style: "color-gradient-flat", ko: ["컬러", "플랫", "그라데이션", "알록달록"], en: ["color", "flat", "gradient"] },
};
const norm = (t) => String(t).normalize("NFC").trim().toLowerCase().slice(0, 64);
const strip = (s) => s.normalize("NFC").replace(/^\d+_/, "").replace(/\.png$/i, "");

if (MODE === "prepare") {
  const [SRC, STORE, KW] = rest;
  const sharp = (await import("sharp")).default;
  const kw = JSON.parse(readFileSync(KW, "utf8"));
  const out = resolve(STORE, "assets", DIR);
  mkdirSync(out, { recursive: true });
  const items = [];
  for (const g of readdirSync(SRC)) {
    const G = GROUPS[g.normalize("NFC")];
    if (!G) throw new Error(`모르는 묶음: ${g}`);
    const walk = (d, topic) => readdirSync(d).sort().flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f), f) : f.toLowerCase().endsWith(".png") ? [[join(d, f), topic, f]] : []));
    for (const [file, topicDir, f] of walk(join(SRC, g), null)) {
      const name = strip(f);
      const tn = topicDir ? topicDir.normalize("NFC").match(/^(\d+)/)[1] : "00";
      const num = f.match(/^(\d+)/)[1];
      const base = `${G.key}-${tn}-${num}`;
      const topic = topicDir ? strip(topicDir) : null;
      const [koSyn, enSyn] = kw[name] ?? (() => { throw new Error(`키워드 없음: ${name}`); })();
      const m = await sharp(file).metadata();
      writeFileSync(join(out, `${base}.png`), readFileSync(file));
      await sharp(file).resize(360, 360, { fit: "inside" }).webp({ quality: 86 }).toFile(join(out, `${base}.thumb.webp`));
      const ko = [name, ...(topic ? [topic] : []), ...koSyn.split(" "), "아이콘", ...G.ko];
      const en = [...enSyn.split(" ").length > 3 ? [enSyn] : [], ...enSyn.split(" "), "icon", ...G.en];
      items.push({ base, legacy: `docicon:${base}`, name, group: g.normalize("NFC"), set: G.set, style: G.style, w: m.width, h: m.height, alt: `${name} 아이콘${topic ? ` — ${topic}` : ""}`, ko: [...new Set(ko.map(norm))].filter(Boolean), en: [...new Set(en.map(norm))].filter(Boolean) });
    }
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ items }, null, 1));
  console.log(`준비 ${items.length}개 → ${out}`);
  process.exit(0);
}

if (MODE !== "register") { console.error("사용: register-icons.mjs prepare|register …"); process.exit(1); }
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
  else if (!DRY) { const [r] = await db.query("INSERT INTO asset_sets (public_id, name, style, category) VALUES (?,?,?, 'icon')", [pid(), a.set, a.style]); sets[a.set] = r.insertId; }
}

let created = 0, updated = 0, tags = 0, dup = 0;
for (const a of man) {
  const files = { original: [`${DIR}/${a.base}.png`, "image/png"], thumb: [`${DIR}/${a.base}.thumb.webp`, "image/webp"] };
  const abs = (p) => resolve(STORE, "assets", p);
  for (const [p] of Object.values(files)) if (!existsSync(abs(p))) throw new Error(`파일 없음: ${p}`);
  const sha = createHash("sha256").update(readFileSync(abs(files.original[0]))).digest("hex");
  const [[same]] = await db.query("SELECT id, legacy_key FROM asset_items WHERE sha256 = ? AND deleted_at IS NULL AND (legacy_key IS NULL OR legacy_key <> ?)", [sha, a.legacy]);
  if (same) { dup++; console.log(`같은 그림 이미 있음: ${a.base} = #${same.id}`); continue; }
  if (DRY) { created++; continue; }
  const [[ex]] = await db.query("SELECT id FROM asset_items WHERE legacy_key = ?", [a.legacy]);
  let id;
  if (ex) {
    id = ex.id;
    await db.query("UPDATE asset_items SET name=?, alt=?, w=?, h=?, style_group=?, set_id=?, sha256=?, deleted_at=NULL WHERE id=?", [a.name, a.alt, a.w, a.h, a.set, sets[a.set], sha, id]);
    updated++;
  } else {
    const [r] = await db.query("INSERT INTO asset_items (public_id, visibility, category, name, alt, w, h, has_text, style_group, set_id, source, sha256, legacy_key, ai_generated) VALUES (?, 'public', 'icon', ?, ?, ?, ?, 0, ?, ?, 'own', ?, ?, 1)",
      [pid(), a.name, a.alt, a.w, a.h, a.set, sets[a.set], sha, a.legacy]);
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
console.log(`${DRY ? "[DRY] " : ""}아이콘: 신규 ${created} · 갱신 ${updated} · 같은 그림 건너뜀 ${dup} · 태그 ${tags} / ${man.length}`);
await db.end();
