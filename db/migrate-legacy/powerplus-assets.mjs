// 파워플러스(옛 powerplus DB) → 플랫폼 새 표 이관. 기획 §16.2 · db-design §7.
//   node db/migrate-legacy/powerplus-assets.mjs [--dry] [--images=pro|free|internal]
// 원칙: 옛 DB 는 SELECT 만 · 새 표는 자연키(legacy_key 등) upsert · 3회 실행 수치 동일 · 끝에 건수 대조표.
// 환경: .env 의 LEGACY_POWERPLUS_URL(읽기 전용, 로컬 덤프 `powerplus_legacy`) · DATABASE_URL(새 DB) · STAFF_DOMAIN.
//
// 매핑
//   assets            → asset_items(legacy_key = 'pp:<id>') + asset_tags(ko/en, axis=kw) + core_files(bucket=legacy-powerplus, 경로 그대로) + asset_files
//                       visibility: ppt = internal(실제 제안서 — 영구 사내) / 나머지 = --images(기본 pro, 등급 분류는 P3 에서 관리자가 내린다)
//   style_group       → asset_sets(name = group, category) + item_count
//   usage_log(email)  → core_users(이메일 → staff/external) + asset_uses(channel=addin, ref_type='pp_usage', ref_id=옛 id)
//   user_favorites    → asset_favorites
//   search_logs       → asset_search_logs(channel=addin; 자연키 없어 q+created_at 으로 중복 방지)
//   content_requests  → asset_requests(title+created_at)
//   mcp_keys          → core_api_keys(legacy_source='powerplus', scopes=[assets], 해시 그대로 — 원문은 없어 재발급 안내)
//   sessions/auth_codes/visits/announcements → 이관하지 않음(전원 재로그인 · 공지는 플랫폼 공지로 새로)
import { existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import mysql from "mysql2/promise";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "1"]; }));
const DRY = args.has("dry");
const IMAGE_VIS = args.get("images") ?? "pro";
if (!["pro", "free", "internal", "public"].includes(IMAGE_VIS)) throw new Error("--images 는 pro|free|internal|public");

