// 시험 운영 데이터 — 실제 운영처럼 보이는 가상 회원·팀·활동을 만든다(사용자 지시 2026-10-07).
//   Free 10 · Pro 10 · Team 2팀(4명·3명) = 27명. 커뮤니티 글·댓글·좋아요, 에셋 사용·즐겨찾기·검색,
//   시안·갤러리 공유·좋아요·열람, 포인트·크레딧·청구서, API 키·사용량, 저장(컬렉션), 문의·자료 요청, 알림.
// 표식: 이메일 끝 @demo.powerplus.test · 조직 domain demo.powerplus.test · 구독 memo 'demo'.
//   node db/scripts/seed-demo.mjs [--storage DIR]          만들기(이미 있으면 지우고 다시)
//   node db/scripts/seed-demo.mjs --clean [--storage DIR]  전부 지우기(실제 회원 데이터는 건드리지 않는다)
// 같은 결과가 나오게 난수는 고정 씨앗을 쓴다. 장표 변환(deck) 작업은 파일이 필요해 만들지 않는다.
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const ROOT = path.resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const CLEAN = argv.includes("--clean");
const STORAGE = argv.includes("--storage") ? argv[argv.indexOf("--storage") + 1] : path.join(ROOT, "storage");
if (fs.existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));
const DOMAIN = "demo.powerplus.test";

// ── 고정 씨앗 난수
let seed = 20261007;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const sample = (arr, n) => { const c = [...arr]; const o = []; while (o.length < n && c.length) o.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return o; };
const ALPHA = "abcdefghijkmnpqrstuvwxyz23456789";
const pid = (n = 16) => Array.from({ length: n }, () => ALPHA[Math.floor(rnd() * ALPHA.length)]).join("");
const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
const NOW = Date.now();
const ago = (days, h = ri(8, 22), m = ri(0, 59)) => { const d = new Date(NOW - days * 86400_000); d.setHours(h, m, ri(0, 59), 0); return d; };
const dt = (d) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 23).replace("T", " ");
const day = (d) => dt(d).slice(0, 10);

const c = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: false });
const q = async (sql, a = []) => (await c.query(sql, a))[0];
const ins = async (sql, a) => (await c.query(sql, a))[0].insertId;

