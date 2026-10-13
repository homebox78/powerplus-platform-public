// 홈박스 운영 활동 이관 — MCP 키·커뮤니티(글·댓글·좋아요)·포인트 원장·알림·컬렉션·요청·삭제요청
//   node db/migrate-legacy/homebox-activity.mjs [--dry]
// 원천: LEGACY_HB_FULL_URL(운영 homebox 덤프, 읽기 전용) · 대상: DATABASE_URL. users.mjs 다음, homebox-mockups.mjs 앞(키 매핑을 시안이 쓴다).
//
// 사용자 매핑: 홈박스 users.id → 이메일(가짜 메일은 플랫폼 형식으로 바꿔) → core_users. 개발용 로컬 계정(@homebox.local)이나
//   이미 지워져 users 에 없는 옛 id 가 주인인 행은 건너뛰고 '주인 없음'으로 센다(포인트·알림·컬렉션·요청 모두 같은 규칙).
// 멱등 열쇠
//   api_keys          → core_api_keys     key_hash UNIQUE, legacy_source='homebox', scopes=["mock"] (key_enc 는 홈박스 비밀로 암호화돼 버림 → 다시 보기 불가, 해시로 계속 통과)
//   community_posts   → comm_posts        legacy_key 'hb:post:<id>' (분류 id 는 두 서비스가 같다, module='mock', site_slug 는 본문 끝 한 줄로)
//   community_comments→ comm_comments     legacy_key 'hb:cmt:<id>'
//   community_likes   → comm_likes        PK(post_id,user_id)
//   point_ledger      → core_point_ledger UNIQUE(user,reason,ref_type,ref_id) — ref_type='hb_point', ref_id=옛 id, delta 는 옛 값 그대로(잔액 보존),
//                                          reason 은 플랫폼 이름으로(아래 REASON)
//   notifications     → core_notifications legacy_key 'hb:notif:<id>', 링크는 플랫폼 경로로(아래 LINK)
//   collections(+items) → core_collections legacy_key 'hb:coll:<id>' — 항목이 site/screen/section/component 라 플랫폼 대상(asset·gallery·post)이 없어
//                                          항목은 옮기지 않고 메모 끝에 '옛 홈박스 항목 N개' 만 남긴다
//   requests          → core_contacts     legacy_key 'hb:req:<id>', topic='hb_<kind>', module='mock'(기관 수정·수행사 제보·새 기관 요청)
//   removal_requests  → core_removal_requests legacy_key 'hb:rm:<id>', no=옛 ticket_no(겹치면 건너뜀), content_type='mock_<target_type>'
import { source, target, finish, pid, normEmail, isEmail, fakeMail, isDevLocal, say, head } from "./lib.mjs";

const hb = await source("LEGACY_HB_FULL_URL");
const db = await target();

const REASON = { welcome: "signup", daily: "attend", gallery_made: "mockup_keep", gallery_share: "mockup_share", gallery_like: "like_received",
  gallery_royalty: "mockup_royalty", community_post: "post", community_reply: "comment", gallery_unlock: "use_mockup_open" };
const LINK = (l) => {
  if (!l) return null;
  if (/^\/gallery\?view=mine/.test(l)) return "/mock/mockups";
  if (/^\/gallery/.test(l)) return "/mock" + l;
  if (/^\/community/.test(l)) return l;
  if (/^\/(sites|screens|sections|search|collections)/.test(l)) return null; // 수집 레퍼런스 화면은 공개 메뉴에서 빠짐(§20)
  return l;
};

// 홈박스 사용자 id → { uid, email, name }
const [hbUsers] = await hb.query("SELECT id, email, name FROM users");
const who = new Map();
for (const u of hbUsers) {
  let e = normEmail(u.email);
  const f = fakeMail(e); if (f) e = f.email;
  if (!f && (!isEmail(e) || isDevLocal(e))) continue;
  const [[r]] = await db.query("SELECT id FROM core_users WHERE email = ?", [e]);
  if (r) who.set(u.id, { uid: r.id, email: e, name: u.name || e.split("@")[0] });
}
const U = (id) => who.get(Number(id))?.uid ?? null;
// ORPHAN_OWNER=이메일 — 소유자를 못 찾은 행(옛 사용자가 플랫폼에 없음)을 이 계정에 붙인다(사용자 2026-10-06 "superadmin 한테 다 붙여놔"). 없으면 건너뜀.
const orphanUid = process.env.ORPHAN_OWNER ? (await db.query("SELECT id, email, name FROM core_users WHERE email = ? AND deleted_at IS NULL", [process.env.ORPHAN_OWNER]))[0][0] ?? null : null;
if (process.env.ORPHAN_OWNER && !orphanUid) throw new Error("ORPHAN_OWNER 계정 없음");

