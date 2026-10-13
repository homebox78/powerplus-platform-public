// 파워플러스 운영 활동 이관 — 삽입 기록·즐겨찾기·검색 로그·콘텐츠 요청·MCP 키 (운영 powerplus 전체 덤프 기준)
//   node db/migrate-legacy/powerplus-activity.mjs [--dry]
// 원천: LEGACY_PP_FULL_URL(운영 powerplus 덤프, 읽기 전용) · 대상: DATABASE_URL. users.mjs 다음에 돌린다(사용자는 이메일로 찾기만 한다).
//
// powerplus-assets.mjs 가 로컬 부분 덤프(powerplus_legacy)로 같은 표를 이미 넣었다. 중복이 생기지 않게 자연키를 그 스크립트와 똑같이 쓴다:
//   usage_log      → asset_uses        (ref_type='pp_usage', ref_id=옛 id)
//   user_favorites → asset_favorites   (PK user_id,item_id — INSERT IGNORE)
//   search_logs    → asset_search_logs (channel='addin', q + created_at)
//   content_requests → asset_requests  (title + created_at)
//   mcp_keys       → core_api_keys     (key_hash UNIQUE, legacy_source='powerplus')
// 자산 매핑: 옛 assets.id → asset_items.legacy_key = 'pp:<id>'. 중복 병합(dedupe.mjs)으로 홈박스 샘플이 붙은 행도 legacy_key 는 'pp:' 그대로라 이 한 열로 충분.
//   (sha 동일로 소프트 삭제된 11행도 행은 남아 있어 매핑된다.) 매핑이 없으면(옛 운영에서 지운 자산) 건너뛰고 '삭제된 자산'으로 센다.
// 사용자: 이메일 → core_users(users.mjs 가 만든 것). 이메일 형식이 아니거나 계정이 없으면 user_id NULL(기록은 남김), 즐겨찾기·키는 건너뜀.
import { DRY, source, target, finish, pid, normEmail, userIdByEmail, say, head } from "./lib.mjs";

const old = await source("LEGACY_PP_FULL_URL");
const db = await target();

const [items] = await db.query("SELECT id, legacy_key FROM asset_items WHERE legacy_key LIKE 'pp:%'");
const itemId = new Map(items.map((r) => [r.legacy_key.slice(3), r.id]));
const uidOf = (e) => userIdByEmail(db, normEmail(e));
// ORPHAN_OWNER=이메일 — 소유자를 못 찾은 행(옛 사용자가 플랫폼에 없음)을 이 계정에 붙인다(사용자 2026-10-06 "superadmin 한테 다 붙여놔"). 없으면 건너뜀.
const orphanUid = process.env.ORPHAN_OWNER ? await userIdByEmail(db, process.env.ORPHAN_OWNER) : null;
if (process.env.ORPHAN_OWNER && !orphanUid) throw new Error("ORPHAN_OWNER 계정 없음");

// 1. 삽입 기록
const [uses] = await old.query("SELECT id, asset_id, email, used_at FROM usage_log ORDER BY id");
const [exU] = await db.query("SELECT ref_id FROM asset_uses WHERE ref_type = 'pp_usage'");
const haveU = new Set(exU.map((r) => r.ref_id));
let usesNew = 0, usesOrphan = 0;
for (const u of uses) {
  if (haveU.has(String(u.id))) continue;
  const iid = itemId.get(String(u.asset_id)); if (!iid) { usesOrphan++; continue; }
  await db.query("INSERT INTO asset_uses (item_id, user_id, channel, ref_type, ref_id, created_at) VALUES (?,?,'addin','pp_usage',?,?)", [iid, await uidOf(u.email), String(u.id), u.used_at]);
  usesNew++;
}

