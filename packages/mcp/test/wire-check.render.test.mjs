// 시안 판정(check.mjs)의 와이어 모드 렌더 시험 — 로컬 Firefox(이 PC 는 Chromium 이 막힘). node --test packages/mcp/test/
// (a) 와이어를 따르되 레퍼런스와 다른 시안 → 와이어 일치 통과 · 높이 치명 없음  /  (a') 같은 시안을 와이어 없이 레퍼런스로 재면 높이 치명(대조)
// (b) 와이어를 무시한 시안 → 와이어 일치 실패(음성 대조)  /  (b') 표시는 달았지만 줄 순서·칸 폭을 바꾼 시안 → 실패
// 브라우저를 못 띄우면 건너뛴다. 실제 조립기 HTML(빠른 초안) 시험은 PP_WIRE_MAIN_HTML=<mockref /api/mockups/main 응답 json> PP_WIRE_JSON=<와이어 json> 를 주면 같이 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkMockup } from "../src/qa/check.mjs";

const wire = { screen: "main", org: "local", rows: [
  { zone: "top", cols: [{ k: "masthead", span: 12 }] },
  { zone: "top", cols: [{ k: "header", span: 12 }] },
  { zone: "body", cols: [{ k: "main_visual", span: 12 }] },
  { zone: "body", cols: [{ k: "news_tabs", span: 8 }, { k: "quick_links", span: 4 }] },
  { zone: "body", cols: [{ k: "banner_zone", span: 12 }] },
  { zone: "bottom", cols: [{ k: "footer", span: 12 }] },
] };
// 레퍼런스(일부러 와이어와 다른 구성·높이 4,200): 인사말 → 3칸 줄 → 사진 카드 → 바로가기 2칸 → 바닥
const ref = { screen_id: 1, ref_id: "wire1:TEST:1500:1", site_slug: "wire", page_type: "main", width: 1920, height: 4200, sub: null, leak: ["레퍼런스시청"],
  rows: [
    { y: 0, h: 160, gap_above: 0, content_x: 0, content_w: 1920, full_bleed: true, cells: [{ no: 1, type: "header", x: 0, y: 0, w: 1920, h: 160 }] },
    { y: 200, h: 700, gap_above: 40, content_x: 260, content_w: 1400, full_bleed: false, cells: [{ no: 2, type: "greeting_vision", x: 260, y: 200, w: 1400, h: 700 }] },
    { y: 980, h: 600, gap_above: 80, content_x: 260, content_w: 1400, full_bleed: false, cells: [{ no: 3, type: "popup_zone", x: 260, y: 980, w: 440, h: 600 }, { no: 4, type: "news_ticker", x: 740, y: 980, w: 440, h: 600 }, { no: 5, type: "quick_links", x: 1220, y: 980, w: 440, h: 600 }] },
    { y: 1660, h: 900, gap_above: 80, content_x: 0, content_w: 1920, full_bleed: true, cells: [{ no: 6, type: "tour_cards", x: 0, y: 1660, w: 1920, h: 900 }] },
    { y: 2640, h: 800, gap_above: 80, content_x: 260, content_w: 1400, full_bleed: false, cells: [{ no: 7, type: "quick_links", x: 260, y: 2640, w: 680, h: 800 }, { no: 8, type: "quick_links", x: 980, y: 2640, w: 680, h: 800 }] },
    { y: 3800, h: 400, gap_above: 360, content_x: 0, content_w: 1920, full_bleed: true, cells: [{ no: 9, type: "footer", x: 0, y: 3800, w: 1920, h: 400 }] },
  ] };