// ── MCP 키 ────────────────────────────────────────────────────────────────
const [keys] = await hb.query("SELECT * FROM api_keys");
let keyNew = 0, keySkip = 0;
for (const k of keys) {
  const uid = (k.owner_type === "user" ? U(k.owner_id) : null) ?? orphanUid?.id ?? null;
  if (!uid) { keySkip++; continue; }
  const [r] = await db.query("INSERT IGNORE INTO core_api_keys (public_id, user_id, name, prefix, key_hash, key_last4, scopes, legacy_source, expires_at, last_used_at, revoked_at, created_at) VALUES (?,?,?,?,?,?,?,'homebox',?,?,?,?)",
    [pid(), uid, String(k.name).slice(0, 60), String(k.prefix ?? "").slice(0, 12), k.key_hash, String(k.key_last4 ?? "????").padStart(4, "?"), JSON.stringify(["mock"]), k.expires_at, k.last_used_at, k.revoked_at, k.created_at]);
  keyNew += r.affectedRows;
}

// ── 커뮤니티 ──────────────────────────────────────────────────────────────
const [posts] = await hb.query("SELECT * FROM community_posts ORDER BY id");
const postId = new Map();
let postNew = 0, postSkip = 0;
for (const p of posts) {
  const uid = U(p.user_id); if (!uid) { postSkip++; continue; }
  const key = `hb:post:${p.id}`;
  const body = p.site_slug ? `${p.body}\n\n(옛 홈박스 관련 기관: ${p.site_slug})` : p.body;
  const [[ex]] = await db.query("SELECT id FROM comm_posts WHERE legacy_key = ?", [key]);
  if (ex) { postId.set(p.id, ex.id); continue; }
  const [r] = await db.query("INSERT INTO comm_posts (public_id, owner_user_id, visibility, category, title, body, module, pinned, comment_count, like_count, view_count, legacy_key, created_at, updated_at, deleted_at) VALUES (?,?,'public',?,?,?,'mock',?,?,?,?,?,?,?,?)",
    [pid(), uid, p.category, p.title, body, p.pinned ? 1 : 0, p.comment_count, p.like_count, p.view_count, key, p.created_at, p.updated_at, p.deleted_at]);
  postId.set(p.id, r.insertId); postNew++;
}
const [cmts] = await hb.query("SELECT * FROM community_comments ORDER BY id");
let cmtNew = 0, cmtSkip = 0;
for (const c of cmts) {
  const pidNew = postId.get(c.post_id), uid = U(c.user_id);
  if (!pidNew || !uid) { cmtSkip++; continue; }
  const [r] = await db.query("INSERT IGNORE INTO comm_comments (post_id, user_id, body, legacy_key, created_at, deleted_at) VALUES (?,?,?,?,?,?)", [pidNew, uid, c.body, `hb:cmt:${c.id}`, c.created_at, c.deleted_at]);
  cmtNew += r.affectedRows;
}
const [likes] = await hb.query("SELECT * FROM community_likes");
let likeNew = 0, likeSkip = 0;
for (const l of likes) {
  const pidNew = postId.get(l.post_id), uid = U(l.user_id);
  if (!pidNew || !uid) { likeSkip++; continue; }
  const [r] = await db.query("INSERT IGNORE INTO comm_likes (post_id, user_id, created_at) VALUES (?,?,?)", [pidNew, uid, l.created_at]);
  likeNew += r.affectedRows;
}

// ── 포인트 원장 ────────────────────────────────────────────────────────────
const [pts] = await hb.query("SELECT * FROM point_ledger ORDER BY id");
let ptNew = 0, ptSkip = 0;
for (const p of pts) {
  const uid = U(p.user_id); if (!uid) { ptSkip++; continue; }
  const reason = REASON[p.reason] ?? `hb_${p.reason}`.slice(0, 40);
  const [r] = await db.query("INSERT IGNORE INTO core_point_ledger (user_id, delta, reason, ref_type, ref_id, created_at) VALUES (?,?,?,'hb_point',?,?)", [uid, p.delta, reason, String(p.id), p.created_at]);
  ptNew += r.affectedRows;
}

