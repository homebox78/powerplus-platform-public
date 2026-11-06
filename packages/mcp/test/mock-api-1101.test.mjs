// 2026-11-01 전체 검수 파워목업 수정의 라우트·규칙 시험(음성 대조 포함). 실제 api/routes/mock.php·mock_wire.php 를 php 로 돌리고 DB 만 가짜다(test/php/mock-route-harness.php).
// SQL 은 MariaDB 에서 실행되지 않는다 — 이 PC 에 DB 가 없다. PHP 판단과 'SQL 에 어떤 조건이 실렸나'까지만 잰다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { judgeOrg, judgeRecordHeaders, planHeaders, rememberOrg, sha256Hex, wireQuery } from "../src/tools/mock-judge.ts";
import { wireSource } from "../src/tools/mock-wire.ts";
import fs from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let hasPhp = true;
try { execFileSync("php", ["-v"], { stdio: "ignore" }); } catch { hasPhp = false; }
const opts = { skip: !hasPhp && "php 없음" };
const SECRET = "시험-비밀";
const route = (c) => JSON.parse(execFileSync("php", [path.join(HERE, "php/mock-route-harness.php"), JSON.stringify(c)], { encoding: "utf8", maxBuffer: 1 << 26 }));
const unit = (c) => JSON.parse(execFileSync("php", [path.join(HERE, "php/mockref-units.php"), JSON.stringify(c)], { encoding: "utf8" }));
const sqlHas = (r, re) => r.sql.some((x) => re.test(x.sql));

const TOK = "AAAAAAAAAAAAAAAAAAAAAA";
const HTML = "<!doctype html><html><body>저장된 시안 본문 — 충분히 긴 글</body></html>";
const mine = (over = {}) => ({ id: 5, public_id: "pid5", token: TOK, owner_user_id: 1, html: HTML, bytes: 60, ...over });

// ---------------------------------------------------------------- H8 판정 서명 + HTML 해시
const check = (over, mock = {}) => {
  const body = { score: 90, pass: true, html_sha256: sha256Hex(HTML), ref_id: "1", result: {}, ...over.body };
  const h = judgeRecordHeaders(SECRET, TOK, body.score, body.pass, body.html_sha256);
  return route({ method: "POST", path: `/mock/mockups/${TOK}/check`, mockups: [mine(mock)], body, config: { "mock.judge_secret": SECRET },
    server: { HTTP_X_PP_JUDGE_HTML: h["X-Pp-Judge-Html"], HTTP_X_PP_JUDGE: h["X-Pp-Judge"], ...over.server } });
};
test("H8 HTML 이 같으면 통과를 기록한다(잠금 뒤 대조)", opts, () => {
  const r = check({});
  assert.equal(r.status, 200, r.raw);
  assert.equal(r.body.data.passed, true);
  const i = r.sql.findIndex((x) => /FOR UPDATE/.test(x.sql)); const u = r.sql.findIndex((x) => /UPDATE mock_mockups SET score/.test(x.sql));
  assert.ok(i >= 0 && u > i, "FOR UPDATE 뒤에 UPDATE");
});
test("H8 음성 대조 — 판정 중 HTML 이 바뀌면 409, 점수를 기록하지 않는다", opts, () => {
  const r = check({}, { html: HTML + "<script>바뀜</script>" });
  assert.equal(r.status, 409, r.raw);
  assert.equal(r.body.code, "HTML_CHANGED");
  assert.ok(!sqlHas(r, /UPDATE mock_mockups SET score/));
});
test("H8 음성 대조 — 해시만 바꾸면 서명이 틀려 403, 틀린 새 서명은 옛 서명으로 넘어가지 않는다", opts, () => {
  const legacy = createHmac("sha256", SECRET).update(`${TOK}|90|1`).digest("hex");
  const r = route({ method: "POST", path: `/mock/mockups/${TOK}/check`, mockups: [mine()], config: { "mock.judge_secret": SECRET },
    body: { score: 90, pass: true, html_sha256: sha256Hex(HTML), result: {} }, server: { HTTP_X_PP_JUDGE_HTML: "00", HTTP_X_PP_JUDGE: legacy } });
  assert.equal(r.status, 403);
  assert.ok(!sqlHas(r, /UPDATE mock_mockups SET score/));
});
test("H8 서명 없음·위조는 403", opts, () => {
  const r = route({ method: "POST", path: `/mock/mockups/${TOK}/check`, mockups: [mine()], config: { "mock.judge_secret": SECRET }, body: { score: 99, pass: true, result: {} } });
  assert.equal(r.status, 403);
});
test("H8 옛 판 powerMCP(옛 서명만)도 기록된다 — 배포 순서 호환", opts, () => {
  const legacy = createHmac("sha256", SECRET).update(`${TOK}|90|1`).digest("hex");
  const r = route({ method: "POST", path: `/mock/mockups/${TOK}/check`, mockups: [mine({ html: "바뀐 것도 대조 못 함" })], config: { "mock.judge_secret": SECRET }, body: { score: 90, pass: true, result: {} }, server: { HTTP_X_PP_JUDGE: legacy } });
  assert.equal(r.status, 200, r.raw);
});
test("H8 powerMCP 와 PHP 의 해시·서명이 같은 값을 만든다(한글 HTML)", () => {
  assert.equal(sha256Hex(HTML), createHash("sha256").update(Buffer.from(HTML, "utf8")).digest("hex"));
  const h = judgeRecordHeaders("s", "t", 89.7, 1, "abc");
  assert.equal(h["X-Pp-Judge"], createHmac("sha256", "s").update("t|89|1").digest("hex"));
  assert.equal(h["X-Pp-Judge-Html"], createHmac("sha256", "s").update("t|89|1|abc").digest("hex"));
});

