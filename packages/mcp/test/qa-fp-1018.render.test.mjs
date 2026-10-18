// 판정기 오탐·미탐 렌더 시험(2026-10-18 운영 시험 10건 와이어 → 시안). 로컬 Firefox — 못 띄우면 건너뛴다.
// ① 칸 간격: 카드 안 2단(사진|목록)·padding 을 칸 사이로 재지 않는다(양성) / 실제로 다른 칸 사이 60px 는 잡는다(음성 대조)
// ② 깨진 svg 경로 d="[object Object]" 는 치명(음성) / 정상 아이콘은 통과(양성)
// ③ 배너 자리: 글자 든 샘플 목록에 있는 그림은 '글자 없는 사진'이 아니다(양성) · 목록에 없는 그림은 잡는다(음성) · 목록을 못 받으면 가정하지 않는다
// ④ 바닥글 바로 위 폭 가득 색 띠 + hb-foot-flush 는 '붙어 있다'가 아니다(양성) / 띠 안 내용이 띠 끝에 붙은 것·띠 없이 붙은 것은 잡는다(음성)
// ⑤ 나란한 칸 높이 차 메시지에 짧은 칸·긴 칸 이름이 나온다
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMockup } from "../src/qa/check.mjs";
import { layoutChecks, overlapChecks } from "../src/qa/layout.mjs";
import { gates } from "../src/qa/gates.mjs";
import { measureVisual, visualFixes } from "../src/qa/visual.mjs";

let pw = null; let sharp = null;
try {
  pw = await import("playwright-core"); sharp = (await import("sharp")).default;
  const b = await pw.firefox.launch(); await b.close();
} catch (e) { pw = null; console.log("# Firefox 를 띄우지 못해 렌더 시험을 건너뜀:", String(e?.message ?? e).slice(0, 160)); }
const opts = { skip: !pw, timeout: 300_000 };