// ── 알림 ───────────────────────────────────────────────────────────────────
const [nots] = await hb.query("SELECT * FROM notifications ORDER BY id");
let notNew = 0, notSkip = 0;
for (const n of nots) {
  const uid = U(n.user_id); if (!uid) { notSkip++; continue; }
  const body = n.body ? String(n.body).replace("갤러리 [내 시안] 에서", "시안 메뉴에서 갤러리에") : null;
  const [r] = await db.query("INSERT IGNORE INTO core_notifications (user_id, kind, title, body, link, read_at, legacy_key, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [uid, String(n.kind).slice(0, 40), n.title, body, LINK(n.link), n.read_at, `hb:notif:${n.id}`, n.created_at]);
  notNew += r.affectedRows;
}

// ── 컬렉션 ────────────────────────────────────────────────────────────────
const [colls] = await hb.query("SELECT c.*, (SELECT COUNT(*) FROM collection_items i WHERE i.collection_id = c.id) n FROM collections c ORDER BY id");
let colNew = 0, colSkip = 0, colItemsDropped = 0;
for (const c of colls) {
  const uid = (c.owner_type === "user" ? U(c.owner_id) : null) ?? orphanUid?.id ?? null;
  if (!uid) { colSkip++; continue; }
  const memo = [c.memo, c.n ? `(옛 홈박스 컬렉션 — 기관·화면 항목 ${c.n}개는 플랫폼에 대응 메뉴가 없어 옮기지 않음)` : null].filter(Boolean).join("\n").slice(0, 2000) || null;
  const [r] = await db.query("INSERT IGNORE INTO core_collections (public_id, owner_user_id, visibility, name, memo, is_default, legacy_key, created_at, updated_at) VALUES (?,?,'private',?,?,0,?,?,?)",
    [pid(), uid, c.name, memo, `hb:coll:${c.id}`, c.created_at, c.updated_at]);
  colNew += r.affectedRows; colItemsDropped += Number(c.n);
}

// ── 요청(기관 수정·수행사 제보·새 기관·문의) → core_contacts ──────────────
const [reqs] = await hb.query("SELECT * FROM requests ORDER BY id");
const STATUS = { open: "open", accepted: "answered", done: "answered", rejected: "closed" };
let reqNew = 0, reqSkip = 0;
for (const q of reqs) {
  const w = who.get(Number(q.user_id)) ?? (orphanUid ? { uid: orphanUid.id, email: orphanUid.email, name: orphanUid.name || orphanUid.email.split("@")[0] } : null); if (!w) { reqSkip++; continue; }
  let payload = q.payload; try { payload = JSON.stringify(JSON.parse(q.payload), null, 1); } catch { /* 원문 그대로 */ }
  const msg = [`[옛 홈박스 ${q.kind}]${q.site_id ? ` 기관 #${q.site_id}` : ""}`, payload, q.admin_note ? `관리자 메모: ${q.admin_note}` : null].filter(Boolean).join("\n");
  const [r] = await db.query("INSERT IGNORE INTO core_contacts (public_id, user_id, topic, module, name, email, message, status, handled_at, legacy_key, created_at) VALUES (?,?,?,'mock',?,?,?,?,?,?,?)",
    [pid(), w.uid, `hb_${q.kind}`.slice(0, 20), w.name.slice(0, 60), w.email, msg, STATUS[q.status] ?? "open", q.handled_at, `hb:req:${q.id}`, q.created_at]);
  reqNew += r.affectedRows;
}

// ── 삭제요청 ──────────────────────────────────────────────────────────────
const [rms] = await hb.query("SELECT * FROM removal_requests ORDER BY id");
const RM = { received: "received", reviewing: "reviewing", removed: "done", rejected: "rejected" };
let rmNew = 0, rmSkip = 0;
for (const m of rms) {
  const [[ex]] = await db.query("SELECT legacy_key FROM core_removal_requests WHERE no = ?", [m.ticket_no]);
  if (ex) { if (ex.legacy_key !== `hb:rm:${m.id}`) rmSkip++; continue; }
  await db.query("INSERT INTO core_removal_requests (no, content_type, content_id, claimant_name, claimant_org, requester_email, claimant_phone, target_url, reason_kind, reason, status, due_at, handled_at, resolution, legacy_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [m.ticket_no, `mock_${m.target_type}`, String(m.target_id ?? ""), m.claimant_name, m.claimant_org, m.claimant_email, m.claimant_phone, m.target_url, m.reason, m.detail ?? "", RM[m.status] ?? "received", m.due_at, m.handled_at, m.resolution, `hb:rm:${m.id}`, m.created_at]);
  rmNew++;
}

head("홈박스 활동(homebox-activity.mjs)");
say("api_keys → core_api_keys", `옛 ${keys.length} → 신규 ${keyNew} · 주인 없음 ${keySkip}`);
say("community_posts → comm_posts", `옛 ${posts.length} → 신규 ${postNew} · 주인 없음 ${postSkip}`);
say("community_comments → comm_comments", `옛 ${cmts.length} → 신규 ${cmtNew} · 제외 ${cmtSkip}`);
say("community_likes → comm_likes", `옛 ${likes.length} → 신규 ${likeNew} · 제외 ${likeSkip}`);
say("point_ledger → core_point_ledger", `옛 ${pts.length} → 신규 ${ptNew} · 주인 없음 ${ptSkip}`);
say("notifications → core_notifications", `옛 ${nots.length} → 신규 ${notNew} · 주인 없음 ${notSkip}`);
say("collections → core_collections", `옛 ${colls.length} → 신규 ${colNew} · 주인 없음 ${colSkip} · 옮기지 않은 항목 ${colItemsDropped}`);
say("requests → core_contacts", `옛 ${reqs.length} → 신규 ${reqNew} · 주인 없음 ${reqSkip}`);
say("removal_requests → core_removal_requests", `옛 ${rms.length} → 신규 ${rmNew} · 접수번호 겹침 ${rmSkip}`);
await finish(db, hb);