// ---------------------------------------------------------------- M14 불합격이면 게시 내림
test("M14 재판정 불합격 — 게시를 내리고 unpublished 를 알린다", opts, () => {
  const r = check({ body: { score: 40, pass: false } }, { published_at: "2026-10-30 00:00:00", visibility: "public" });
  assert.equal(r.status, 200, r.raw);
  assert.equal(r.body.data.unpublished, true);
  assert.ok(sqlHas(r, /published_at = NULL, visibility = 'private'/));
});
test("M14 음성 대조 — 통과면 게시를 건드리지 않는다", opts, () => {
  const r = check({}, { published_at: "2026-10-30 00:00:00" });
  assert.equal(r.body.data.unpublished, false);
  assert.ok(!sqlHas(r, /UPDATE mock_mockups SET score.*published_at = NULL/s));
});
test("M14 목록 — 갤러리 사본이 있는 시안은 재판정에 떨어져도 주인 목록에 보인다", opts, () => {
  const row = { ...mine(), passed: 0, score: 40, published_at: null, discarded_at: null, g_id: 3, g_status: "study", g_likes: 0, g_unlocks: 0, device: "pc", title: "t", ref_id: null, check_count: 1, views: 0, has_thumb: 0, updated_at: "2026-10-01 00:00:00", expires_at: "2030-01-01 00:00:00", created_at: "2026-10-01 00:00:00", checked_at: null };
  const r = route({ method: "GET", path: "/mock/mockups", list_rows: [row] });
  assert.ok(sqlHas(r, /m\.passed = 1 OR g\.id IS NOT NULL/));
  assert.ok(r.sql.some((x) => /COUNT\(\*\) FROM mock_mockups m LEFT JOIN mock_gallery g/.test(x.sql)), "개수도 같은 조건");
  assert.equal(r.body.data[0].passed, false);
});

