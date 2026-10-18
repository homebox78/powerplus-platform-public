// semologo.com 국내 로고(투명 PNG) → powerAssets 로고 등록. 멱등(legacy_key = 'semologo:<브랜드 id>').
//   1) 파일 준비: node register-logos.mjs prepare <catalog.json> <png 폴더> <storage.dir>
//      catalog.json = semologo /api/catalog/?origin=KR 전체(브랜드 배열), png 폴더 = <브랜드 id>.png(모달의 '투명 PNG')
//      → <storage.dir>/assets/logos-semo/<id>.png(가로 2500 넘으면 줄임) + .thumb.webp(360) + manifest.json
//   2) 등록:   node register-logos.mjs register <storage.dir> [--dry]
// 이미 있는 로고(이름이 같은 것 — 옛 파워플러스 공공기관 로고 포함)는 새 파일로 덮어쓴다(사용자 2026-10-18 "중복된건 최신걸로 덮어씌워").
// style_group = 로고 분류 'logo-<분류>'(아래 groupOf) — powerDeck 로고 찾기·powerAssets 로고 분류(Deck/Logos.php TOPICS)가 이것을 본다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, copyFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const [MODE, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
const DIR = "logos-semo";
const SET = "logo-semologo-kr";
const MAXW = 2500;
const norm = (t) => String(t).normalize("NFC").trim().toLowerCase().slice(0, 64);
/** 같은 로고 판정용 이름 — 공백·(주)·주식회사·가운뎃점 없애고 소문자 */
const key = (n) => String(n ?? "").normalize("NFC").toLowerCase().replace(/\(주\)|㈜|주식회사|\s|[·・.]/g, "");
// semologo 카테고리 → 로고 분류(api/src/Deck/Logos.php TOPICS 와 짝). 공공·기관은 null — 서버 ensureTopics 가 이름(…부·…시·…공단)으로 가른다
const BIZ = {
  "식품·음료": "food", "IT·테크": "it", "게임": "it", "통신": "it", "암호화폐·블록체인": "it", "미디어·엔터": "media", "문화·행사": "media",
  "의료·바이오": "health", "금융·결제": "finance", "제조·그룹": "maker", "철강·중공업": "maker", "항공·우주·방산": "maker", "에너지·화학": "energy",
  "유통·쇼핑": "retail", "뷰티·패션": "retail", "물류·교통": "mobility", "자동차": "mobility", "숙박·여행": "mobility", "건설·부동산": "build", "스포츠": "sports",
};
const groupOf = (cat) => (/공공|기관/.test(cat) ? null : /교육/.test(cat) ? "logo-edu" : `logo-biz-${BIZ[cat] ?? "etc"}`);

if (MODE === "prepare") {
  const [CAT, SRC, STORE] = rest;
  const sharp = (await import("sharp")).default;
  // 같은 이름 브랜드(gongu-ci-1474 진주시·gyeongnam-jinju-si 진주시 등)는 가장 최근 것 하나만 — 같은 날이면 목록 순(인기순) 앞
  const when = (b) => String(b.logo_published_at ?? b.updated_at ?? b.added_at ?? "");
  const pickByName = new Map();
  for (const b of JSON.parse(readFileSync(CAT, "utf8"))) {
    if (b.hidden || !existsSync(join(SRC, `${b.id}.png`))) continue;
    const k = key(b.name_ko || b.name_en), cur = pickByName.get(k);
    if (!cur || when(b) > when(cur)) pickByName.set(k, b);
  }
  const brands = [...pickByName.values()];
  const out = resolve(STORE, "assets", DIR);
  mkdirSync(out, { recursive: true });
  const items = [];
  let shrunk = 0, missing = 0;
  for (const b of brands) {
    const src = join(SRC, `${b.id}.png`);
    if (b.hidden || !existsSync(src)) { missing++; continue; }
    const dst = join(out, `${b.id}.png`);
    let m = await sharp(src).metadata();
    if (m.width > MAXW) { await sharp(src).resize({ width: MAXW }).png().toFile(dst); m = await sharp(dst).metadata(); shrunk++; }
    else copyFileSync(src, dst);
    await sharp(dst).resize(360, 360, { fit: "inside" }).webp({ quality: 88, alphaQuality: 100 }).toFile(join(out, `${b.id}.thumb.webp`));
    const cat = String(b.category ?? "");
    const ko = [b.name_ko, ...(b.aliases ?? []), ...cat.split(/[·・]/), "로고", "CI", "브랜드로고", groupOf(cat)?.startsWith("logo-biz") ? "기업로고" : "기관로고"];
    const en = [b.name_en, "logo", "brand", "korea"];
    items.push({ id: b.id, name: String(b.name_ko || b.name_en).trim().slice(0, 200), alt: `${b.name_ko} 로고`.slice(0, 300), w: m.width, h: m.height, group: groupOf(cat),
      ko: [...new Set(ko.filter(Boolean).map(norm))].filter(Boolean), en: [...new Set(en.filter(Boolean).map(norm))].filter((t) => t && !/[가-힣]/.test(t)) });
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ items }, null, 1));
  console.log(`준비 ${items.length}개(가로 ${MAXW} 넘어 줄인 것 ${shrunk}, 파일 없음 ${missing}) → ${out}`);
  process.exit(0);
}

