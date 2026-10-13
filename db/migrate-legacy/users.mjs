// 사용자 이관 — 파워플러스·파워덱(이메일 OTP)·홈박스(세션 + 소셜) 계정을 core_users 하나로 합친다.
//   node db/migrate-legacy/users.mjs [--dry]
// 원천(읽기 전용, .env): LEGACY_PP_FULL_URL(운영 powerplus 덤프) · LEGACY_DECK_URL(운영 powerdeck 덤프) · LEGACY_HB_FULL_URL(운영 homebox 덤프)
// 대상: DATABASE_URL. 반드시 다른 활동 이관보다 먼저(run-all.mjs 1번).
//
// 병합 규칙
//  1. 열쇠 = 이메일(trim·소문자). 같은 이메일은 한 행. 회사 메일(STAFF_DOMAIN)이면 kind=staff, 아니면 external.
//     이미 있는 행의 kind 는 external→staff 로 올리기만 한다(내리지 않음).
//  2. 파워플러스·파워덱 사용자는 OTP 로 이메일을 검증한 사람 → core_user_logins(provider=email, uid=email, verified=1).
//     원천에 사용자 표가 없어 visits·sessions·사용/검색 기록·키 소유자의 이메일을 모은다. 이메일 형식이 아니면 버린다
//     (예: 옛 MCP 키 사용 기록에 키 이름이 email 칸에 들어간 행).
//  3. 홈박스 users + oauth_accounts → 소셜 로그인 행. google 은 검증된 메일(verified=1)이라 같은 이메일 계정에 붙인다.
//     naver·kakao 이메일은 검증 보장이 없어(G29) 다른 계정과 이메일이 겹치면 로그인을 붙이지 않고 '보류'로 센다.
//  4. 가짜 메일: 홈박스 `<provider>-<uid>@noemail.homebox.local` → 플랫폼 `<provider>-<uid>@noemail.local`(api/src/Core/Users.php 와 같은 형식)
//     + 로그인 행(provider,uid, email NULL, verified 0). 그 사람이 플랫폼에서 같은 소셜로 로그인하면 이 행을 찾는다.
//  5. 개발용 로컬 계정(@homebox.local·*.test 등, noemail 제외)은 사람이 아니라 이관하지 않는다 — 그 계정 소유 콘텐츠도 다른 스크립트가 건너뛴다.
//  6. 홈박스 role=admin → core_user_roles(admin). superadmin 은 코드 상수(Users.php)가 로그인 때 보장하므로 여기서 주지 않는다.
//  7. 이름·사진은 비어 있을 때만 채운다(플랫폼에서 바꾼 값 보존). 가입일 = 가장 이른 값, 마지막 접속 = 가장 늦은 값.
//     사진은 http(s) 주소만(옛 서버 내부 경로는 버림).
import { DRY, source, target, finish, pid, normEmail, isEmail, isStaff, fakeMail, isDevLocal, say, head } from "./lib.mjs";

const pp = await source("LEGACY_PP_FULL_URL");
const dk = await source("LEGACY_DECK_URL");
const hb = await source("LEGACY_HB_FULL_URL");
const db = await target();

/** 사람 하나: email → { first, last, name, avatar, prefs, deleted, logins:[{provider,uid,email,verified}], admin } */
const people = new Map();
let badEmail = 0, devSkip = 0;
function person(email) {
  if (!people.has(email)) people.set(email, { first: null, last: null, name: null, avatar: null, prefs: null, deleted: null, logins: [], admin: false, src: new Set() });
  return people.get(email);
}
const minD = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
const maxD = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

// ── 파워플러스·파워덱: 이메일이 보인 모든 곳 ─────────────────────────────
async function otpUsers(c, label, sql) {
  const [rows] = await c.query(sql);
  for (const r of rows) {
    const e = normEmail(r.email);
    if (!e) continue;
    if (!isEmail(e)) { badEmail++; continue; }
    if (isDevLocal(e)) { devSkip++; continue; }
    const p = person(e);
    p.first = minD(p.first, r.first); p.last = maxD(p.last, r.last); p.src.add(label);
    if (!p.logins.some((l) => l.provider === "email")) p.logins.push({ provider: "email", uid: e, email: e, verified: 1 });
  }
}
await otpUsers(pp, "pp", `SELECT email, MIN(f) first, MAX(l) last FROM (
  SELECT email, visited_at f, visited_at l FROM visits
  UNION ALL SELECT email, created_at, last_used_at FROM sessions
  UNION ALL SELECT email, used_at, NULL FROM usage_log
  UNION ALL SELECT email, searched_at, NULL FROM search_logs
  UNION ALL SELECT email, created_at, NULL FROM user_favorites
  UNION ALL SELECT email, created_at, NULL FROM content_requests
  UNION ALL SELECT created_by, created_at, last_used_at FROM mcp_keys) t GROUP BY email`);
await otpUsers(dk, "deck", `SELECT email, MIN(f) first, MAX(l) last FROM (
  SELECT email, created_at f, last_used_at l FROM sessions
  UNION ALL SELECT email, created_at, created_at FROM jobs
  UNION ALL SELECT email, created_at, NULL FROM uploads
  UNION ALL SELECT email, created_at, NULL FROM job_comments
  UNION ALL SELECT email, created_at, NULL FROM job_comment_replies
  UNION ALL SELECT email, created_at, NULL FROM job_docs
  UNION ALL SELECT email, created_at, NULL FROM ai_usage
  UNION ALL SELECT email, created_at, NULL FROM ai_tasks
  UNION ALL SELECT email, updated_at, NULL FROM ai_user_keys) t GROUP BY email`);