// ---------------------------------------------------------------- H9 폐기·숨김·삭제
test("H9 /p — 폐기하면 닫히고 본문을 주지 않는다", opts, () => {
  const r = route({ method: "GET", path: `/p/${TOK}`, mockups: [mine({ published_at: "2026-10-30", discarded_at: "2026-10-31" })] });
  assert.equal(http(r), 404);
  assert.ok(!r.raw.includes("저장된 시안 본문"));
  assert.ok(r.raw.includes("폐기"));
});
test("H9 /p 음성 대조 — 복원(폐기 없음)이면 같은 주소가 다시 열린다", opts, () => {
  const r = route({ method: "GET", path: `/p/${TOK}`, mockups: [mine({ published_at: "2026-10-30", discarded_at: null })] });
  assert.ok(r.raw.includes("저장된 시안 본문"));
});
test("H9 게시 경로 — 폐기 시안은 통과여도 409", opts, () => {
  const r = route({ method: "POST", path: "/mock/mockups", mockups: [mine({ passed: 1, discarded_at: "2026-10-31" })], body: { mode: "publish", token: TOK } });
  assert.equal(r.status, 409); assert.equal(r.body.code, "DISCARDED");
  assert.ok(!sqlHas(r, /SET published_at = COALESCE/));
});
test("H9 게시 경로 음성 대조 — 폐기 아니면 게시된다", opts, () => {
  const r = route({ method: "POST", path: "/mock/mockups", mockups: [mine({ passed: 1 })], body: { mode: "publish", token: TOK } });
  assert.equal(r.status, 200, r.raw);
  assert.ok(sqlHas(r, /SET published_at = COALESCE/));
});
test("H9 주소를 아는 남 — 폐기 시안 미리보기는 404, 주인은 본다", opts, () => {
  const m = mine({ published_at: "2026-10-30", visibility: "public", discarded_at: "2026-10-31" });
  assert.equal(route({ method: "GET", path: `/mock/mockups/${TOK}/html`, mockups: [m], actor: { id: 2 } }).status, 404);
  assert.ok(route({ method: "GET", path: `/mock/mockups/${TOK}/html`, mockups: [m], actor: { id: 1 } }).raw.includes("저장된 시안 본문"));
});
const gal = (over = {}, mock = {}) => ({ mockups: [mine(mock)], gallery: [{ id: 3, mockup_id: 5, owner_user_id: 1, status: "study", html: HTML, title: "t", ...over }] });
test("H9 공유 — 숨김·폐기는 주인이 못 올린다, 보관은 올린다, 관리자는 된다", opts, () => {
  const share = (c, actor) => route({ method: "POST", path: "/mock/gallery/3/share", body: {}, ...c, ...(actor ? { actor } : {}) });
  const a = share(gal({ status: "hidden" })); assert.equal(a.status, 403); assert.equal(a.body.code, "GALLERY_BLOCKED"); assert.ok(!sqlHas(a, /SET status = 'shared'/));
  const b = share(gal({}, { discarded_at: "2026-10-31" })); assert.equal(b.status, 403);
  const c = share(gal()); assert.equal(c.status, 200, c.raw); assert.ok(sqlHas(c, /SET status = 'shared'/));
  const d = share(gal({ status: "hidden" }), { id: 9, roles: ["admin"] }); assert.equal(d.status, 200, d.raw);
});
test("H9 지운 시안 — 공유·상세·좋아요 모두 없는 것으로, 내리기로 숨김을 풀 수 없다", opts, () => {
  const del = gal({ status: "hidden" }, { deleted_at: "2026-10-31" });
  for (const [method, p] of [["POST", "/mock/gallery/3/share"], ["GET", "/mock/gallery/3"], ["POST", "/mock/gallery/3/like"]]) assert.equal(route({ method, path: p, ...del }).status, 404, p);
  const h = route({ method: "POST", path: "/mock/gallery/3/hide", ...gal({ status: "hidden" }) });
  assert.equal(h.status, 200); assert.ok(!sqlHas(h, /SET status = 'study'/));
  const ok = route({ method: "POST", path: "/mock/gallery/3/hide", ...gal({ status: "shared" }) });
  assert.ok(sqlHas(ok, /SET status = 'study'/), "음성 대조: 공유 중이면 내린다");
});
test("H9 갤러리 목록 — 지운 시안을 뺀다(공유·내 것·집계 모두)", opts, () => {
  const c = { ...gal({ status: "shared" }, { deleted_at: "2026-10-31" }), gallery: [{ id: 3, mockup_id: 5, owner_user_id: 1, status: "shared", html: HTML, title: "지운 것" }, { id: 4, mockup_id: 6, owner_user_id: 1, status: "shared", html: HTML, title: "산 것" }], mockups: [mine({ deleted_at: "2026-10-31" }), mine({ id: 6, token: "BBBBBBBBBBBBBBBBBBBBBB" })] };
  const r = route({ method: "GET", path: "/mock/gallery", ...c });
  assert.deepEqual(r.body.data.map((x) => x.title), ["산 것"]);
  assert.ok(!r.sql.some((x) => /FROM mock_gallery WHERE status = 'shared'/.test(x.sql)), "뱃지 집계도 지운 시안을 뺀다");
});