if (MODE !== "register") { console.error("사용: register-logos.mjs prepare|register …"); process.exit(1); }
const [STORE] = rest;
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const mysql = (await import("mysql2/promise")).default;
const man = JSON.parse(readFileSync(resolve(STORE, "assets", DIR, "manifest.json"), "utf8")).items;
const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4" });
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const abs = (p) => resolve(STORE, "assets", p);

let [[set]] = await db.query("SELECT id FROM asset_sets WHERE name = ?", [SET]);
if (!set && !DRY) { const [r] = await db.query("INSERT INTO asset_sets (public_id, name, style, category) VALUES (?,?,?,?)", [pid(), SET, "semologo", "logo"]); set = { id: r.insertId }; }

// 이미 있는 로고(semologo 가 아닌 것)를 이름으로 — 같은 이름이 여럿이면 먼저 만든 것
const [olds] = await db.query("SELECT id, name, legacy_key FROM asset_items WHERE category = 'logo' AND deleted_at IS NULL AND (legacy_key IS NULL OR legacy_key NOT LIKE 'semologo:%') ORDER BY id");
const byName = new Map();
for (const o of olds) if (!byName.has(key(o.name))) byName.set(key(o.name), o);

let created = 0, updated = 0, replaced = 0, dup = 0, tags = 0, gone = 0;
const seenSha = new Map();
const used = new Set();
for (const a of man) {
  const files = { original: [`${DIR}/${a.id}.png`, "image/png"], thumb: [`${DIR}/${a.id}.thumb.webp`, "image/webp"] };
  for (const [p] of Object.values(files)) if (!existsSync(abs(p))) throw new Error(`파일 없음: ${p}`);
  const sha = createHash("sha256").update(readFileSync(abs(files.original[0]))).digest("hex");
  // legacy_key 는 64자 — 긴 id(58자 둘)는 앞부분 + 해시
  const legacy = a.id.length <= 55 ? `semologo:${a.id}` : `semologo:${a.id.slice(0, 38)}~${createHash("sha1").update(a.id).digest("hex").slice(0, 16)}`;
  // 같은 그림이 semologo 안에서 두 번(별칭 브랜드) — 먼저(인기순) 것만
  if (seenSha.has(sha)) { dup++; continue; }
  seenSha.set(sha, a.id);
  const [[same]] = await db.query("SELECT id FROM asset_items WHERE sha256 = ? AND deleted_at IS NULL AND (legacy_key IS NULL OR legacy_key <> ?)", [sha, legacy]);
  if (same) { dup++; continue; }

  const [[ex]] = await db.query("SELECT id FROM asset_items WHERE legacy_key = ?", [legacy]);
  const old = !ex && !used.has(key(a.name)) ? byName.get(key(a.name)) : null;
  if (DRY) { if (ex) updated++; else if (old) replaced++; else created++; used.add(key(a.name)); continue; }
  let id;
  if (ex) {
    id = ex.id;
    await db.query("UPDATE asset_items SET name=?, alt=?, w=?, h=?, style_group=?, set_id=?, sha256=?, deleted_at=NULL WHERE id=?", [a.name, a.alt, a.w, a.h, a.group, set.id, sha, id]);
    updated++;
  } else if (old) {
    // 옛 로고를 최신 파일로 덮어쓴다 — public_id·legacy_key(화면에 박힌 logo_524 등)는 그대로, 옛 파일은 지운다
    id = old.id;
    const [oldFiles] = await db.query("SELECT f.id, f.bucket, f.path FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = ?", [id]);
    // style_group 은 그대로(옛 공공기관 로고는 이름으로 분류 — 한국전력이 semologo 에선 '에너지' 라 기업으로 가면 안 된다)
    await db.query("UPDATE asset_items SET alt=?, w=?, h=?, set_id=?, source='semologo', sha256=? WHERE id=?", [a.alt, a.w, a.h, set.id, sha, id]);
    await db.query("DELETE FROM asset_files WHERE item_id = ?", [id]);
    for (const f of oldFiles) {
      const [[still]] = await db.query("SELECT COUNT(*) n FROM asset_files WHERE file_id = ?", [f.id]);
      if (still.n) continue;
      await db.query("UPDATE core_files SET deleted_at = NOW(3) WHERE id = ?", [f.id]);
      const p = resolve(STORE, f.bucket, f.path);
      if (existsSync(p)) { unlinkSync(p); gone++; }
    }
    replaced++;
  } else {
    const [r] = await db.query("INSERT INTO asset_items (public_id, visibility, category, name, alt, w, h, has_text, style_group, set_id, source, sha256, legacy_key, ai_generated) VALUES (?, 'public', 'logo', ?, ?, ?, ?, 0, ?, ?, 'semologo', ?, ?, 0)",
      [pid(), a.name, a.alt, a.w, a.h, a.group, set.id, sha, legacy]);
    id = r.insertId; created++;
  }
  used.add(key(a.name));
  for (const [kind, [p, mime]] of Object.entries(files)) {
    const fsha = createHash("sha256").update(readFileSync(abs(p))).digest("hex");
    const [[f]] = await db.query("SELECT id FROM core_files WHERE bucket='assets' AND path=?", [p]);
    let fid = f?.id;
    if (fid) await db.query("UPDATE core_files SET bytes=?, sha256=?, deleted_at=NULL WHERE id=?", [statSync(abs(p)).size, fsha, fid]);
    else { const [r] = await db.query("INSERT INTO core_files (public_id, bucket, path, mime, bytes, sha256, visibility) VALUES (?,?,?,?,?,?, 'public')", [pid(), "assets", p, mime, statSync(abs(p)).size, fsha]); fid = r.insertId; }
    await db.query("INSERT INTO asset_files (item_id, kind, file_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE file_id = VALUES(file_id)", [id, kind, fid]);
  }
  // 덮어쓴 옛 로고는 옛 태그(공공기관·색 등)를 두고 이름·별칭만 더한다
  const rows = [...a.ko.map((t) => [t, "ko", "kw"]), ...a.en.map((t) => [t, "en", "kw"])];
  if (!old) await db.query("DELETE FROM asset_tags WHERE item_id = ?", [id]);
  const [r] = await db.query("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES " + rows.map(() => "(?,?,?,?)").join(","), rows.flatMap((x) => [id, ...x]));
  tags += r.affectedRows;
}
if (!DRY) await db.query("UPDATE asset_sets SET item_count = (SELECT COUNT(*) FROM asset_items WHERE set_id = ? AND deleted_at IS NULL) WHERE id = ?", [set.id, set.id]);
console.log(`${DRY ? "[DRY] " : ""}로고: 신규 ${created} · 갱신 ${updated} · 옛 로고 덮어씀 ${replaced}(옛 파일 지움 ${gone}) · 같은 그림 건너뜀 ${dup} · 태그 ${tags} / ${man.length}`);
await db.end();