// ── 홈박스 ────────────────────────────────────────────────────────────────
const [hbUsers] = await hb.query("SELECT * FROM users");
const [hbLogins] = await hb.query("SELECT user_id, provider, provider_uid FROM oauth_accounts");
for (const u of hbUsers) {
  let e = normEmail(u.email);
  const fake = fakeMail(e);
  if (!fake && (!isEmail(e) || isDevLocal(e))) { devSkip++; continue; }
  if (fake) e = fake.email;
  const p = person(e);
  p.src.add("hb");
  p.first = minD(p.first, u.created_at); p.last = maxD(p.last, u.last_login_at);
  p.name ??= u.name || null;
  if (/^https?:\/\//.test(u.avatar_url ?? "")) p.avatar ??= u.avatar_url.slice(0, 500);
  p.prefs ??= u.prefs ?? null;
  p.deleted ??= u.deleted_at ?? null;
  if (u.role === "admin") p.admin = true;
  for (const l of hbLogins.filter((x) => x.user_id === u.id)) {
    const verified = l.provider === "google" || l.provider === "email" ? 1 : 0;
    p.logins.push({ provider: l.provider, uid: l.provider === "email" ? e : l.provider_uid, email: fake ? null : e, verified, hb: true });
  }
  if (fake && !p.logins.some((l) => l.provider === fake.provider)) p.logins.push({ provider: fake.provider, uid: fake.uid, email: null, verified: 0, hb: true });
}

// ── 쓰기 ──────────────────────────────────────────────────────────────────
let ins = 0, upd = 0, loginNew = 0, loginHold = 0, roleNew = 0, staffN = 0;
for (const [email, p] of people) {
  const kind = isStaff(email) ? "staff" : "external";
  if (kind === "staff") staffN++;
  // 이 사람의 소셜 로그인 행이 이미 다른 계정에 붙어 있으면 그 계정이 기준
  let uid = null;
  for (const l of p.logins) {
    const [[r]] = await db.query("SELECT user_id FROM core_user_logins WHERE provider = ? AND provider_uid = ?", [l.provider, l.uid]);
    if (r) { uid = r.user_id; break; }
  }
  if (!uid) { const [[r]] = await db.query("SELECT id FROM core_users WHERE email = ?", [email]); uid = r?.id ?? null; }
  const name = (p.name ?? email.split("@")[0]).slice(0, 60) || "사용자";
  if (!uid) {
    const [r] = await db.query("INSERT INTO core_users (public_id, email, name, avatar_url, kind, prefs, last_seen_at, created_at, deleted_at) VALUES (?,?,?,?,?,?,?,COALESCE(?, NOW(3)),?)",
      [pid(), email, name, p.avatar, kind, p.prefs, p.last, p.first, p.deleted]);
    uid = r.insertId; ins++;
  } else {
    await db.query(`UPDATE core_users SET
        kind = IF(kind = 'external' AND ? = 'staff', 'staff', kind),
        avatar_url = COALESCE(avatar_url, ?), prefs = COALESCE(prefs, ?),
        created_at = IF(? IS NOT NULL AND ? < created_at, ?, created_at),
        last_seen_at = IF(last_seen_at IS NULL OR (? IS NOT NULL AND ? > last_seen_at), COALESCE(?, last_seen_at), last_seen_at)
      WHERE id = ?`, [kind, p.avatar, p.prefs, p.first, p.first, p.first, p.last, p.last, p.last, uid]);
    upd++;
  }
  for (const l of p.logins) {
    const [[ex]] = await db.query("SELECT user_id FROM core_user_logins WHERE provider = ? AND provider_uid = ?", [l.provider, l.uid]);
    if (ex) continue;
    // 미검증 이메일(네이버·카카오)인데 그 이메일 계정이 원래 다른 출처(OTP)로 있던 경우 — 붙이지 않는다(G29)
    if (!l.verified && l.email && (p.src.has("pp") || p.src.has("deck"))) { loginHold++; continue; }
    await db.query("INSERT INTO core_user_logins (user_id, provider, provider_uid, email, email_verified, linked_at, last_login_at) VALUES (?,?,?,?,?,COALESCE(?, NOW(3)),?)",
      [uid, l.provider, l.uid, l.email, l.verified, p.first, p.last]);
    loginNew++;
  }
  if (p.admin) {
    const [r] = await db.query("INSERT IGNORE INTO core_user_roles (user_id, role, granted_by) VALUES (?, 'admin', NULL)", [uid]);
    roleNew += r.affectedRows;
  }
}

head("사용자(users.mjs)");
say("원천 사람 수(이메일 기준 병합 후)", `${people.size} (staff ${staffN} · external ${people.size - staffN})`);
say("core_users", `신규 ${ins} · 기존 갱신 ${upd}`);
say("core_user_logins", `신규 ${loginNew} · 보류(미검증 메일 겹침) ${loginHold}`);
say("core_user_roles(admin)", `신규 ${roleNew}`);
say("제외", `이메일 형식 아님 ${badEmail} · 개발용 로컬 계정 ${devSkip}`);
await finish(db, pp, dk, hb);