// ───────────────────────── 지우기
async function clean() {
  const users = (await q("SELECT id FROM core_users WHERE email LIKE ?", [`%@${DOMAIN}`])).map((r) => r.id);
  const orgs = (await q("SELECT id FROM core_orgs WHERE domain LIKE ?", [`%${DOMAIN}`])).map((r) => r.id);
  if (!users.length && !orgs.length) return console.log("지울 시험 데이터 없음");
  const U = users.length ? users : [0];
  const O = orgs.length ? orgs : [0];
  const mocks = (await q("SELECT id FROM mock_mockups WHERE owner_user_id IN (?)", [U])).map((r) => r.id);
  const gals = (await q("SELECT id FROM mock_gallery WHERE owner_user_id IN (?)", [U])).map((r) => r.id);
  const posts = (await q("SELECT id FROM comm_posts WHERE owner_user_id IN (?)", [U])).map((r) => r.id);
  const cols = (await q("SELECT id FROM core_collections WHERE owner_user_id IN (?)", [U])).map((r) => r.id);
  const keys = (await q("SELECT id FROM core_api_keys WHERE user_id IN (?)", [U])).map((r) => r.id);
  const subs = (await q("SELECT id FROM core_subscriptions WHERE (owner_type='user' AND owner_id IN (?)) OR (owner_type='org' AND owner_id IN (?))", [U, O])).map((r) => r.id);
  const del = async (sql, a) => { const r = await q(sql, a); return r.affectedRows; };
  const n = {};
  n.gallery_likes = await del("DELETE FROM mock_gallery_likes WHERE user_id IN (?) OR gallery_id IN (?)", [U, gals.length ? gals : [0]]);
  n.gallery_unlocks = await del("DELETE FROM mock_gallery_unlocks WHERE user_id IN (?) OR gallery_id IN (?)", [U, gals.length ? gals : [0]]);
  n.gallery = await del("DELETE FROM mock_gallery WHERE id IN (?)", [gals.length ? gals : [0]]);
  n.mockups = await del("DELETE FROM mock_mockups WHERE id IN (?)", [mocks.length ? mocks : [0]]);
  n.comm_likes = await del("DELETE FROM comm_likes WHERE user_id IN (?) OR post_id IN (?)", [U, posts.length ? posts : [0]]);
  n.comm_comments = await del("DELETE FROM comm_comments WHERE user_id IN (?) OR post_id IN (?)", [U, posts.length ? posts : [0]]);
  n.comm_posts = await del("DELETE FROM comm_posts WHERE id IN (?)", [posts.length ? posts : [0]]);
  n.collection_items = await del("DELETE FROM core_collection_items WHERE collection_id IN (?)", [cols.length ? cols : [0]]);
  n.collections = await del("DELETE FROM core_collections WHERE id IN (?)", [cols.length ? cols : [0]]);
  n.api_usage = await del("DELETE FROM core_api_usage WHERE api_key_id IN (?)", [keys.length ? keys : [0]]);
  n.asset_uses = await del("DELETE FROM asset_uses WHERE user_id IN (?)", [U]);
  n.api_keys = await del("DELETE FROM core_api_keys WHERE id IN (?)", [keys.length ? keys : [0]]);
  n.invoices = await del("DELETE FROM core_invoices WHERE user_id IN (?) OR subscription_id IN (?)", [U, subs.length ? subs : [0]]);
  n.subscriptions = await del("DELETE FROM core_subscriptions WHERE id IN (?)", [subs.length ? subs : [0]]);
  n.credits = await del("DELETE FROM core_credit_ledger WHERE user_id IN (?) OR org_id IN (?)", [U, O]);
  n.points = await del("DELETE FROM core_point_ledger WHERE user_id IN (?)", [U]);
  n.notifications = await del("DELETE FROM core_notifications WHERE user_id IN (?)", [U]);
  n.favorites = await del("DELETE FROM asset_favorites WHERE user_id IN (?)", [U]);
  n.search_logs = await del("DELETE FROM asset_search_logs WHERE user_id IN (?)", [U]);
  n.asset_requests = await del("DELETE FROM asset_requests WHERE user_id IN (?)", [U]);
  n.contacts = await del("DELETE FROM core_contacts WHERE user_id IN (?) OR email LIKE ?", [U, `%@${DOMAIN}`]);
  n.org_members = await del("DELETE FROM core_org_members WHERE org_id IN (?) OR user_id IN (?)", [O, U]);
  n.orgs = await del("DELETE FROM core_orgs WHERE id IN (?)", [O]);
  n.roles = await del("DELETE FROM core_user_roles WHERE user_id IN (?)", [U]);
  n.logins = await del("DELETE FROM core_user_logins WHERE user_id IN (?)", [U]);
  n.users = await del("DELETE FROM core_users WHERE id IN (?)", [U]);
  for (const g of gals) fs.rmSync(path.join(STORAGE, "mock/gallery", `${g}.jpg`), { force: true });
  console.log("지움:", JSON.stringify(n));
}

await clean();
if (CLEAN) { await c.end(); process.exit(0); }

// ───────────────────────── 회원
const NAMES = ["김민준","이서연","박지호","최유진","정도윤","강하은","조시우","윤지아","장준서","임수아","한예준","오채원","서건우","신다은","권현우","황서윤","안지훈","송민서","류태윤","전소율","홍승민","문가은","양재원","손나연","배우진","백하린","노은호"];
const ORGS = ["한빛디지털", "누리소프트"];
const PROV = ["email", "google", "kakao", "naver"];
const people = [];
const mkUser = async (i, plan) => {
  const name = NAMES[i];
  const created = ago(ri(15, 75));
  const prov = pick(PROV);
  const email = `demo${String(i + 1).padStart(2, "0")}@${DOMAIN}`;
  const id = await ins(
    "INSERT INTO core_users (public_id,email,name,kind,status,birthday,marketing_opt_in,marketing_opt_at,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [pid(), email, name, "external", "active", rnd() < 0.5 ? `19${ri(78, 99)}-${String(ri(1, 12)).padStart(2, "0")}-${String(ri(1, 28)).padStart(2, "0")}` : null,
      rnd() < 0.4 ? 1 : 0, null, dt(ago(ri(0, 6))), dt(created), dt(created)],
  );
  await q("INSERT INTO core_user_logins (user_id,provider,provider_uid,email,email_verified,linked_at,last_login_at) VALUES (?,?,?,?,1,?,?)",
    [id, prov, prov === "email" ? email : `demo-${hex(12)}`, email, dt(created), dt(ago(ri(0, 6)))]);
  const u = { id, name, email, plan, created };
  people.push(u);
  return u;
};
for (let i = 0; i < 10; i++) await mkUser(i, "free");
for (let i = 10; i < 20; i++) await mkUser(i, "pro");
const teamA = []; const teamB = [];
for (let i = 20; i < 24; i++) teamA.push(await mkUser(i, "team"));
for (let i = 24; i < 27; i++) teamB.push(await mkUser(i, "team"));