const img = (w, h, c) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${c}"/></svg>`)}`;
const page = (css, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>한빛시</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 sans-serif;color:#1F2328;background:#fff}.wrap{max-width:1400px;margin:0 auto}
header{height:100px;display:flex;align-items:center;padding:0 40px;border-bottom:1px solid #E3E5E8}header h1{font-size:24px;margin:0}
.sec{margin-top:72px}.grid{display:grid;gap:24px}.card{background:#fff;border:1px solid #E3E5E8;border-radius:12px;padding:32px}
.card h2{font-size:22px;margin:0 0 12px}ul{margin:0;padding:0;list-style:none}li{padding:8px 0}
footer{margin-top:80px;background:#1F2328;color:#fff;padding:40px 0;height:200px}
@media (max-width:768px){.grid{grid-template-columns:1fr!important}}${css}</style></head><body>
<header><h1>한빛시</h1></header><main id="main">${body}</main><footer><div class="wrap"><p>한빛시 · 대표전화 1234-5678</p></div></footer></body></html>`;
const li = (n, t = "한빛시 소식") => Array.from({ length: n }, (_, i) => `<li><a href="#n${i}">${t} 안내 ${i + 1}</a></li>`).join("");
const card = (t, n = 5) => `<div class="card"><h2>${t}</h2><ul>${li(n)}</ul></div>`;
const icon = (d) => `<a href="#sns" aria-label="유튜브"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg></a>`;
// 세 줄 모두 칸 사이 24px. 2번 줄 왼쪽 칸은 안에 사진|목록 2단(padding 32) — 전에는 24·57px 로 잼
const gapPage = (rowGap2 = 24, d = "M12 2 2 22h20Z") => page(`.g3{grid-template-columns:1fr 1fr 1fr}.g84{grid-template-columns:8fr 4fr}.g66{grid-template-columns:1fr 1fr}.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}.two img{width:100%;height:220px;object-fit:cover;display:block;border-radius:8px}`, `
<section class="sec" data-wire-row="1"><div class="wrap grid g3">${card("알림판")}${card("새 소식")}${card("행사 일정")}</div></section>
<section class="sec" data-wire-row="2"><div class="wrap grid g84" style="gap:${rowGap2}px"><div class="card"><h2>한빛 소식</h2><div class="two"><img src="${img(600, 220, "#5B626B")}" alt="소식 사진"><ul>${li(5)}</ul></div></div>${card("자주 찾는 서비스")}</div></section>
<section class="sec" data-wire-row="3"><div class="wrap grid g66">${card("공지사항")}${card("보도자료")}</div></section>
<section class="sec" data-wire-row="4"><div class="wrap grid g66">${card("민원 안내")}<div class="card"><h2>누리소통망</h2>${icon(d)}${icon(d)}${icon(d)}</div></div></section>`);
const wire = { screen: "main", org: "local", rows: [1, 2, 3, 4].map((no) => ({ no, zone: "body", cols: no === 1 ? [{ k: "news_tabs", span: 4 }, { k: "news_tabs", span: 4 }, { k: "calendar", span: 4 }] : no === 2 ? [{ k: "news_tabs", span: 8 }, { k: "quick_links", span: 4 }] : [{ k: "news_tabs", span: 6 }, { k: "news_tabs", span: 6 }] })) };
const ref = { screen_id: 1, ref_id: "wire1:TEST:1500:1", site_slug: "wire", page_type: "main", width: 1920, height: 3000, sub: null, leak: [], rows: [] };
const run = (html, w = wire) => checkMockup({ html, ref, refImage: null, sharp, launch: () => pw.firefox.launch(), width: 1920, want: "한빛시", wire: w });
const gapFix = (r) => r.fixes.filter((f) => /^칸 간격/.test(f));

test("① 칸 간격 양성 — 카드 안 2단(사진|목록)·padding 을 칸 사이로 재지 않는다(칸 표시 없이)", opts, async () => {
  const { result } = await run(gapPage());
  console.log("# ① 양성 score", result.score, "gap", result.frame.gap, JSON.stringify(gapFix(result)));
  assert.deepEqual(gapFix(result), [], gapFix(result).join(" / "));
  assert.equal(result.frame.gap, 24);
  assert.ok(!result.hard_fails.some((h) => /깨진 아이콘/.test(h)), "정상 아이콘은 깨진 아이콘이 아니다");
});

test("① 칸 간격 음성 대조 — 2번 줄 칸 사이 60px 는 잡는다 · ② 깨진 svg 경로는 치명", opts, async () => {
  const { result } = await run(gapPage(60, "[object Object]"));
  console.log("# ① 음성 score", result.score, JSON.stringify(gapFix(result)), JSON.stringify(result.hard_fails));
  assert.ok(gapFix(result).some((f) => /60/.test(f)), `60px 칸 간격을 잡아야 한다: ${result.fixes.slice(0, 6).join(" / ")}`);
  assert.ok(result.hard_fails.includes("깨진 아이콘(svg 경로)"), JSON.stringify(result.hard_fails));
  assert.ok(result.fixes.some((f) => /깨진 아이콘 3개/.test(f)));
  assert.equal(result.pass, false);
});

test("① 한 칸(data-wire-cell) 안 사진·글 사이는 칸 간격이 아니다", opts, async () => {
  const hero = (inner) => page(`.g66{grid-template-columns:1fr 1fr}.hero{display:grid;grid-template-columns:1fr 1fr;gap:${inner}px}.hero img{width:100%;height:360px;object-fit:cover;display:block}`, `
<section class="sec" data-wire-row="1"><div class="wrap hero" data-wire-cell="main_visual"><img src="${img(700, 360, "#5B626B")}" alt="한빛시 풍경"><div><h2>함께 여는 한빛시</h2><p>시민과 함께 만드는 내일입니다.</p></div></div></section>
<section class="sec" data-wire-row="2"><div class="wrap grid g66">${card("공지사항", 6).replace('class="card"', 'class="card" data-wire-cell="news_tabs"')}${card("보도자료", 6).replace('class="card"', 'class="card" data-wire-cell="news_tabs"')}</div></section>
<section class="sec" data-wire-row="3"><div class="wrap grid g66">${card("민원 안내", 6).replace('class="card"', 'class="card" data-wire-cell="quick_links"')}${card("행사", 6).replace('class="card"', 'class="card" data-wire-cell="calendar"')}</div></section>`);
  const w = { screen: "main", org: "local", rows: [{ no: 1, zone: "body", cols: [{ k: "main_visual", span: 12 }] }, { no: 2, zone: "body", cols: [{ k: "news_tabs", span: 6 }, { k: "news_tabs", span: 6 }] }, { no: 3, zone: "body", cols: [{ k: "quick_links", span: 6 }, { k: "calendar", span: 6 }] }] };
  const { result } = await run(hero(56), w);
  console.log("# ① 한 칸 score", result.score, JSON.stringify(gapFix(result)));
  assert.deepEqual(gapFix(result), [], gapFix(result).join(" / "));
});

// ③·④·⑤ 는 판정 함수만 바로 부른다(빠름)
async function withPage(html, fn) {
  const b = await pw.firefox.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    // 샘플 그림 주소는 로컬에서 그려 준다(네트워크 없이)
    await p.route("**/assets/samples/**", (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400"><rect width="100%" height="100%" fill="#123"/></svg>` }));
    await p.setContent(html, { waitUntil: "load" }); await p.waitForTimeout(300);
    return await fn(p);
  } finally { await b.close(); }
}
const S = "https://powerplus.test/api/v1/assets/samples";
const bannerPage = page(`.bz{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.bz img{width:100%;height:110px;object-fit:contain;display:block}`, `
<section class="sec"><div class="wrap"><h2>배너 모음</h2><div class="bz">${["k1aaaaaaaa", "k2aaaaaaaa", "k3aaaaaaaa"].map((k) => `<a href="#b"><img src="${S}/${k}/web" alt=""></a>`).join("")}</div></div></section>`);
const plainMsg = (r) => (r.fails || []).filter((f) => /글자 없는 사진/.test(f));