// ---------------------------------------------------------------- M16 관리자 폐기는 하루 삭제에서 제외, 재판정으로 안 풀림
test("M16 하루 삭제가 관리자 폐기를 뺀다", opts, () => {
  const r = route({ method: "POST", path: "/mock/mockups", mockups: [mine()], body: { token: TOK, edits: [] } });
  const sweep = r.sql.find((x) => /SET deleted_at = NOW\(3\), published_at = NULL WHERE discarded_at/.test(x.sql));
  assert.ok(sweep, "삭제문이 돈다");
  assert.match(sweep.sql, /NOT EXISTS \(SELECT 1 FROM core_audit a WHERE a\.target_type = 'mockup' AND a\.target_id = mock_mockups\.public_id AND a\.action = 'mock\.mockup\.discard'/);
});
test("M16·H9 관리자 폐기는 재판정 통과로 풀리지 않고 갤러리에 다시 들어가지 않는다", opts, () => {
  const c = (admin) => { const body = { score: 90, pass: true, html_sha256: sha256Hex(HTML), result: {} }; const h = judgeRecordHeaders(SECRET, TOK, 90, true, body.html_sha256);
    return route({ method: "POST", path: `/mock/mockups/${TOK}/check`, mockups: [mine({ discarded_at: "2026-10-30" })], body, config: { "mock.judge_secret": SECRET }, server: { HTTP_X_PP_JUDGE_HTML: h["X-Pp-Judge-Html"] }, admin_discarded: admin }); };
  const a = c(true); assert.ok(!sqlHas(a, /INSERT INTO mock_gallery/)); assert.ok(sqlHas(a, /SET discarded_at = NULL WHERE id = \? AND NOT EXISTS/));
  const b = c(false); assert.ok(sqlHas(b, /INSERT INTO mock_gallery/), "음성 대조: 판정 폐기는 통과로 풀려 보관된다");
});

// ---------------------------------------------------------------- M11·L16 세트 열쇠·남의 token
test("M11 카드에 token 이 없다, 세트 묶기는 해시로 된다", opts, () => {
  const c = gal({ status: "shared" }); c.actor = { id: 2 };
  const r = route({ method: "GET", path: "/mock/gallery", ...c, set_sizes: [{ k: TOK, n: 3 }] });
  assert.ok(!r.raw.includes(TOK), "응답 어디에도 token 없음");
  const key = createHash("sha256").update(TOK).digest("hex").slice(0, 24);
  assert.equal(r.body.data[0].set, key);
  assert.equal(r.body.data[0].set_size, 3);
  const s = route({ method: "GET", path: "/mock/gallery", ...c, get: { set: key } });
  const q = s.sql.find((x) => /LEFT\(SHA2\(COALESCE\(NULLIF\(m\.base_token, ''\), m\.token\), 256\), 24\) = \?/.test(x.sql));
  assert.ok(q && q.params.includes(key), "세트 조건");
  const old = route({ method: "GET", path: "/mock/gallery", ...c, get: { set: TOK } });
  assert.ok(old.sql.some((x) => x.params?.includes(key)), "옛 주소 ?set=token 도 같은 세트");
  const inj = route({ method: "GET", path: "/mock/gallery", ...c, get: { set: "' OR 1=1 --" } });
  assert.ok(!inj.sql.some((x) => /' OR 1=1/.test(x.sql)), "음성 대조: 값이 SQL 에 끼지 않는다");
});
test("M11 상세 카드에도 token 이 없다", opts, () => {
  const r = route({ method: "GET", path: "/mock/gallery/3", ...gal({ status: "shared" }), actor: { id: 2 } });
  assert.equal(r.status, 200, r.raw); assert.ok(!r.raw.includes(TOK));
});
test("L16 남의 token 은 base_token 으로 저장되지 않는다, 내 것은 된다", opts, () => {
  const other = { id: 8, token: "OTHEROTHEROTHEROTHEROT", owner_user_id: 2, html: "x" };
  const html = "<!doctype html><html><body>새 서브 시안 본문입니다 충분히 긴 글</body></html>";
  const bad = route({ method: "POST", path: "/mock/mockups", mockups: [other], body: { html, base_token: other.token } });
  assert.equal(bad.status, 403, bad.raw); assert.ok(!sqlHas(bad, /INSERT INTO mock_mockups/));
  const good = route({ method: "POST", path: "/mock/mockups", mockups: [{ ...other, owner_user_id: 1 }], body: { html, base_token: other.token } });
  assert.notEqual(good.status, 403, good.raw); assert.ok(sqlHas(good, /INSERT INTO mock_mockups/));
});

// ---------------------------------------------------------------- M12·M13
test("M12 다시 판정에서 device 를 빼도 보관된 모바일을 유지한다, 주면 그 값", opts, () => {
  const params = (r) => r.sql.find((x) => /UPDATE mock_mockups SET html/.test(x.sql)).params;
  const keep = route({ method: "POST", path: "/mock/mockups", mockups: [mine({ device: "mobile" })], body: { token: TOK } });
  assert.equal(params(keep)[2], "mobile", keep.raw); assert.equal(keep.body.data.device, "mobile");
  const set = route({ method: "POST", path: "/mock/mockups", mockups: [mine({ device: "mobile" })], body: { token: TOK, device: "pc" } });
  assert.equal(params(set)[2], "pc");
});
test("M13 앞선 판정의 기관명을 보관 응답으로 돌려준다", opts, () => {
  const r = route({ method: "POST", path: "/mock/mockups", mockups: [mine({ check_json: JSON.stringify({ org_name: "청운군청" }) })], body: { token: TOK } });
  assert.equal(r.body.data.org_name, "청운군청");
  const none = route({ method: "POST", path: "/mock/mockups", mockups: [mine()], body: { token: TOK } });
  assert.equal(none.body.data.org_name, null, "음성 대조");
});
test("M13 기관명 — 인자 → 기록 → 프로세스 기억, buildServer 안에 Map 을 두지 않는다", () => {
  rememberOrg("t1", "새솔군청");
  assert.equal(judgeOrg("t1", undefined, undefined), "새솔군청");
  assert.equal(judgeOrg("t1", "인자", "기록"), "인자");
  assert.equal(judgeOrg("t1", undefined, "기록"), "기록");
  assert.equal(judgeOrg("없음", undefined, null), "", "음성 대조");
  const src = fs.readFileSync(path.join(HERE, "../src/index.ts"), "utf8");
  assert.ok(!/checkOrg/.test(src));
  assert.match(src, /ref_id: refId, device: a\.device \}/, "M12 보관 호출에 device");
});

// ---------------------------------------------------------------- M15
test("M15 기간이 끝난 게시는 published=false·expired=true·주소 없음, 다시 게시된다", opts, () => {
  const base = { ...mine(), published_at: "2026-09-01", passed: 1, score: 90, g_id: null, g_status: null, device: "pc", title: "t", ref_id: null, check_count: 1, views: 0, has_thumb: 0, updated_at: "2026-10-01", expires_at: "2026-10-01", created_at: "2026-09-01", checked_at: null, discarded_at: null };
  const r = route({ method: "GET", path: "/mock/mockups", list_rows: [{ ...base, is_expired: 1 }] });
  assert.deepEqual([r.body.data[0].published, r.body.data[0].expired, r.body.data[0].path], [false, true, null]);
  const live = route({ method: "GET", path: "/mock/mockups", list_rows: [{ ...base, is_expired: 0 }] });
  assert.deepEqual([live.body.data[0].published, live.body.data[0].expired], [true, false], "음성 대조");
  const again = route({ method: "POST", path: "/mock/mockups", mockups: [mine({ passed: 1, published_at: "2026-09-01", expires_at: "2026-10-01" })], body: { mode: "publish", token: TOK } });
  assert.equal(again.status, 200); assert.ok(sqlHas(again, /expires_at = NOW\(3\) \+ INTERVAL 30 DAY/));
});

// ---------------------------------------------------------------- L15 차감 잠금
test("L15 차감은 사용자 행을 잠근 뒤 잔액을 본다, 모자라면 false", opts, () => {
  const ok = JSON.parse(execFileSync("php", [path.join(HERE, "php/mock-route-harness.php"), JSON.stringify({ mode: "points", balance: 30 }), "--real-points"], { encoding: "utf8" }));
  assert.equal(ok.body.spent, true, ok.raw);
  const seq = ok.sql.map((x) => x.sql);
  const lock = seq.findIndex((s) => /FROM core_users WHERE id = \? FOR UPDATE/.test(s)); const bal = seq.findIndex((s) => /SUM\(delta\)/.test(s)); const ins = seq.findIndex((s) => /INSERT IGNORE INTO core_point_ledger/.test(s));
  assert.ok(seq[0] !== "BEGIN" ? seq.includes("BEGIN") : true);
  assert.ok(lock >= 0 && lock < bal && bal < ins, seq.join(" | "));
  assert.ok(seq.indexOf("BEGIN") < lock && seq.indexOf("COMMIT") > ins);
  const no = JSON.parse(execFileSync("php", [path.join(HERE, "php/mock-route-harness.php"), JSON.stringify({ mode: "points", balance: 29 }), "--real-points"], { encoding: "utf8" }));
  assert.equal(no.body.spent, false, "음성 대조: 1P 모자라면 안 뺀다");
  assert.ok(!no.sql.some((x) => /INSERT IGNORE/.test(x.sql)));
});

// ---------------------------------------------------------------- L17 와이어 PUT
const wf = { id: 1, public_id: "wid12345", owner_user_id: 1, title: "t", screen: "main", org_kind: "all", request: "옛 요청", json: JSON.stringify({ screen: "main", org: "all", rows: [{ zone: "body", cols: [{ k: "content_block", span: 12 }] }] }), score: 90, pass: 1, check_result: "{}", source: "rule", visibility: "private", created_at: "2026-10-01", updated_at: "2026-10-01" };
test("L17 PUT — 빈 줄은 막고 요청 글·출처를 저장한다", opts, () => {
  const empty = route({ method: "PUT", path: "/mock/wireframes/wid12345", wireframe: wf, body: { wire: { screen: "main", rows: [] } } });
  assert.equal(empty.status, 400, empty.raw); assert.ok(!sqlHas(empty, /UPDATE mock_wireframes/));
  const ok = route({ method: "PUT", path: "/mock/wireframes/wid12345", wireframe: wf, body: { wire: { screen: "main", org: "all", rows: [{ zone: "body", cols: [{ k: "content_block", span: 12 }] }] }, request: "새 요청", source: "ai" } });
  assert.equal(ok.status, 200, ok.raw);
  const u = ok.sql.find((x) => /UPDATE mock_wireframes SET/.test(x.sql));
  assert.equal(u.params[3], "새 요청"); assert.equal(u.params[4], "ai");
  const keep = route({ method: "PUT", path: "/mock/wireframes/wid12345", wireframe: wf, body: { title: "제목만" } });
  const k = keep.sql.find((x) => /UPDATE mock_wireframes SET/.test(x.sql));
  assert.equal(k.params[3], "옛 요청", "음성 대조: 안 보내면 그대로"); assert.equal(k.params[4], "rule");
});

// ---------------------------------------------------------------- L19 미리보기 치환
const H2 = `<!doctype html><body><a href="greeting.html#x">인사말</a><a href="vision.html">비전</a><img src="/api/v1/assets/samples/abcdef12/original"></body>`;
test("L19 미리보기 — 샘플은 웹 사본, 세트 메뉴는 게시 주소", opts, () => {
  const r = route({ method: "GET", path: `/mock/mockups/${TOK}/html`, mockups: [mine({ html: H2 })], siblings: [{ token: "SUBSUBSUBSUBSUBSUBSUBS", page: "greeting", g_id: 9 }] });
  assert.ok(r.raw.includes('href="/api/v1/p/SUBSUBSUBSUBSUBSUBSUBS#x"'), r.raw.slice(0, 300));
  assert.ok(r.raw.includes('href="vision.html"'), "음성 대조: 게시 안 한 페이지는 그대로");
  assert.ok(r.raw.includes("/abcdef12/web"));
});
test("L19 갤러리 보기 — 열람권 없는 페이지 token 을 주지 않는다", opts, () => {
  const c = { ...gal({ status: "shared", html: H2 }), actor: { id: 2 }, siblings: [{ token: "SUBSUBSUBSUBSUBSUBSUBS", page: "greeting", g_id: 9 }] };
  assert.equal(route({ method: "GET", path: "/mock/gallery/3/html", ...c }).status, 402, "이 시안 열람권이 없으면 본문도 없다");
  const viewer = route({ method: "GET", path: "/mock/gallery/3/html", ...c, unlocked: true, unlocks: [{ gallery_id: 3 }] });
  assert.ok(viewer.raw.includes("/abcdef12/web"), viewer.raw.slice(0, 200));
  assert.ok(!viewer.raw.includes("SUBSUB"), "열람권 없는 서브(g_id 9)의 token 을 싣지 않는다");
  assert.ok(viewer.raw.includes('href="greeting.html#x"'));
  const paid = route({ method: "GET", path: "/mock/gallery/3/html", ...c, unlocked: true, unlocks: [{ gallery_id: 3 }, { gallery_id: 9 }] });
  assert.ok(paid.raw.includes("/api/v1/p/SUBSUB"), "음성 대조: 열람권이 있으면 잇는다");
  const owner = route({ method: "GET", path: "/mock/gallery/3/html", ...c, actor: { id: 1 } });
  assert.ok(owner.raw.includes("/api/v1/p/SUBSUB"), "주인은 잇는다");
  const admin = route({ method: "GET", path: "/mock/gallery/3/html", ...c, actor: { id: 9, roles: ["admin"] } });
  assert.ok(admin.raw.includes("/abcdef12/web"));
});

// ---------------------------------------------------------------- L20·L21
test("L20 AI 응답만 source=ai", () => {
  assert.equal(wireSource({ source: "ai" }), "ai");
  assert.equal(wireSource({ source: "rule" }), "rule");
  assert.equal(wireSource(null), "rule", "음성 대조");
});
test("L21 포인트 창 보관 기준은 코드 값(85점+), DB 글이 옛 값이어도", opts, () => {
  const r = route({ method: "GET", path: "/mock/points", rules: [{ reason: "mockup_keep", delta: 20, daily_cap: 5, yearly_cap: null, note: "시안 보관 81점+" }, { reason: "post", delta: 10, daily_cap: 5, yearly_cap: null, note: "글" }] });
  assert.equal(r.body.data.rules[0].name, "시안 보관 85점+");
  assert.equal(r.body.data.rules[1].name, "글", "음성 대조: 다른 규칙 글은 그대로");
  const schema = fs.readFileSync(path.join(HERE, "../../../db/schema.sql"), "utf8");
  assert.ok(!schema.includes("81점+"));
});

// ---------------------------------------------------------------- M20 플랜 서명
test("M20 서명 맞을 때만 X-Pp-Plan 을 믿는다", opts, () => {
  const now = 1_800_000_000;
  const h = planHeaders(SECRET, "pro", now);
  const call = (o) => unit({ fn: "plan", hint: "pro", sig: h["X-Pp-Plan-Sig"], ts: now, secret: SECRET, now, ...o }).ok;
  assert.equal(call({}), true);
  assert.equal(call({ hint: "staff" }), false, "플랜을 바꿔 붙이면 거부");
  assert.equal(call({ sig: "" }), false, "헤더만 붙인 일반 키");
  assert.equal(call({ secret: "다른비밀" }), false);
  assert.equal(call({ secret: "" }), false, "비밀이 비면 거부");
  assert.equal(call({ now: now + 301 }), false, "오래된 서명");
  assert.deepEqual(planHeaders("", "pro"), {}, "비밀 없으면 서명 없음");
});
test("M20 Plan.php 가 서명 없는 힌트를 지나가지 못하게 쓴다", () => {
  const src = fs.readFileSync(path.join(HERE, "../../../services/mockref-api/src/Plan.php"), "utf8");
  assert.match(src, /\$hint !== '' && self::planHintSigned\(/);
  assert.ok(!/if \(\$hint !== ''\) \{\s*if \(in_array/.test(src));
});

// ---------------------------------------------------------------- L22 큰 와이어
test("L22 큰 와이어만 압축, 엔진이 그대로 푼다", opts, () => {
  const small = { rows: [{ zone: "body", cols: [{ k: "a", span: 12 }] }] };
  assert.deepEqual(Object.keys(wireQuery(small)), ["wire"], "음성 대조: 작은 와이어는 그대로");
  const big = { screen: "main", org: "all", lnb: false, rows: Array.from({ length: 40 }, () => ({ zone: "body", cols: Array.from({ length: 6 }, () => ({ k: "notice_board", span: 2, h: 300 })) })) };
  assert.ok(encodeURIComponent(JSON.stringify(big)).length > 8190, "압축 안 하면 8KB 를 넘는 크기");
  const q = wireQuery(big);
  assert.ok(q.wire_z && !q.wire && q.wire_z.length < 3000, String(q.wire_z?.length));
  assert.deepEqual(JSON.parse(unit({ fn: "wire", get: { wire_z: q.wire_z } }).json), big);
  assert.equal(unit({ fn: "wire", get: { wire: "{}" } }).json, "{}");
  assert.equal(unit({ fn: "wire", get: {} }).json, "");
  assert.equal(unit({ fn: "wire", get: { wire_z: "깨진값!!" } }).json, "invalid", "못 풀면 BAD_WIRE 로 가는 값");
});

function http(r) { return r.status; }