const planId = Object.fromEntries((await q("SELECT id, code FROM core_plans")).map((r) => [r.code, r.id]));
const PRICE = { pro: 19000, team: 59000 };

// 구독·청구서·월 크레딧
async function subscribe(ownerType, ownerId, plan, start, payer, seats = 1) {
  const end = new Date(start.getTime() + 30 * 86400_000);
  while (end.getTime() < NOW) end.setTime(end.getTime() + 30 * 86400_000);
  const sid = await ins(
    "INSERT INTO core_subscriptions (public_id,owner_type,owner_id,plan_id,billing,status,source,memo,seats,card_label,current_period_start,current_period_end,renews_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [pid(), ownerType, ownerId, planId[plan], "month", "active", "manual", "demo", seats, `신한 ****${ri(1000, 9999)}`, dt(new Date(end.getTime() - 30 * 86400_000)), dt(end), dt(end), dt(start), dt(start)],
  );
  for (let t = start.getTime(); t < NOW; t += 30 * 86400_000) {
    const at = new Date(t);
    const amt = PRICE[plan];
    await q("INSERT INTO core_invoices (public_id,subscription_id,user_id,kind,order_id,title,credits,amount_krw,vat_krw,status,issued_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [pid(), sid, payer, "subscription", `demo-${hex(10)}`, `${plan === "pro" ? "Pro" : "Team"} 월 구독`, null, amt, Math.round(amt / 10), "paid", dt(at), dt(at)]);
  }
  return sid;
}
const credit = async (userId, orgId, delta, kind, memo, at, bal) =>
  q("INSERT INTO core_credit_ledger (user_id,org_id,delta,kind,memo,balance_after,created_at) VALUES (?,?,?,?,?,?,?)", [userId, orgId, delta, kind, memo, bal, dt(at)]);

for (const u of people.filter((p) => p.plan === "pro")) {
  const start = ago(ri(5, 40));
  await subscribe("user", u.id, "pro", start, u.id);
  let bal = 50; await credit(u.id, null, 50, "grant_month", "Pro 월 포함 크레딧", start, bal);
  for (let k = 0; k < ri(1, 4); k++) { const n = ri(4, 12); bal -= n; await credit(u.id, null, -n, "use", `장표 변환 ${n}장`, ago(ri(0, 4)), bal); }
  if (rnd() < 0.3) { bal += 100; await credit(u.id, null, 100, "purchase", "크레딧 100 구매", ago(ri(1, 10)), bal); }
}
const orgIds = [];
for (const [ti, team] of [teamA, teamB].entries()) {
  const owner = team[0];
  const start = ago(ri(20, 45));
  const oid = await ins("INSERT INTO core_orgs (public_id,name,kind,domain,seats,owner_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    [pid(), ORGS[ti], "team", `team${ti + 1}.${DOMAIN}`, 5, owner.id, dt(start), dt(start)]);
  orgIds.push(oid);
  for (const [k, m] of team.entries()) {
    await q("INSERT INTO core_org_members (org_id,user_id,role,is_primary,joined_at) VALUES (?,?,?,1,?)", [oid, m.id, k === 0 ? "owner" : "member", dt(k === 0 ? start : ago(ri(5, 18)))]);
    m.org = oid;
  }
  await subscribe("org", oid, "team", start, owner.id, 5);
  let bal = 200; await credit(owner.id, oid, 200, "grant_month", "Team 월 포함 크레딧(좌석 공유)", start, bal);
  for (let k = 0; k < ri(3, 6); k++) { const m = pick(team); const n = ri(6, 20); bal -= n; await credit(m.id, oid, -n, "use", `장표 변환 ${n}장`, ago(ri(0, 12)), bal); }
}

// ───────────────────────── 포인트·알림 도우미
let pseq = 0; // (사용자·사유·ref) 가 유일해야 해서 순번을 붙인다
const point = (u, delta, reason, at, memo = null, refType = null, refId = null) =>
  q("INSERT INTO core_point_ledger (user_id,delta,reason,ref_type,ref_id,memo,created_at) VALUES (?,?,?,?,?,?,?)", [u.id, delta, reason, refType ?? "demo", `${refId ?? "d"}-${++pseq}`, memo, dt(at)]);
const notify = (u, kind, title, body, link, at, read) =>
  q("INSERT INTO core_notifications (user_id,kind,title,body,link,read_at,created_at) VALUES (?,?,?,?,?,?,?)", [u.id, kind, title, body, link, read ? dt(new Date(at.getTime() + 3600_000)) : null, dt(at)]);

for (const u of people) {
  await point(u, 100, "signup", u.created, "가입 축하");
  const days = Math.floor((NOW - u.created.getTime()) / 86400_000);
  for (let d = days; d >= 0; d--) if (rnd() < (u.plan === "free" ? 0.25 : 0.55)) await point(u, 5, "attend", ago(d));
  await notify(u, "system", "powerPlus 에 오신 것을 환영합니다", "에셋·장표·목업·가이드를 한 계정으로 쓰세요.", "/", u.created, true);
}

// ───────────────────────── 커뮤니티
const POSTS = {
  qna: [
    ["애드인에서 아이콘 색을 바꿔서 넣을 수 있나요?", "PowerPoint 에 넣은 뒤 색 바꾸기가 되는 아이콘이 있고 안 되는 아이콘이 있네요. 구분하는 방법이 있을까요?", "assets"],
    ["장표 변환에서 한 장 먼저 보기는 크레딧이 얼마나 드나요?", "20장짜리 제안서를 돌리기 전에 시안 한 장만 먼저 보고 싶습니다. 그 한 장도 1크레딧인가요?", "deck"],
    ["MCP 키를 팀원과 같이 써도 되나요?", "Team 플랜인데 키를 한 개 만들어서 다같이 쓰는 게 나은지, 사람마다 만드는 게 나은지 궁금합니다.", "mock"],
    ["check_mockup 점수가 80점에서 안 올라갑니다", "가로 넘침은 다 고쳤는데 '줄 간격 불일치'가 계속 남습니다. 어떤 값을 기준으로 맞추면 되나요?", "mock"],
    ["KRDS 대응표에서 '미대응' 부품은 어떻게 하나요?", "캐러셀이 미대응으로 나와 있는데, 공공기관 메인에서 써도 감점이 없을까요?", "guide"],
    ["장표 대본은 발표 시간에 맞춰 줄일 수 있나요?", "10분 발표라 대본이 너무 깁니다. 분량을 지정하는 방법이 있을까요?", "deck"],
  ],
  showcase: [
    ["시청 메인 시안 3종 만들어 봤습니다", "powerMCP 로 레퍼런스 세 곳을 섞어서 만들었어요. 두 번째 안이 92점으로 통과했습니다.", "mock"],
    ["교육청 제안서 표지 변환 결과 공유", "초안은 글자뿐이었는데 표지·간지·목차까지 톤이 맞춰졌습니다. 아이콘은 에셋에서 자동으로 들어갔어요.", "deck"],
    ["공단 서브페이지 게시판 목록 시안", "게시판 목록·상세 두 장을 같은 틀로 만들었습니다. 머리·바닥을 메인에서 가져오니 금방 끝나네요.", "mock"],
    ["토큰 CSS 하나로 시작한 사내 포털", "powerGuide 토큰 CSS 를 넣고 부품 몇 개만 복사했는데 접근성 검사가 한 번에 통과했습니다.", "guide"],
  ],
  tip: [
    ["에셋 검색은 '용도 + 색' 조합이 잘 나와요", "'민원 파랑'처럼 쓰면 바로가기용 아이콘이 먼저 나옵니다. 띄어 써도 같은 결과가 나와요.", "assets"],
    ["장표 변환 전에 초안 슬라이드 제목만 정리해도 결과가 좋아집니다", "제목이 '내용1·내용2'처럼 비어 있으면 기획 단계에서 엉뚱한 구조가 나옵니다.", "deck"],
    ["대학교 홈페이지 레퍼런스도 늘었으면 합니다", "관공서 시안은 충분한데 대학 입학처 같은 화면 예시가 더 있으면 좋겠습니다.", "mock"],
    ["다크 모드 토큰도 받을 수 있게 해 주세요", "가이드 토큰에 다크 모드 값이 있으면 사내 대시보드에 바로 쓸 수 있을 것 같아요.", "guide"],
  ],
  free: [
    ["제안서 마감 3일 전, 장표 변환 덕분에 살았습니다", "팀 전체가 밤새던 디자인 작업을 하루 만에 끝냈어요.", null],
    ["다들 MCP 는 어떤 도구로 쓰세요?", "저는 Claude Code 로 쓰는데, Cursor 쓰시는 분 계신가요?", null],
    ["포인트 7일 연속 출석 보너스 받았습니다", "소소하지만 기분 좋네요. 시안 열람에 써 봐야겠어요.", null],
    ["나라장터 공고 보고 바로 기획 들어가는 흐름 공유", "공고 → 장표 초안 → 변환 → 목업까지 하루 안에 정리해 봤습니다.", null],
  ],
};
const COMMENTS = ["저도 같은 문제 겪었는데 도움이 됐어요.", "좋은 정보 감사합니다!", "혹시 결과 파일도 공유해 주실 수 있나요?", "이 방법으로 해 보니 점수가 올랐습니다.", "다음 업데이트에 들어가면 좋겠네요.", "저희 팀도 이렇게 쓰고 있어요.", "질문 하나만 더 드려도 될까요?", "캡처 보니까 이해가 확 되네요.", "와 퀄리티 좋네요.", "참고하겠습니다 👍"];
const postRows = [];
for (const [cat, list] of Object.entries(POSTS)) {
  for (const [title, body, mod] of list) {
    const author = pick(people);
    const at = ago(ri(0, Math.max(1, Math.floor((NOW - author.created.getTime()) / 86400_000))));
    const id = await ins(
      "INSERT INTO comm_posts (public_id,owner_user_id,org_id,visibility,category,title,body,module,pinned,comment_count,like_count,view_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,0,?,?,?)",
      [pid(), author.id, author.org ?? null, "public", cat, title, body, mod, ri(12, 260), dt(at), dt(at)],
    );
    await point(author, 10, "post", at, null, "post", String(id));
    postRows.push({ id, author, at, title });
  }
}
for (const p of postRows) {
  const nCom = ri(0, 5);
  for (let k = 0; k < nCom; k++) {
    const who = pick(people.filter((u) => u.id !== p.author.id));
    const at = new Date(p.at.getTime() + ri(1, 72) * 3600_000);
    if (at.getTime() > NOW) continue;
    await q("INSERT INTO comm_comments (post_id,user_id,body,created_at) VALUES (?,?,?,?)", [p.id, who.id, pick(COMMENTS), dt(at)]);
    await point(who, 3, "comment", at, null, "post", String(p.id));
    await notify(p.author, "comment", `${who.name} 님이 댓글을 남겼습니다`, p.title, `/community?post=${p.id}`, at, rnd() < 0.6);
  }
  const likers = sample(people.filter((u) => u.id !== p.author.id), ri(0, 9));
  for (const l of likers) {
    const at = new Date(Math.min(NOW, p.at.getTime() + ri(1, 96) * 3600_000));
    await q("INSERT INTO comm_likes (post_id,user_id,created_at) VALUES (?,?,?)", [p.id, l.id, dt(at)]);
    await point(p.author, 2, "like_received", at, null, "post", String(p.id));
  }
  await q("UPDATE comm_posts SET comment_count=(SELECT COUNT(*) FROM comm_comments WHERE post_id=?), like_count=(SELECT COUNT(*) FROM comm_likes WHERE post_id=?) WHERE id=?", [p.id, p.id, p.id]);
}

// ───────────────────────── 에셋 사용·즐겨찾기·검색·자료 요청
const pubAssets = (await q("SELECT id FROM asset_items WHERE visibility='public' AND deleted_at IS NULL ORDER BY RAND(7) LIMIT 300")).map((r) => r.id);
const proAssets = (await q("SELECT id FROM asset_items WHERE visibility='pro' AND category <> 'mockup_sample' AND deleted_at IS NULL ORDER BY RAND(7) LIMIT 600")).map((r) => r.id);
const SEARCH = ["민원 파랑", "회의", "데이터베이스", "클라우드", "기후위기", "악수", "통계 그래프", "보안", "교육", "표지", "간지", "조직도", "지도", "스마트시티", "체크", "인물 일러스트", "사무실 사진", "아이콘 세트", "로고", "다이어그램 흐름", "탄소중립", "복지"];
for (const u of people) {
  const pool = u.plan === "free" ? pubAssets : [...pubAssets, ...proAssets];
  const nUse = u.plan === "free" ? ri(2, 12) : ri(15, 60);
  for (let k = 0; k < nUse; k++) await q("INSERT INTO asset_uses (item_id,user_id,channel,created_at) VALUES (?,?,?,?)", [pick(pool), u.id, pick(["addin", "addin", "web", "deck"]), dt(ago(ri(0, 30)))]);
  for (const a of sample(pool, ri(1, 10))) await q("INSERT IGNORE INTO asset_favorites (user_id,item_id,created_at) VALUES (?,?,?)", [u.id, a, dt(ago(ri(0, 30)))]);
  for (let k = 0; k < ri(3, 20); k++) {
    const at = ago(ri(0, 30)); const term = pick(SEARCH);
    await q("INSERT INTO asset_search_logs (q,results,user_id,channel,day,created_at) VALUES (?,?,?,?,?,?)", [term, rnd() < 0.08 ? 0 : ri(4, 420), u.id, pick(["addin", "web", "web", "mcp"]), day(at), dt(at)]);
  }
}
const REQS = [["관공서 민원 창구 실사 사진", "photo", "민원실 창구·번호표가 보이는 실사 사진이 더 필요합니다."], ["3D 스타일 교통 아이콘", "icon", "버스·지하철·자전거 아이콘을 같은 스타일 세트로 받고 싶어요."], ["제안서 목차 간지 장표", "ppt", "목차 다음 간지 템플릿이 한두 종 더 있으면 좋겠습니다."], ["대학 캠퍼스 히어로 사진", "photo", "대학교 메인 비주얼로 쓸 21:9 캠퍼스 사진."]];
for (const [title, kind, detail] of REQS) {
  const u = pick(people); const at = ago(ri(0, 20)); const done = rnd() < 0.5;
  await q("INSERT INTO asset_requests (public_id,user_id,title,kind,detail,reply,status,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [pid(), u.id, title, kind, detail, done ? "요청하신 자료를 등록했습니다. 둘러보기에서 확인해 주세요." : null, done ? "done" : "new", "user", dt(at), dt(at)]);
  if (done) await point(u, 50, "asset_request_accepted", new Date(at.getTime() + 86400_000), title);
}

// ───────────────────────── 시안·갤러리 (기존 통과 시안의 HTML 을 빌려 가상 회원 것으로)
const srcMocks = await q("SELECT m.*, g.id AS gid FROM mock_mockups m LEFT JOIN mock_gallery g ON g.mockup_id=m.id WHERE m.passed=1 AND m.deleted_at IS NULL AND m.html IS NOT NULL ORDER BY m.score DESC LIMIT 20");
const TITLES = ["한빛시 메인 시안", "새솔군 공지사항 목록", "미래혁신부 메인 A안", "푸른구 인사말", "한빛시 민원 신청 폼", "교육청 메인 B안", "공단 게시판 상세", "한빛시 조직도", "새솔군 메인 C안", "공사 기관 소개", "한빛시 FAQ", "청년 정책 안내"];
const makers = people.filter((u) => u.plan !== "free");
const gallery = [];
fs.mkdirSync(path.join(STORAGE, "mock/gallery"), { recursive: true });
for (let k = 0; k < Math.min(12, srcMocks.length); k++) {
  const s = srcMocks[k]; const u = makers[k % makers.length]; const at = ago(ri(0, 25));
  const title = TITLES[k];
  const mid = await ins(
    "INSERT INTO mock_mockups (public_id,owner_user_id,org_id,visibility,token,base_token,title,ref_id,device,html,bytes,score,passed,check_count,check_json,checked_at,has_thumb,views,published_at,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,NULL,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)",
    [pid(), u.id, u.org ?? null, "private", `demo${hex(18)}`, title, s.ref_id, s.device, s.html, s.bytes, s.score, ri(1, 4), s.check_json, dt(at), s.gid ? 1 : 0, ri(3, 80),
      rnd() < 0.6 ? dt(at) : null, dt(new Date(at.getTime() + 30 * 86400_000)), dt(at), dt(at)],
  );
  await point(u, 20, "mockup_keep", at, title, "mockup", String(mid));
  const shared = rnd() < 0.75;
  const gid = await ins(
    "INSERT INTO mock_gallery (mockup_id,owner_user_id,title,score,ref_id,device,html,check_json,note,status,likes,views,unlocks,shared_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,0,?,?,?)",
    [mid, u.id, title, s.score, s.ref_id, s.device, s.html, s.check_json, null, shared ? "shared" : "study", ri(10, 300), shared ? dt(at) : null, dt(at), dt(at)],
  );
  if (s.gid) { const from = path.join(STORAGE, "mock/gallery", `${s.gid}.jpg`); if (fs.existsSync(from)) fs.copyFileSync(from, path.join(STORAGE, "mock/gallery", `${gid}.jpg`)); }
  if (shared) { await point(u, 50, "mockup_share", at, title, "gallery", String(gid)); gallery.push({ gid, u, at, title }); }
}
for (const g of gallery) {
  for (const l of sample(people.filter((x) => x.id !== g.u.id), ri(1, 12))) {
    const at = new Date(Math.min(NOW, g.at.getTime() + ri(1, 120) * 3600_000));
    await q("INSERT IGNORE INTO mock_gallery_likes (gallery_id,user_id,created_at) VALUES (?,?,?)", [g.gid, l.id, dt(at)]);
  }
  for (const l of sample(people.filter((x) => x.id !== g.u.id), ri(0, 6))) {
    const at = new Date(Math.min(NOW, g.at.getTime() + ri(1, 120) * 3600_000));
    await q("INSERT IGNORE INTO mock_gallery_unlocks (gallery_id,user_id,created_at) VALUES (?,?,?)", [g.gid, l.id, dt(at)]);
    await point(l, -30, "use_mockup_open", at, g.title, "gallery", String(g.gid));
    await point(g.u, 10, "mockup_royalty", at, g.title, "gallery", String(g.gid));
    await notify(g.u, "gallery", "공유한 시안을 누군가 열어 봤습니다", `${g.title} · 포인트 10 적립`, "/mock/gallery", at, rnd() < 0.5);
  }
  await q("UPDATE mock_gallery SET likes=(SELECT COUNT(*) FROM mock_gallery_likes WHERE gallery_id=?), unlocks=(SELECT COUNT(*) FROM mock_gallery_unlocks WHERE gallery_id=?) WHERE id=?", [g.gid, g.gid, g.gid]);
}

// ───────────────────────── API 키·사용량 (Pro·Team 일부)
const TOOLS = ["mock_get_replica_kit", "mock_check_mockup", "assets_search", "mock_publish_mockup", "guide_get_tokens", "deck_get_plan_kit", "assets_pick"];
for (const u of sample(makers, 9)) {
  const at = ago(ri(3, 25));
  const kid = await ins("INSERT INTO core_api_keys (public_id,user_id,org_id,name,prefix,key_hash,key_enc,key_last4,scopes,daily_limit,last_used_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [pid(), u.id, u.org ?? null, pick(["Claude Code", "Cursor", "claude.ai", "사내 자동화"]), "pp_live_demo", hex(64), null, hex(4), JSON.stringify(["all"]), 500, dt(ago(ri(0, 3))), dt(at)]);
  for (let d = Math.floor((NOW - at.getTime()) / 86400_000); d >= 0; d--) {
    if (rnd() < 0.45) continue;
    for (const t of sample(TOOLS, ri(1, 4))) await q("INSERT INTO core_api_usage (api_key_id,day,tool,calls,bytes,ms_sum) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE calls = calls + VALUES(calls)", [kid, day(ago(d)), t, ri(1, 30), ri(20_000, 900_000), ri(200, 20_000)]);
  }
}

// ───────────────────────── 저장(컬렉션)·문의
const galleryIds = gallery.map((g) => g.gid);
for (const u of sample(people, 14)) {
  const at = ago(ri(0, 25));
  const cid = await ins("INSERT INTO core_collections (public_id,owner_user_id,org_id,visibility,name,memo,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)",
    [pid(), u.id, u.org ?? null, "private", "기본 컬렉션", null, dt(at), dt(at)]);
  const assets = await q("SELECT public_id FROM asset_items WHERE id IN (?)", [sample(u.plan === "free" ? pubAssets : proAssets, ri(2, 8))]);
  let s = 0;
  for (const a of assets) await q("INSERT INTO core_collection_items (collection_id,item_type,item_public_id,sort,added_at) VALUES (?,?,?,?,?)", [cid, "asset", a.public_id, s++, dt(ago(ri(0, 20)))]);
  for (const g of sample(galleryIds, ri(0, 2))) await q("INSERT INTO core_collection_items (collection_id,item_type,item_public_id,sort,added_at) VALUES (?,?,?,?,?)", [cid, "gallery", String(g), s++, dt(ago(ri(0, 20)))]);
}
const CONTACTS = [["team", "Team 좌석을 10석으로 늘리고 싶습니다", 10], ["deck", "장표 변환 결과 파일이 열리지 않습니다", null], ["billing", "세금계산서 발행 요청드립니다", null], ["mock", "기관 맞춤 레퍼런스 추가 요청", null]];
for (const [topic, message, seats] of CONTACTS) {
  const u = pick(people); const at = ago(ri(0, 14)); const answered = rnd() < 0.5;
  await q("INSERT INTO core_contacts (public_id,user_id,topic,module,name,email,org,seats,message,reply,reply_sent_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [pid(), u.id, topic, topic === "deck" || topic === "mock" ? topic : null, u.name, u.email, u.org ? ORGS[orgIds.indexOf(u.org)] : null, seats, message,
      answered ? "확인했습니다. 담당자가 메일로 자세히 안내드리겠습니다." : null, answered ? dt(new Date(at.getTime() + 7200_000)) : null, answered ? "answered" : "open", dt(at)]);
}

// ───────────────────────── 공지 6건(작성자 이름 powerPlus — 운영 공지 계정처럼, 이메일은 시험용 표식)
{
  const created = ago(80);
  const em = "notice@" + DOMAIN;
  const nid = await ins("INSERT INTO core_users (public_id,email,name,kind,status,birthday,marketing_opt_in,marketing_opt_at,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [pid(), em, "powerPlus", "staff", "active", null, 0, null, dt(ago(0)), dt(created), dt(created)]);
  const NOTICES = [
    ["powerPlus 통합 플랫폼을 열었습니다", "powerAssets·powerDeck·powerMock·powerGuide 를 한 계정으로 씁니다. 기존 계정은 그대로 로그인됩니다.", null, 1, 30],
    ["powerMCP 도구 42종 안내", "자산 검색, 장표 기획·와이어·대본 재료, 목업 재료·판정, 가이드 부품까지 키 하나로 부릅니다. 키는 마이페이지에서 발급합니다.", null, 1, 12],
    ["powerDeck 한 장 먼저 보기가 기본이 됐습니다", "대표 장 하나를 먼저 보여 드리고, 확인 뒤 나머지를 진행합니다. 남긴 의견은 다음 장에 반영됩니다.", "deck", 0, 9],
    ["powerAssets 아이콘 540종 추가", "유리 질감 입체 180종과 평면 파랑 360종을 등록했습니다. 둘러보기에서 스타일 세트로 볼 수 있습니다.", "assets", 0, 6],
    ["powerGuide 부품 상세 문서 공개", "부품 77종마다 미리보기·코드·설치 명령·사용법·KRDS 지침을 정리했습니다.", "guide", 0, 4],
    ["시안 갤러리와 포인트 제도 시작", "81점 이상 시안은 갤러리에 공유할 수 있고, 공유하면 포인트가 쌓입니다. 포인트로 다른 시안을 열람합니다.", "mock", 0, 1],
  ];
  for (const [title, body, mod, pinned, d] of NOTICES) {
    const at = ago(d);
    await q("INSERT INTO comm_posts (public_id,owner_user_id,org_id,visibility,category,title,body,module,pinned,comment_count,like_count,view_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?)",
      [pid(), nid, null, "public", "notice", title, body, mod, pinned, ri(80, 420), dt(at), dt(at)]);
  }
}

// ───────────────────────── 요약
const sum = async (sql) => (await q(sql, [`%@${DOMAIN}`]))[0].n;
console.log(JSON.stringify({
  users: people.length, free: 10, pro: 10, team_orgs: orgIds.length, team_members: teamA.length + teamB.length,
  posts: postRows.length,
  comments: await sum("SELECT COUNT(*) n FROM comm_comments c JOIN core_users u ON u.id=c.user_id WHERE u.email LIKE ?"),
  asset_uses: await sum("SELECT COUNT(*) n FROM asset_uses a JOIN core_users u ON u.id=a.user_id WHERE u.email LIKE ?"),
  mockups: await sum("SELECT COUNT(*) n FROM mock_mockups m JOIN core_users u ON u.id=m.owner_user_id WHERE u.email LIKE ?"),
  gallery_shared: gallery.length,
  points: await sum("SELECT COALESCE(SUM(delta),0) n FROM core_point_ledger p JOIN core_users u ON u.id=p.user_id WHERE u.email LIKE ?"),
}));
await c.end();