test("③ 배너 자리 — 글자 든 샘플(textKeys)은 통과 · 목록에 없는 그림은 잡음 · 목록이 비면 가정하지 않음", opts, async () => {
  const ok = await withPage(bannerPage, (p) => layoutChecks(p, { textKeys: ["k1aaaaaaaa", "k2aaaaaaaa", "k3aaaaaaaa"] }));
  const neg = await withPage(bannerPage, (p) => layoutChecks(p, { textKeys: ["zzzzzzzzzz"] }));
  const none = await withPage(bannerPage, (p) => layoutChecks(p, { textKeys: [] }));
  console.log("# ③", plainMsg(ok).length, plainMsg(neg).length, plainMsg(none).length);
  assert.equal(plainMsg(ok).length, 0, plainMsg(ok).join(" / "));
  assert.equal(plainMsg(neg).length, 1, "목록에 없는 그림 3장은 '글자 없는 사진'으로 잡아야 한다(음성 대조)");
  assert.equal(plainMsg(none).length, 0, "글자 목록을 못 받으면 샘플 그림을 글자 없는 사진으로 가정하지 않는다");
});

const footPage = (bandCss, flush) => page(`.band{background:#EEF3FB;${bandCss}}.band p{margin:0}`, `
<section class="sec"><div class="wrap">${card("공지사항")}</div></section>
<div class="band"><section class="wrap"><h2>AI 상담</h2><p>무엇이든 물어보세요.</p></section></div>`).replace("<footer>", `<footer${flush ? ' class="hb-foot-flush" style="margin-top:0"' : ""}>`);
const footFix = (v) => visualFixes(v).fixes.filter((f) => /바닥글 여백/.test(f));