// 2. 즐겨찾기
const [favs] = await old.query("SELECT email, asset_id, created_at FROM user_favorites");
let favNew = 0, favSkip = 0;
for (const f of favs) {
  const iid = itemId.get(String(f.asset_id)), uid = await uidOf(f.email);
  if (!iid || !uid) { favSkip++; continue; }
  const [r] = await db.query("INSERT IGNORE INTO asset_favorites (user_id, item_id, created_at) VALUES (?,?,?)", [uid, iid, f.created_at]);
  favNew += r.affectedRows;
}

// 3. 검색 로그 (자연키 q + created_at, channel=addin)
const [logs] = await old.query("SELECT email, query, results, searched_at FROM search_logs ORDER BY id");
const [exL] = await db.query("SELECT q, created_at FROM asset_search_logs WHERE channel = 'addin'");
const haveL = new Set(exL.map((r) => `${r.q}|${String(r.created_at).slice(0, 19)}`));
let logNew = 0;
for (const l of logs) {
  const q = String(l.query ?? "").slice(0, 200);
  const k = `${q}|${String(l.searched_at).slice(0, 19)}`;
  if (haveL.has(k)) continue;
  haveL.add(k);
  await db.query("INSERT INTO asset_search_logs (q, results, user_id, channel, day, created_at) VALUES (?,?,?,'addin',DATE(?),?)", [q, l.results ?? 0, await uidOf(l.email), l.searched_at, l.searched_at]);
  logNew++;
}

// 4. 콘텐츠 요청
const [reqs] = await old.query("SELECT email, type, title, description, link, status, created_at FROM content_requests ORDER BY id");
let reqNew = 0;
for (const r of reqs) {
  const title = String(r.title ?? "").slice(0, 200);
  const [[ex]] = await db.query("SELECT id FROM asset_requests WHERE title = ? AND created_at = ?", [title, r.created_at]);
  if (ex) continue;
  const detail = [r.description, r.link ? `링크: ${r.link}` : null].filter(Boolean).join("\n") || null;
  const status = ["new", "done", "rejected"].includes(r.status) ? r.status : "new";
  await db.query("INSERT INTO asset_requests (public_id, user_id, title, kind, detail, status, source, created_at) VALUES (?,?,?,?,?,?,'user',?)", [pid(), await uidOf(r.email), title, r.type?.slice(0, 20) ?? null, detail, status, r.created_at]);
  reqNew++;
}

// 5. MCP 키(해시만 — 원문이 없어 다시 보기는 안 된다. 쓰던 키는 해시로 계속 통과)
const [keys] = await old.query("SELECT name, key_hash, key_hint, created_by, created_at, last_used_at, revoked_at FROM mcp_keys");
let keyNew = 0, keySkip = 0;
for (const k of keys) {
  const uid = (await uidOf(k.created_by)) ?? orphanUid;
  if (!uid) { keySkip++; continue; }
  const [r] = await db.query("INSERT IGNORE INTO core_api_keys (public_id, user_id, name, prefix, key_hash, key_last4, scopes, legacy_source, last_used_at, revoked_at, created_at) VALUES (?,?,?,?,?,?,?,'powerplus',?,?,?)",
    [pid(), uid, String(k.name).slice(0, 60), (k.key_hint ?? "").slice(0, 12), k.key_hash, (k.key_hint ?? "").slice(-4).padStart(4, "?"), JSON.stringify(["assets"]), k.last_used_at, k.revoked_at, k.created_at]);
  keyNew += r.affectedRows;
}

head("파워플러스 활동(powerplus-activity.mjs)");
say("usage_log → asset_uses", `옛 ${uses.length} → 신규 ${usesNew} · 삭제된 자산 ${usesOrphan}`);
say("user_favorites → asset_favorites", `옛 ${favs.length} → 신규 ${favNew} · 제외 ${favSkip}`);
say("search_logs → asset_search_logs", `옛 ${logs.length} → 신규 ${logNew}`);
say("content_requests → asset_requests", `옛 ${reqs.length} → 신규 ${reqNew}`);
say("mcp_keys → core_api_keys", `옛 ${keys.length} → 신규 ${keyNew} · 소유자 없음 ${keySkip}`);
await finish(db, old);