const img = (w, h, c) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${c}"/></svg>`)}`;
const page = (body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>한빛시</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 sans-serif;color:#1F2328}.wrap{max-width:1400px;margin:0 auto}
header{height:120px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;border-bottom:1px solid #E3E5E8}header h1{font-size:24px;margin:0}
.mast{height:34px;background:#F5F6F8;font-size:13px;padding:8px 40px}
.vis{position:relative;height:460px}.vis img{width:100%;height:460px;object-fit:cover;display:block}.vis h2{position:absolute;left:260px;top:160px;font-size:48px;margin:0;color:#fff}
.sec{margin-top:72px}.grid{display:grid;gap:24px}.g84{grid-template-columns:8fr 4fr}
.card{background:#fff;border:1px solid #E3E5E8;border-radius:12px;padding:24px;transition:transform .2s,box-shadow .2s}.card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.1)}
.card h2{font-size:24px;margin:0 0 16px}ul{margin:0;padding:0;list-style:none}li{padding:10px 0;border-bottom:1px solid #E3E5E8}li:last-child{border-bottom:0}
.quick{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.quick a{display:block;text-align:center;padding:16px 4px;border-radius:12px;background:#F5F6F8;color:#1F2328;text-decoration:none}.quick a:hover{transform:scale(1.04)}
.ban img{width:100%;height:140px;object-fit:cover;border-radius:12px;display:block}
footer{margin-top:80px;background:#1F2328;color:#fff;padding:40px 0;height:240px}
@media (max-width:768px){.g84{grid-template-columns:1fr}.vis h2{left:16px;font-size:28px}header{padding:0 16px}}
@media (prefers-reduced-motion: reduce){*{transition:none!important}}</style></head><body>
<div class="mast">이 누리집은 대한민국 공식 전자정부 누리집입니다.</div>
<header><h1>한빛시</h1><nav aria-label="주 메뉴"><a href="#a">분야별 정보</a> <a href="#b">열린 행정</a></nav></header>
<main id="main">${body}</main>
<footer><div class="wrap"><p>한빛시 · (12345) 한빛시 중앙로 100 · 대표전화 1234-5678</p></div></footer></body></html>`;
const listItems = (n) => Array.from({ length: n }, (_, i) => `<li><a href="#n${i}">2026년 한빛시 소식 안내 ${i + 1}</a></li>`).join("");
const quick = ["여권 민원", "생활 지원", "교통 정보", "문화 행사", "일자리", "복지 안내"].map((t, i) => `<a href="#q${i}">${t}</a>`).join("");
// (a) 와이어대로: 비주얼 12 → 소식 8 + 바로가기 4 → 배너 12 (레퍼런스의 인사말·3칸 줄·사진 카드와는 전혀 다름)
const follows = page(`
<section class="vis" data-wire-row="3" data-wire-cell="main_visual"><img src="${img(1920, 460, "#5B626B")}" alt="한빛시 풍경"><h2>함께 여는 한빛시</h2></section>
<section class="sec" data-wire-row="4"><div class="wrap grid g84"><div class="card" data-wire-cell="news_tabs"><h2>한빛시 소식</h2><ul>${listItems(5)}</ul></div><div class="card" data-wire-cell="quick_links"><h2>자주 찾는 서비스</h2><div class="quick">${quick}</div></div></div></section>
<section class="sec" data-wire-row="5"><div class="wrap ban" data-wire-cell="banner_zone"><a href="#ban"><img src="${img(1400, 140, "#9AA3AD")}" alt="한빛시 행사 안내 배너"></a></div></section>`);
// (b) 와이어 무시: 레퍼런스처럼 인사말 → 3칸 줄, 표시 없음
const ignores = page(`
<section class="sec"><div class="wrap card"><h2>한빛시장 인사말</h2><p>${"한빛시를 찾아 주셔서 고맙습니다. ".repeat(12)}</p></div></section>
<section class="sec"><div class="wrap grid" style="grid-template-columns:1fr 1fr 1fr"><div class="card"><h2>알림판</h2><ul>${listItems(4)}</ul></div><div class="card"><h2>새 소식</h2><ul>${listItems(4)}</ul></div><div class="card"><h2>바로가기</h2><div class="quick">${quick}</div></div></div></section>`);
// (b') 표시는 달았지만 비주얼·배너 줄 번호를 바꿔(순서 뒤바뀜) 달고, 8:4 줄을 6:6 으로
const swapped = follows
  .replace('class="wrap grid g84"', 'class="wrap grid" style="grid-template-columns:1fr 1fr"')
  .replace('data-wire-row="3"', 'data-wire-row="TMP"').replace('data-wire-row="5"', 'data-wire-row="3"').replace('data-wire-row="TMP"', 'data-wire-row="5"');

let pw = null; let sharp = null;
try {
  pw = await import("playwright-core"); sharp = (await import("sharp")).default;
  const b = await pw.firefox.launch(); await b.close();
} catch (e) { pw = null; console.log("# Firefox 를 띄우지 못해 렌더 시험을 건너뜀:", String(e?.message ?? e).slice(0, 160)); }
const run = (html, w) => checkMockup({ html, ref, refImage: null, sharp, launch: () => pw.firefox.launch(), width: 1920, want: "한빛시", wire: w });
const opts = { skip: !pw, timeout: 300_000 };

test("(a) 와이어를 따른 시안 — 레퍼런스와 달라도 와이어 일치 통과, 높이 치명 없음", opts, async () => {
  const { result } = await run(follows, wire);
  console.log("# (a) score", result.score, "wire", JSON.stringify(result.wire_match && { s: result.wire_match.score, p: result.wire_match.pass }), "hard", JSON.stringify(result.hard_fails), "height", JSON.stringify({ r: result.height.reference, m: result.height.mockup, d: result.height.diff_pct }));
  assert.ok(result.wire_match, "wire_match 결과가 있어야 한다");
  assert.equal(result.wire_match.pass, true, JSON.stringify(result.wire_match.rows));
  assert.equal(result.wire_match.score, 100);
  assert.ok(!result.hard_fails.some((h) => /높이|와이어/.test(h)), `높이·와이어 치명이 없어야 한다: ${result.hard_fails.join(" / ")}`);
  assert.ok(!result.fixes.some((f) => /레퍼런스 \d+번째 줄/.test(f)), "레퍼런스 줄 칸 수 감점이 없어야 한다");
});

test("(a') 대조 — 같은 시안을 와이어 없이 레퍼런스로 재면 높이 치명(와이어 모드가 따른 것을 벌하지 않음을 보인다)", opts, async () => {
  const { result } = await run(follows, null);
  console.log("# (a') score", result.score, "hard", JSON.stringify(result.hard_fails), "diff", result.height.diff_pct);
  assert.equal(result.wire_match ?? null, null);
  assert.ok(result.hard_fails.some((h) => h.includes("높이 차 6% 초과")), result.hard_fails.join(" / "));
});

test("(b) 음성 대조 — 와이어를 무시한 시안은 와이어 일치 실패(치명)", opts, async () => {
  const { result } = await run(ignores, wire);
  console.log("# (b) score", result.score, "wire", JSON.stringify(result.wire_match && { s: result.wire_match.score, p: result.wire_match.pass }), "hard", JSON.stringify(result.hard_fails));
  assert.equal(result.wire_match.pass, false);
  assert.equal(result.pass, false);
  assert.ok(result.hard_fails.some((h) => h.includes("와이어")), result.hard_fails.join(" / "));
  assert.ok(result.fixes[0].startsWith("와이어 일치"), "와이어 고칠 점이 맨 앞");
});

test("(b') 음성 대조 — 표시는 달았지만 줄 순서·칸 폭을 바꾼 시안도 실패", opts, async () => {
  const { result } = await run(swapped, wire);
  console.log("# (b') wire", JSON.stringify(result.wire_match && { s: result.wire_match.score, p: result.wire_match.pass, order: result.wire_match.order_ok }), "hard", JSON.stringify(result.hard_fails));
  assert.equal(result.wire_match.pass, false);
  assert.equal(result.wire_match.order_ok, false);
  assert.ok(result.wire_match.rows.find((r) => r.no === 4).issues.some((i) => i.includes("칸 폭 비율")));
});

const realPath = process.env.PP_WIRE_MAIN_HTML;
test("(c) 빠른 초안(조립기)이 와이어대로 만든 메인 — 와이어 일치 통과", { ...opts, skip: !pw || !realPath || !fs.existsSync(realPath) }, async () => {
  const j = JSON.parse(fs.readFileSync(realPath, "utf8"));
  const w = JSON.parse(fs.readFileSync(process.env.PP_WIRE_JSON ?? "", "utf8"));
  const { result } = await checkMockup({ html: j.html, ref: { ...ref, rows: [], height: Number(String(j.ref_id).split(":")[2]) }, refImage: null, sharp, launch: () => pw.firefox.launch(), width: 1920, want: "", wire: w });
  console.log("# (c) score", result.score, "wire", JSON.stringify(result.wire_match && { s: result.wire_match.score, p: result.wire_match.pass, bad: result.wire_match.rows.filter((r) => !r.ok) }), "hard", JSON.stringify(result.hard_fails));
  assert.equal(result.wire_match.pass, true);
});
