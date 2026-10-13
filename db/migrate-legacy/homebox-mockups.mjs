// 홈박스 시안·갤러리 이관 — mockup_pages·gallery_items·gallery_likes·gallery_unlocks → mock_mockups·mock_gallery·mock_gallery_likes·mock_gallery_unlocks
//   node db/migrate-legacy/homebox-mockups.mjs [--dry] [--owner=이메일]
// 원천: LEGACY_HB_FULL_URL(운영 homebox 덤프, 읽기 전용 — 없으면 LEGACY_HOMEBOX_URL) · 대상: DATABASE_URL
// 순서: users.mjs → homebox-activity.mjs(MCP 키) → 이 스크립트.
//
// 소유자 = 실제 만든 사람(2026-10-06 수정 — 예전엔 '가장 최근 staff 한 명'에 몰아 줬다)
//   1) mockup_pages.api_key_id → 옛 api_keys.owner_id(user) → 이메일 → core_users
//   2) 없으면 같은 token 의 gallery_items.user_id
//   3) 그래도 없으면 이미 들어 있는 행의 소유자 유지 → 없으면 --owner → 없으면 NULL(소유자 없음 — 관리자만 본다)
//   api_key_id 는 옛 키 해시로 core_api_keys(legacy_source=homebox) 를 찾아 잇는다.
// 멱등: mock_mockups.token UNIQUE · mock_gallery.mockup_id UNIQUE · 좋아요/열람 PK(gallery_id,user_id). 좋아요·열람은 실제 누른 사람으로(주인 없는 행은 건너뜀).
// 썸네일 파일: 옛 storage/gallery/<옛 갤러리 id>.jpg → 플랫폼 storage/mock/gallery/<새 갤러리 id>.jpg. id 가 바뀌므로 그대로 복사하면 안 된다.
//   LEGACY_HB_GALLERY_DIR 를 주면 그 폴더에서 복사하고 has_thumb 를 파일 존재로 정한다. 비우면 복사하지 않고 원천 has_thumb 를 그대로 두며,
//   옛 id → 새 id 표를 db/migrate-legacy/out/hb-gallery-thumbs.tsv 로 쓴다(운영 서버에서 그 표대로 cp — 보고서 절차 참고).
//   ⚠ 로컬 D:/homebox-handoff/storage/gallery 는 로컬 개발 DB 의 id 라 운영 덤프와 번호가 다르다 — 운영 원천일 때 쓰지 말 것.
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DRY, args, root, source, target, finish, pid, normEmail, isEmail, fakeMail, isDevLocal, say, head } from "./lib.mjs";

const old = process.env.LEGACY_HB_FULL_URL ? await source("LEGACY_HB_FULL_URL") : await source("LEGACY_HOMEBOX_URL");
const db = await target();
const THUMB_DIR = process.env.LEGACY_HB_GALLERY_DIR || "";
const ownerArg = args.get("owner") ?? "";

let FALLBACK = null;
if (ownerArg) {
  const [[o]] = await db.query("SELECT id FROM core_users WHERE email = ? AND deleted_at IS NULL", [normEmail(ownerArg)]);
  if (!o) throw new Error("--owner 계정을 못 찾았습니다");
  FALLBACK = o.id;
}

// 옛 사용자 → 플랫폼 사용자
const [hbUsers] = await old.query("SELECT id, email FROM users");
const uidOf = new Map();
for (const u of hbUsers) {
  let e = normEmail(u.email); const f = fakeMail(e); if (f) e = f.email;
  if (!f && (!isEmail(e) || isDevLocal(e))) continue;
  const [[r]] = await db.query("SELECT id FROM core_users WHERE email = ?", [e]);
  if (r) uidOf.set(u.id, r.id);
}
// 옛 키 → (소유 사용자, 새 키 id)
const [hbKeys] = await old.query("SELECT id, owner_type, owner_id, key_hash FROM api_keys");
const keyOf = new Map();
for (const k of hbKeys) {
  const [[nk]] = await db.query("SELECT id FROM core_api_keys WHERE key_hash = ?", [k.key_hash]);
  keyOf.set(k.id, { uid: k.owner_type === "user" ? uidOf.get(k.owner_id) ?? null : null, keyId: nk?.id ?? null });
}

const [pages] = await old.query("SELECT * FROM mockup_pages ORDER BY id");
const [gal] = await old.query("SELECT * FROM gallery_items ORDER BY id");
const galByTok = new Map(gal.map((g) => [g.token, g]));
const likeCol = async (t) => { const [c] = await old.query(`SHOW COLUMNS FROM ${t}`); return c.some((x) => x.Field === "item_id") ? "item_id" : "gallery_id"; };
const [likes] = await old.query(`SELECT ${await likeCol("gallery_likes")} gid, user_id, created_at FROM gallery_likes`);
const [unlocks] = await old.query(`SELECT ${await likeCol("gallery_unlocks")} gid, user_id, created_at FROM gallery_unlocks`);