function conn(url) {
  const u = new URL(url);
  return mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4", dateStrings: true });
}
const old = await conn(process.env.LEGACY_POWERPLUS_URL ?? "mysql://root:root@127.0.0.1:3306/powerplus_legacy");
const db = await conn(process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/powerplus");
await old.query("SET SESSION TRANSACTION READ ONLY");
const STAFF = (process.env.STAFF_DOMAIN ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

// api/src/Core/Ids.php 와 같은 알파벳(혼동 글자 l·o·0·1 제외) — public_id CHAR(16)
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".ppt": "application/vnd.ms-powerpoint" };
const mimeOf = (p) => MIME[extname(p).toLowerCase()] ?? "application/octet-stream";
const parseTags = (s) => { if (Array.isArray(s)) return s; try { const v = JSON.parse(s ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }; // mysql2 는 JSON 컬럼을 이미 파싱해 준다
const normTag = (t) => String(t).normalize("NFC").trim().toLowerCase().slice(0, 64);
const q = async (sql, p = []) => (DRY && /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) ? [{ affectedRows: 0, insertId: 0 }] : db.query(sql, p);
const report = []; const say = (k, v) => { report.push([k, v]); console.log(`${k}: ${v}`); };

// ── 1. 사용자(옛 이메일 전부) ─────────────────────────────────────────────
const [emailRows] = await old.query(`SELECT DISTINCT email FROM (SELECT email FROM usage_log UNION SELECT email FROM user_favorites UNION SELECT email FROM search_logs UNION SELECT email FROM content_requests UNION SELECT created_by FROM mcp_keys) t WHERE email IS NOT NULL AND email <> ''`);
const userId = new Map();
let usersNew = 0;
for (const { email: raw } of emailRows) {
  const email = raw.trim().toLowerCase();
  const [[ex]] = await db.query("SELECT id FROM core_users WHERE email = ?", [email]);
  if (ex) { userId.set(email, ex.id); continue; }
  const kind = STAFF.includes(email.split("@")[1] ?? "") ? "staff" : "external";
  const [r] = await q("INSERT INTO core_users (public_id, email, name, kind) VALUES (?,?,?,?)", [pid(), email, email.split("@")[0].slice(0, 60), kind]);
  userId.set(email, r.insertId); usersNew++;
}
say("users (옛 이메일 → core_users)", `${emailRows.length} 중 신규 ${usersNew}`);

// ── 2. 세트(style_group) ───────────────────────────────────────────────────
const [groups] = await old.query("SELECT style_group g, category c, COUNT(*) n FROM assets WHERE style_group IS NOT NULL AND style_group <> '' GROUP BY style_group, category");
const setId = new Map(); let setsNew = 0;
for (const { g, c, n } of groups) {
  const key = `${c}|${g}`;
  const [[ex]] = await db.query("SELECT id FROM asset_sets WHERE name = ? AND category = ?", [g, c]);
  if (ex) { setId.set(key, ex.id); await q("UPDATE asset_sets SET item_count = ? WHERE id = ?", [n, ex.id]); continue; }
  const [r] = await q("INSERT INTO asset_sets (public_id, name, style, category, item_count) VALUES (?,?,?,?,?)", [pid(), g, g.split("-").slice(1).join("-") || null, c, n]);
  setId.set(key, r.insertId); setsNew++;
}
say("sets (style_group → asset_sets)", `${groups.length} 중 신규 ${setsNew}`);

// ── 3. 자산 ───────────────────────────────────────────────────────────────
async function fileId(path, w = null, h = null) {
  const [[ex]] = await db.query("SELECT id FROM core_files WHERE bucket = 'legacy-powerplus' AND path = ?", [path]);
  if (ex) return ex.id;
  const [r] = await q("INSERT INTO core_files (public_id, bucket, path, mime, visibility) VALUES (?,?,?,?,'internal')", [pid(), "legacy-powerplus", path, mimeOf(path)]);
  return r.insertId;
}
const [assets] = await old.query("SELECT * FROM assets ORDER BY created_at, id");
let itemsNew = 0, itemsUpd = 0, tagsN = 0, filesN = 0, skipped = [];
const itemId = new Map(); // 옛 id → 새 id
for (const a of assets) {
  const legacy = `pp:${a.id}`;
  // 로고는 옛 powerPlus 에서도 공개 API 로 누구나 받던 공공기관 로고 — public(powerDeck 로고 찾기가 로그인 없이 쓴다)
  const vis = a.category === "ppt" ? "internal" : a.category === "logo" ? "public" : IMAGE_VIS;
  if (!["icon", "photo", "illust", "diagram", "logo", "ppt"].includes(a.category)) { skipped.push(`${a.id}: 카테고리 ${a.category}`); continue; }
  if (!a.image_path && !a.slide_path) { skipped.push(`${a.id}: 파일 경로 없음`); continue; }
  const row = { visibility: vis, category: a.category, name: a.name?.slice(0, 200) ?? null, style_sig: a.style_sig ?? null, style_group: a.style_group ?? null, set_id: setId.get(`${a.category}|${a.style_group}`) ?? null, source: "powerplus", slide_kind: a.slide_kind || null, slide_page: a.slide_page || null, created_at: a.created_at ?? null };
  const [[ex]] = await db.query("SELECT id, visibility FROM asset_items WHERE legacy_key = ?", [legacy]);
  let id;
  if (ex) {
    id = ex.id;
    // visibility 는 운영에서 관리자가 바꿨을 수 있으니 재실행 때 덮지 않는다
    await q("UPDATE asset_items SET category=?, name=?, style_sig=?, style_group=?, set_id=?, slide_kind=?, slide_page=?, created_at=COALESCE(?, created_at) WHERE id=?", [row.category, row.name, row.style_sig, row.style_group, row.set_id, row.slide_kind, row.slide_page, row.created_at, id]);
    itemsUpd++;
  } else {
    const [r] = await q("INSERT INTO asset_items (public_id, visibility, category, name, style_sig, style_group, set_id, source, slide_kind, slide_page, legacy_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,COALESCE(?, NOW(3)))", [pid(), row.visibility, row.category, row.name, row.style_sig, row.style_group, row.set_id, row.source, row.slide_kind, row.slide_page, legacy, row.created_at]);
    id = r.insertId; itemsNew++;
  }
  itemId.set(a.id, id);
  if (DRY && !id) continue;
  // 파일 3종
  for (const [kind, p] of [["original", a.image_path], ["thumb", a.thumb_path], ["slide", a.slide_path]]) {
    if (!p) continue;
    const fid = await fileId(p);
    const [r] = await q("INSERT INTO asset_files (item_id, kind, file_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE file_id = VALUES(file_id)", [id, kind, fid]);
    if (r.affectedRows === 1) filesN++;
  }
  // 태그: ko/en 분리, 둘 다 비면 tags → ko
  let ko = parseTags(a.tags_ko), en = parseTags(a.tags_en);
  if (!ko.length && !en.length) ko = parseTags(a.tags);
  const rows = [...new Map([...ko.map((t) => [normTag(t) + "|ko", [id, normTag(t), "ko"]]), ...en.map((t) => [normTag(t) + "|en", [id, normTag(t), "en"]])]).values()].filter((r) => r[1]);
  if (rows.length) {
    await q("DELETE FROM asset_tags WHERE item_id = ? AND axis = 'kw'", [id]);
    const [r] = await q("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES " + rows.map(() => "(?,?,?,'kw')").join(","), rows.flat());
    tagsN += r.affectedRows;
  }
}
say("assets → asset_items", `옛 ${assets.length} → 신규 ${itemsNew} · 갱신 ${itemsUpd} · 제외 ${skipped.length}`);
say("asset_tags (kw)", tagsN); say("asset_files 신규", filesN);
if (skipped.length) say("제외 사유", skipped.slice(0, 10).join(" / ") + (skipped.length > 10 ? ` … +${skipped.length - 10}` : ""));

// ── 4. 삽입 기록 → asset_uses ─────────────────────────────────────────────
const [uses] = await old.query("SELECT id, asset_id, email, used_at FROM usage_log ORDER BY id");
let usesNew = 0, usesOrphan = 0;
for (const u of uses) {
  const iid = itemId.get(u.asset_id); if (!iid) { usesOrphan++; continue; }
  const [[ex]] = await db.query("SELECT id FROM asset_uses WHERE ref_type = 'pp_usage' AND ref_id = ?", [String(u.id)]);
  if (ex) continue;
  await q("INSERT INTO asset_uses (item_id, user_id, channel, ref_type, ref_id, created_at) VALUES (?,?,'addin','pp_usage',?,?)", [iid, userId.get((u.email ?? "").trim().toLowerCase()) ?? null, String(u.id), u.used_at]);
  usesNew++;
}
say("usage_log → asset_uses", `옛 ${uses.length} → 신규 ${usesNew} · 삭제된 자산 ${usesOrphan}`);

// ── 5. 즐겨찾기 ───────────────────────────────────────────────────────────
const [favs] = await old.query("SELECT email, asset_id, created_at FROM user_favorites");
let favNew = 0, favSkip = 0;
for (const f of favs) {
  const iid = itemId.get(f.asset_id), uid = userId.get((f.email ?? "").trim().toLowerCase());
  if (!iid || !uid) { favSkip++; continue; }
  const [r] = await q("INSERT IGNORE INTO asset_favorites (user_id, item_id, created_at) VALUES (?,?,?)", [uid, iid, f.created_at]);
  favNew += r.affectedRows;
}
say("user_favorites → asset_favorites", `옛 ${favs.length} → 신규 ${favNew} · 제외 ${favSkip}`);

// ── 6. 검색 로그 ──────────────────────────────────────────────────────────
const [logs] = await old.query("SELECT email, query, results, searched_at FROM search_logs ORDER BY id");
let logNew = 0;
for (const l of logs) {
  const [[ex]] = await db.query("SELECT id FROM asset_search_logs WHERE q = ? AND created_at = ? AND channel = 'addin'", [l.query.slice(0, 200), l.searched_at]);
  if (ex) continue;
  await q("INSERT INTO asset_search_logs (q, results, user_id, channel, day, created_at) VALUES (?,?,?,'addin',DATE(?),?)", [l.query.slice(0, 200), l.results, userId.get((l.email ?? "").trim().toLowerCase()) ?? null, l.searched_at, l.searched_at]);
  logNew++;
}
say("search_logs → asset_search_logs", `옛 ${logs.length} → 신규 ${logNew}`);

// ── 7. 콘텐츠 요청 ────────────────────────────────────────────────────────
const [reqs] = await old.query("SELECT email, type, title, description, link, status, created_at FROM content_requests ORDER BY id");
let reqNew = 0;
for (const r of reqs) {
  const [[ex]] = await db.query("SELECT id FROM asset_requests WHERE title = ? AND created_at = ?", [r.title.slice(0, 200), r.created_at]);
  if (ex) continue;
  const detail = [r.description, r.link ? `링크: ${r.link}` : null].filter(Boolean).join("\n") || null;
  const status = ["new", "done", "rejected"].includes(r.status) ? r.status : "new";
  await q("INSERT INTO asset_requests (public_id, user_id, title, kind, detail, status, source, created_at) VALUES (?,?,?,?,?,?,'user',?)", [pid(), userId.get((r.email ?? "").trim().toLowerCase()) ?? null, r.title.slice(0, 200), r.type?.slice(0, 20) ?? null, detail, status, r.created_at]);
  reqNew++;
}
say("content_requests → asset_requests", `옛 ${reqs.length} → 신규 ${reqNew}`);

// ── 8. MCP 키 → core_api_keys (해시만, 원문 없음 → 재발급 안내) ────────────
const [keys] = await old.query("SELECT name, key_hash, key_hint, created_by, created_at, last_used_at, revoked_at FROM mcp_keys");
let keyNew = 0, keySkip = 0;
for (const k of keys) {
  const uid = userId.get((k.created_by ?? "").trim().toLowerCase());
  if (!uid) { keySkip++; continue; }
  const [[ex]] = await db.query("SELECT id FROM core_api_keys WHERE key_hash = ?", [k.key_hash]);
  if (ex) continue;
  await q("INSERT INTO core_api_keys (public_id, user_id, name, prefix, key_hash, key_last4, scopes, legacy_source, last_used_at, revoked_at, created_at) VALUES (?,?,?,?,?,?,?,'powerplus',?,?,?)", [pid(), uid, k.name.slice(0, 60), (k.key_hint ?? "").slice(0, 12), k.key_hash, (k.key_hint ?? "").slice(-4).padStart(4, "?"), JSON.stringify(["assets"]), k.last_used_at, k.revoked_at, k.created_at]);
  keyNew++;
}
say("mcp_keys → core_api_keys", `옛 ${keys.length} → 신규 ${keyNew} · 소유자 없음 ${keySkip}`);

// ── 대조표 ────────────────────────────────────────────────────────────────
const [[tot]] = await db.query("SELECT (SELECT COUNT(*) FROM asset_items WHERE legacy_key LIKE 'pp:%') items,(SELECT COUNT(*) FROM asset_tags WHERE axis='kw') tags,(SELECT COUNT(*) FROM asset_sets) sets,(SELECT COUNT(*) FROM asset_uses WHERE ref_type='pp_usage') uses,(SELECT COUNT(*) FROM asset_favorites) favs,(SELECT COUNT(*) FROM asset_search_logs WHERE channel='addin') logs,(SELECT COUNT(*) FROM asset_requests) reqs,(SELECT COUNT(*) FROM core_api_keys WHERE legacy_source='powerplus') `apikeys`,(SELECT COUNT(*) FROM core_files WHERE bucket='legacy-powerplus') files");
const [vis] = await db.query("SELECT category, visibility, COUNT(*) n FROM asset_items WHERE legacy_key LIKE 'pp:%' GROUP BY category, visibility ORDER BY category");
console.log(`\n${DRY ? "[DRY] " : ""}새 DB 누계 — items ${tot.items} · tags ${tot.tags} · sets ${tot.sets} · files ${tot.files} · uses ${tot.uses} · favs ${tot.favs} · search ${tot.logs} · requests ${tot.reqs} · keys ${tot.apikeys}`);
console.log("visibility:", vis.map((v) => `${v.category}/${v.visibility}=${v.n}`).join(" "));
await old.end(); await db.end();
