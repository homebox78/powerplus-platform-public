// 홈박스 샘플(api/data/sample-images.json 2,204장) → asset_items 이관 + 파워플러스 중복 병합 + 출처 표시.
//   node db/migrate-legacy/homebox-samples.mjs [--dry]
// 전제: powerplus-assets.mjs 가 먼저 돌아 asset_items 에 'pp:*' 행이 있고, dedupe.mjs 가 data/dedupe.json 을 만들어 둔 상태.
// 규칙(사용자 2026-10-06 "중복은 다 걸러내고, 식별 가능한 외부 자산은 식별"):
//   ① 같은 그림(dedupe.hb_pp, 눈 확인한 d≤20) → 파워플러스 행 하나로 합친다. legacy_alt_key='hb:<id>', 홈박스 축 태그(kind·use·target·style)를 그 행에 얹는다.
//   ② 파워플러스에 없는 샘플 → 새 행. 카테고리 = 종류별(사진류 photo · 삽화류 illust · 아이콘류 icon · 글자 박힌 그래픽·로고·서명·기관장 = mockup_sample, 기획 §18 결정).
//   ③ 파워플러스 안 sha256 동일 → 뒤 행 소프트 삭제(deleted_at) + source 에 'dup-of:<id>'.
//   ④ 출처(source) 표시 — 파워플러스 초기 묶음은 외부 자산 가능성이 있어 'unverified' 로 두고 visibility 를 internal 로 내린다(감사표에서 사용자가 확정할 때까지 밖에 안 나감).
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import mysql from "mysql2/promise";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const DRY = process.argv.includes("--dry");
const HB_ROOT = process.env.LEGACY_HOMEBOX_DIR ?? "D:/homebox-handoff";
const manifest = JSON.parse(readFileSync(resolve(HB_ROOT, "api/data/sample-images.json"), "utf8")).items;
const dd = JSON.parse(readFileSync(resolve(here, "data/dedupe.json"), "utf8"));
const u = new URL(process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/powerplus");
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4", dateStrings: true });
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const q = async (sql, p = []) => (DRY && /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) ? [{ affectedRows: 0, insertId: 0 }] : db.query(sql, p);
const norm = (t) => String(t).normalize("NFC").trim().toLowerCase().slice(0, 64);
const say = (k, v) => console.log(`${k}: ${v}`);

// 종류 → 카테고리 (기획 §18: 글자 박힌 그래픽·로고·서명·기관장 사진은 mockup_sample)
const CAT = {
  photo: ["archive-photo", "citizen", "hero-city", "hero-nature", "leader-field", "news-thumb", "place", "sub-visual", "tour", "pattern-bg"],
  illust: ["building-illust", "hero-illust", "spot-illust"], // infographic 은 글자 박힌 그래픽 → mockup_sample(관리자·MCP 전용)
  icon: ["icon-blue", "icon-color", "icon-flat", "icon-glass", "icon-iso", "icon-set"],
  mockup_sample: ["banner", "card-news", "emblem", "leader", "leader-cutout", "mascot", "notice-square", "popup", "popup-tall", "popup-wide", "poster", "signature", "strip-banner", "symbol-illust", "video-thumb"], // mascot·symbol-illust: 기관 상징물은 목업 전용(사용자 2026-10-06 "파워플러스에 노출 X")
};
const catOf = (kind) => Object.entries(CAT).find(([, ks]) => ks.includes(kind))?.[0] ?? "mockup_sample";
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
async function fileId(bucket, path) {
  const [[ex]] = await db.query("SELECT id FROM core_files WHERE bucket = ? AND path = ?", [bucket, path]);
  if (ex) return ex.id;
  const [r] = await q("INSERT INTO core_files (public_id, bucket, path, mime, visibility) VALUES (?,?,?,?,'internal')", [pid(), bucket, path, MIME[extname(path).toLowerCase()] ?? "application/octet-stream"]);
  return r.insertId;
}
/** 홈박스 축 태그: kind · use(use_for) · target(대상:) · style(종류 라벨의 질감 낱말) + kw(일반 태그·alt 낱말) */
function axisTags(a) {
  const rows = [];
  rows.push([norm(a.kind), "kind"]);
  for (const u of a.use_for ?? []) rows.push([norm(u), "use"]);
  for (const t of a.tags ?? []) {
    if (t.startsWith("대상:")) rows.push([norm(t.slice(3)), "target"]);
    else rows.push([norm(t), "kw"]);
  }
  const style = a.kind.startsWith("icon-") ? a.kind.slice(5) : null;
  if (style) rows.push([style, "style"]);
  return [...new Map(rows.map((r) => [r.join("|"), r])).values()].filter((r) => r[0]);
}
async function putTags(id, rows, lang = "ko") {
  for (const axis of [...new Set(rows.map((r) => r[1]))].filter((x) => x !== "kw")) await q("DELETE FROM asset_tags WHERE item_id = ? AND axis = ?", [id, axis]);
  if (!rows.length) return 0;
  const [r] = await q("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES " + rows.map(() => "(?,?,?,?)").join(","), rows.flatMap(([t, ax]) => [id, t, lang, ax]));
  return r.affectedRows;
}

// ── ① 병합: 홈박스 id → 파워플러스 id ───────────────────────────────────
const match = new Map(dd.hb_pp.map((m) => [m.hb, m.pp]));
let merged = 0, mergedMissing = 0, created = 0, updated = 0, tagsN = 0, filesN = 0;
for (const a of manifest) {
  const hbKey = `hb:${a.id}`;
  const ppId = match.get(a.id);
  const rows = axisTags(a);
  if (ppId) {
    const [[row]] = await db.query("SELECT id FROM asset_items WHERE legacy_key = ?", [`pp:${ppId}`]);
    if (!row) { mergedMissing++; continue; }
    await q("UPDATE asset_items SET legacy_alt_key = ?, source = 'homebox', alt = COALESCE(alt, ?), has_text = ?, text_safe = ?, ai_generated = 1 WHERE id = ?", [hbKey, a.alt?.slice(0, 300) ?? null, a.has_text ? 1 : 0, a.text_safe ? JSON.stringify(a.text_safe) : null, row.id]);
    tagsN += await putTags(row.id, rows);
    merged++;
    continue;
  }
  // ② 새 행 (홈박스에만 있는 샘플)
  const cat = catOf(a.kind);
  const vis = cat === "mockup_sample" ? "internal" : "pro";
  const [[ex]] = await db.query("SELECT id FROM asset_items WHERE legacy_key = ? OR legacy_alt_key = ?", [hbKey, hbKey]);
  let id;
  if (ex) { id = ex.id; await q("UPDATE asset_items SET category=?, alt=?, w=?, h=?, has_text=?, text_safe=? WHERE id=?", [cat, a.alt?.slice(0, 300) ?? null, a.w, a.h, a.has_text ? 1 : 0, a.text_safe ? JSON.stringify(a.text_safe) : null, id]); updated++; }
  else {
    const [r] = await q("INSERT INTO asset_items (public_id, visibility, category, alt, w, h, has_text, text_safe, source, legacy_key, ai_generated) VALUES (?,?,?,?,?,?,?,?,'homebox',?,1)", [pid(), vis, cat, a.alt?.slice(0, 300) ?? null, a.w, a.h, a.has_text ? 1 : 0, a.text_safe ? JSON.stringify(a.text_safe) : null, hbKey]);
    id = r.insertId; created++;
  }
  if (DRY && !id) continue;
  for (const [kind, p] of [["original", `homebox-public/samples/${a.file}`], ["thumb", `homebox-public/samples/${a.thumb}`]]) {
    if (!p.endsWith("undefined")) { const fid = await fileId("legacy-homebox", p); const [r] = await q("INSERT INTO asset_files (item_id, kind, file_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE file_id = VALUES(file_id)", [id, kind, fid]); if (r.affectedRows === 1) filesN++; }
  }
  tagsN += await putTags(id, rows);
}
say("홈박스 샘플 → 파워플러스 행에 병합", `${merged}(파워플러스 행 없음 ${mergedMissing})`);
say("홈박스에만 있는 샘플 → 새 행", `신규 ${created} · 갱신 ${updated}`);
say("축 태그(kind/use/target/style/kw)", tagsN); say("asset_files 신규", filesN);

// ── ③ 파워플러스 안 sha256 동일 → 뒤 행 소프트 삭제 ─────────────────────
let soft = 0;
for (const g of dd.pp_sha_dup) {
  const keep = g[0];
  for (const dup of g.slice(1)) {
    const [r] = await q("UPDATE asset_items SET deleted_at = COALESCE(deleted_at, NOW(3)), source = ? WHERE legacy_key = ? AND deleted_at IS NULL", [`dup-of:${keep}`, `pp:${dup}`]);
    soft += r.affectedRows;
  }
}
say("sha256 동일 중복 소프트 삭제", soft);

// ── ④ 출처 표시 + 미확인 묶음은 internal ─────────────────────────────────
//  근거(myDev 파워플러스 기록): icon_605~921 = Tabler(MIT) · logo = 공공기관 로고(기관 저작물) · 초기(6/28~7/03) 아이콘·일러·사진·다이어그램 = 출처 미확인(클립아트 가능)
const RULES = [
  ["tabler", "category='icon' AND CAST(SUBSTRING(legacy_key,9) AS UNSIGNED) BETWEEN 605 AND 921", null],
  ["gov_logo", "category='logo'", null],
  ["unverified", "category='icon' AND CAST(SUBSTRING(legacy_key,9) AS UNSIGNED) BETWEEN 1 AND 604", "internal"],
  ["unverified", "category='illust' AND CAST(SUBSTRING(legacy_key,11) AS UNSIGNED) BETWEEN 1 AND 361", "internal"],
  ["unverified", "category='photo' AND CAST(SUBSTRING(legacy_key,10) AS UNSIGNED) BETWEEN 1 AND 326", "internal"],
  ["unverified", "category='diagram' AND CAST(SUBSTRING(legacy_key,12) AS UNSIGNED) BETWEEN 1 AND 63", "internal"],
];
for (const [src, where, vis] of RULES) {
  const [r] = await q(`UPDATE asset_items SET source = ?${vis ? ", visibility = ?" : ""} WHERE legacy_key LIKE 'pp:%' AND source IN ('powerplus','homebox') AND ${where}`, vis ? [src, vis] : [src]);
  say(`source=${src}${vis ? ` · visibility=${vis}` : ""}`, r.affectedRows);
}

// ── 대조표 ───────────────────────────────────────────────────────────────
const [tot] = await db.query("SELECT source, visibility, COUNT(*) n, SUM(deleted_at IS NOT NULL) del FROM asset_items GROUP BY source, visibility ORDER BY source, visibility");
console.log(`\n${DRY ? "[DRY] " : ""}asset_items 출처 × 공개 범위`);
for (const t of tot) console.log(`  ${t.source.padEnd(14)} ${t.visibility.padEnd(9)} ${String(t.n).padStart(5)}${t.del ? `  (삭제 ${t.del})` : ""}`);
const [[c]] = await db.query("SELECT COUNT(*) n, SUM(legacy_alt_key IS NOT NULL) merged, SUM(deleted_at IS NOT NULL) del FROM asset_items");
console.log(`총 ${c.n} · 두 키 보유(병합) ${c.merged} · 소프트 삭제 ${c.del}`);
await db.end();