test("④ 바닥글 위 폭 가득 색 띠 + hb-foot-flush 는 감점하지 않음 · 붙은 내용은 잡음", opts, async () => {
  const ok = await withPage(footPage("margin-top:48px;padding:56px 0", true), (p) => measureVisual(p));
  const tight = await withPage(footPage("margin-top:48px;padding:56px 0 0", true), (p) => measureVisual(p));
  const plain = await withPage(footPage("margin-top:48px;padding:56px 0", false).replace(/\.band\{background:#EEF3FB;/, ".band{").replace("margin-top:80px;background:#1F2328", "margin-top:0;background:#1F2328").replace("padding:56px 0", "padding:56px 0 0"), (p) => measureVisual(p));
  console.log("# ④", JSON.stringify(ok.foot), JSON.stringify(tight.foot), JSON.stringify(plain.foot));
  assert.equal(ok.foot.band, true);
  assert.deepEqual(footFix(ok), [], footFix(ok).join(" / "));
  assert.ok(tight.foot.band && footFix(tight).some((f) => /색 띠 안/.test(f)), `띠 안 내용이 띠 끝에 붙은 것은 잡아야 한다: ${JSON.stringify(tight.foot)}`);
  assert.ok(!plain.foot.band && footFix(plain).some((f) => /붙어 있다/.test(f)), `띠 없이 바닥글에 붙은 것은 잡아야 한다: ${JSON.stringify(plain.foot)}`);
});

test("⑤ 나란한 칸 높이 차 — 짧은 칸·긴 칸 이름이 메시지에 있다", opts, async () => {
  const html = page(`.g66{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}`, `
<section class="sec"><div class="wrap g66"><div class="card" data-wire-cell="ai_chatbot"><h2>짧은칸</h2><ul>${li(3)}</ul></div><div class="card" data-wire-cell="popup_zone"><h2>긴칸</h2><ul>${li(9)}</ul></div></div></section>`);
  const g = await withPage(html, (p) => gates(p));
  const m = g.fails.find((f) => /같은 행 높이 차/.test(f)) || "";
  console.log("#", m);
  assert.match(m, /짧은 칸 '짧은칸'\(ai_chatbot/);
  assert.match(m, /긴 칸 '긴칸'\(popup_zone/);
});

// ⑥ 겹침(사용자 지적 w02): 메인 비주얼 단추와 캐러셀 조작 막대가 겹치면 잡는다(음성) · 떼어 놓은 꼴·슬라이드 위에 통째로 올린 넘김 단추는 통과(양성)
const heroPage = (ctrlBottom) => page(`.hero{position:relative;height:440px;background:#1F2328;color:#fff}.txt{position:absolute;left:64px;top:300px}.btn{display:inline-block;height:48px;line-height:48px;padding:0 24px;background:#fff;color:#1F2328}
.ctrl{position:absolute;${ctrlBottom === 'right' ? 'right:64px' : 'left:64px'};bottom:40px;display:flex;gap:6px}.ctrl button{width:40px;height:40px}
.slide{position:relative;display:block;width:600px;height:300px;margin:40px auto;background:#9AA3AD}.slide button{position:absolute;right:16px;bottom:16px;width:40px;height:40px}`, `
<section class="wrap hero"><div class="txt"><h2>믿을 수 있는 정책</h2><a class="btn" href="#p">주요 정책 보기</a></div><div class="ctrl"><button type="button" aria-label="이전">&lt;</button><button type="button" aria-label="다음">&gt;</button></div></section>
<div class="wrap"><a class="slide" href="#s">팝업 배너</a></div>`).replace('<a class="slide" href="#s">팝업 배너</a>', '<div class="slide"><a href="#s" style="position:absolute;inset:0">팝업 배너</a><button type="button" aria-label="다음 팝업">&gt;</button></div>');

test("⑥ 겹침 — 단추와 조작 막대 겹침은 잡고, 떼어 놓은 꼴·슬라이드 위 넘김 단추는 통과", opts, async () => {
  const neg = await withPage(heroPage('left'), (p) => overlapChecks(p));
  const ok = await withPage(heroPage('right'), (p) => overlapChecks(p));
  console.log("# ⑥", JSON.stringify(neg.click), JSON.stringify(ok.click));
  assert.ok(neg.click.some((t) => /주요 정책 보기/.test(t) && /이전/.test(t)), `겹침을 잡아야 한다: ${JSON.stringify(neg)}`);
  assert.deepEqual(ok.click, [], JSON.stringify(ok.click));
  assert.deepEqual(ok.text, [], JSON.stringify(ok.text));
});

// ⑦ 한 칸 안 나란한 단 끝선(사용자 지적 w02): 사진 카드 묶음 | 목록, 오른쪽이 42px 길면 잡는다(음성) · 끝을 맞춘 꼴은 통과(양성)
const colPage = (rightN) => page(`.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}.ph{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ph img{width:100%;height:160px;display:block;object-fit:cover}.ph p{margin:8px 0 0;height:30px}.lst li{height:42px;padding:0;line-height:42px}`, `
<section class="sec"><div class="wrap"><div class="card" data-wire-cell="news_tabs"><h2>소식</h2><div class="two"><div class="ph"><div><img src="${img(300, 160, "#5B626B")}" alt="소식 사진 1"><p>산불 대비 합동 훈련</p></div><div><img src="${img(300, 160, "#9AA3AD")}" alt="소식 사진 2"><p>청년 정책 자문단</p></div></div><ul class="lst">${li(rightN)}</ul></div></div></div></section>`);
const colMsg = (r) => (r.fails || []).filter((f) => /나란한 단 끝선/.test(f));

test("⑦ 한 칸 안 나란한 단 끝선 — 16px 넘는 차이는 잡고, 맞춘 꼴은 통과", opts, async () => {
  const neg = await withPage(colPage(6), (p) => layoutChecks(p, { textKeys: ["x"] }));
  const ok = await withPage(colPage(5), (p) => layoutChecks(p, { textKeys: ["x"] }));
  console.log("# ⑦", JSON.stringify(colMsg(neg)), JSON.stringify(colMsg(ok)));
  assert.equal(colMsg(neg).length, 1, `끝선 차이를 잡아야 한다: ${JSON.stringify(neg.r.colEnd)}`);
  assert.match(colMsg(neg)[0], /ul\.lst\) 이 단 .* 보다 \d+px 길다/);
  assert.equal(colMsg(ok).length, 0, JSON.stringify(colMsg(ok)));
});