let ins = 0, upd = 0, byKey = 0, byGal = 0, byKeep = 0, byArg = 0, noOwner = 0;
const idByTok = new Map();
for (const p of pages) {
  const g = galByTok.get(p.token);
  const k = keyOf.get(p.api_key_id);
  const [[ex]] = await db.query("SELECT id, owner_user_id FROM mock_mockups WHERE token = ?", [p.token]);
  let owner = k?.uid ?? null;
  if (owner) byKey++;
  else if (g && uidOf.get(g.user_id)) { owner = uidOf.get(g.user_id); byGal++; }
  else if (ex?.owner_user_id) { owner = ex.owner_user_id; byKeep++; }
  else if (FALLBACK) { owner = FALLBACK; byArg++; }
  else noOwner++;
  const vals = { owner_user_id: owner, api_key_id: k?.keyId ?? null, visibility: g?.status === "shared" ? "public" : "private", token: p.token, base_token: p.base_token, title: p.title ?? "", ref_id: p.ref_id, device: g?.device ?? "pc", html: p.html, bytes: p.bytes ?? Buffer.byteLength(p.html ?? ""), score: p.check_score ?? g?.score ?? null, passed: p.check_pass === null ? null : Number(p.check_pass), check_count: p.check_count ?? 0, check_json: p.check_result ?? g?.check_result ?? null, checked_at: p.checked_at, views: p.views ?? 0, published_at: Number(p.published) === 1 ? p.created_at : null, expires_at: p.expires_at, discarded_at: p.discarded_at ?? null, created_at: p.created_at, updated_at: p.updated_at };
  let id;
  if (ex) { await db.query("UPDATE mock_mockups SET ? WHERE id = ?", [vals, ex.id]); id = ex.id; upd++; }
  else { const [r] = await db.query("INSERT INTO mock_mockups SET ?", [{ public_id: pid(), ...vals }]); id = r.insertId; ins++; }
  idByTok.set(p.token, { id, owner });
}

const outDir = resolve(root, "api/storage/mock/gallery");
if (THUMB_DIR && !DRY) mkdirSync(outDir, { recursive: true });
let gIns = 0, gUpd = 0, orphan = 0, thumbs = 0, likeN = 0, unlockN = 0, reactSkip = 0;
const thumbMap = [];
for (const g of gal) {
  const m = idByTok.get(g.token);
  if (!m) { orphan++; continue; }
  const vals = { mockup_id: m.id, owner_user_id: uidOf.get(g.user_id) ?? m.owner, title: g.title ?? "", score: g.score, ref_id: g.ref_id, device: g.device, html: g.html, check_json: g.check_result, note: g.note, status: g.status, likes: g.likes, views: g.views, unlocks: g.unlocks, shared_at: g.shared_at, created_at: g.created_at, updated_at: g.updated_at };
  const [[ex]] = await db.query("SELECT id FROM mock_gallery WHERE mockup_id = ?", [m.id]);
  let gid;
  if (ex) { await db.query("UPDATE mock_gallery SET ? WHERE id = ?", [vals, ex.id]); gid = ex.id; gUpd++; }
  else { const [r] = await db.query("INSERT INTO mock_gallery SET ?", [vals]); gid = r.insertId; gIns++; }
  thumbMap.push(`${g.id}\t${gid}`);
  let hasThumb = g.has_thumb === undefined ? 0 : Number(g.has_thumb);
  if (THUMB_DIR) {
    const src = resolve(THUMB_DIR, `${g.id}.jpg`);
    hasThumb = existsSync(src) ? 1 : 0;
    if (hasThumb && !DRY) { copyFileSync(src, resolve(outDir, `${gid}.jpg`)); thumbs++; }
  }
  await db.query("UPDATE mock_mockups SET has_thumb = ? WHERE id = ?", [hasThumb, m.id]);
  for (const l of likes.filter((x) => x.gid === g.id)) {
    const uid = uidOf.get(l.user_id); if (!uid) { reactSkip++; continue; }
    const [r] = await db.query("INSERT IGNORE INTO mock_gallery_likes (gallery_id, user_id, created_at) VALUES (?,?,?)", [gid, uid, l.created_at]); likeN += r.affectedRows;
  }
  for (const l of unlocks.filter((x) => x.gid === g.id)) {
    const uid = uidOf.get(l.user_id); if (!uid) { reactSkip++; continue; }
    const [r] = await db.query("INSERT IGNORE INTO mock_gallery_unlocks (gallery_id, user_id, created_at) VALUES (?,?,?)", [gid, uid, l.created_at]); unlockN += r.affectedRows;
  }
}
if (!DRY) {
  mkdirSync(resolve(root, "db/migrate-legacy/out"), { recursive: true });
  writeFileSync(resolve(root, "db/migrate-legacy/out/hb-gallery-thumbs.tsv"), "old_gallery_id\tnew_gallery_id\n" + thumbMap.join("\n") + "\n");
}

head("홈박스 시안·갤러리(homebox-mockups.mjs)");
say("mockup_pages → mock_mockups", `옛 ${pages.length} → 신규 ${ins} · 갱신 ${upd}`);
say("소유자 결정", `키 주인 ${byKey} · 갤러리 주인 ${byGal} · 기존 유지 ${byKeep} · --owner ${byArg} · 소유자 없음 ${noOwner}`);
say("gallery_items → mock_gallery", `옛 ${gal.length} → 신규 ${gIns} · 갱신 ${gUpd} · 시안 없음 ${orphan}`);
say("썸네일", THUMB_DIR ? `복사 ${thumbs}` : `복사 안 함(LEGACY_HB_GALLERY_DIR 비어 있음) — 매핑 표 out/hb-gallery-thumbs.tsv ${thumbMap.length}행`);
say("좋아요·열람", `좋아요 신규 ${likeN} · 열람 신규 ${unlockN} · 누른 사람 없음 ${reactSkip}`);
await finish(db, old);
