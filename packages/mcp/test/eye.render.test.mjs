// 사람 눈 점검(eye.mjs) 렌더 시험 — 로컬 Firefox(이 PC 는 Chromium 이 막힘). 못 띄우면 건너뛴다.
// 검사마다 음성(일부러 걸려야 하는 꼴 — w02 에서 사용자가 눈으로 잡은 것)과 양성(고친 꼴)을 같이 본다(R14·R16).
// C 날짜 줄바꿈(숨은 탭 패널 안) / D 나란한 상자 빈 면 / E 글자 든 그림 cover 잘림(숨은 캐러셀 장 포함) / G 펼침판 글자 대비
// 운영 시안 w02 원본이 있으면(PP_EYE_W02, 기본 = 2026-10-18 운영 시험 폴더) 네 검사가 모두 걸리는지도 본다(그림은 운영 주소라 인터넷 필요).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { eyeChecks } from "../src/qa/eye.mjs";

let pw = null;
try { pw = await import("playwright-core"); const b = await pw.firefox.launch(); await b.close(); }
catch (e) { pw = null; console.log("# Firefox 를 띄우지 못해 렌더 시험을 건너뜀:", String(e?.message ?? e).slice(0, 160)); }
const opts = { skip: !pw, timeout: 300_000 };

// 샘플 그림 주소 흉내: …/assets/samples/{열쇠}/web → 글자 든 배너(16:9)
const SAMPLE = "https://pp.test/api/v1/assets/samples";
const svg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#2468ff"/><text x="20" y="${h / 2}" font-size="40" fill="#fff">청렴 신고센터</text></svg>`;
async function withPage(html, fn) {
  const b = await pw.firefox.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage();
    await p.route(`${SAMPLE}/**`, (r) => { const k = r.request().url().split("/samples/")[1].split("/")[0]; const [w, h] = k.startsWith("wide") ? [1450, 350] : [1280, 720]; return r.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(w, h) }); });
    await p.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await p.waitForTimeout(300);
    return await fn(p);
  } finally { await b.close(); }
}
const page = (css, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>한빛시</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.6 sans-serif;color:#1F2328;background:#fff;word-break:keep-all;overflow-wrap:break-word}.wrap{max-width:1400px;margin:0 auto}ul{margin:0;padding:0;list-style:none}
.box{background:#fff;border:1px solid #E3E5E8;border-radius:12px;padding:32px}.row{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:60px}
footer{margin-top:80px;background:#1F2328;color:#fff;padding:24px 0 120px}${css}</style></head><body><main>${body}</main></body></html>`;

// C — 날짜 칸 폭이 좁아 "2026.09" 가 두 줄(숨은 탭 패널 안에만 있음)
const dateCss = (fixed) => `.dl li{display:flex;gap:16px;padding:10px 0}.day{width:${fixed ? 88 : 44}px;flex:none;text-align:center}.day b{display:block;font-size:22px}.day span{font-size:15px${fixed ? ";white-space:nowrap" : ""}}`;
const dateBody = `<section class="wrap" data-hb="tabs"><div role="tablist"><button data-hb-tab="a">소식</button><button data-hb-tab="b">안전</button></div>
<div data-hb-panel="a"><ul class="dl"><li><span class="day"><b>14</b></span><span>탭 하나 글</span></li></ul></div>
<div data-hb-panel="b" hidden><ul class="dl"><li><span class="day"><b>28</b><span>2026.09</span></span><span>산행 중 낙상 사고 예방 안내</span></li></ul></div></section>`;
test("C 날짜 줄바꿈 — 숨은 탭 안 '2026.09' 두 줄은 잡고(음성), nowrap·넓힌 칸은 통과(양성)", opts, async () => {
  const neg = await withPage(page(dateCss(false), dateBody), (p) => eyeChecks(p));
  const pos = await withPage(page(dateCss(true), dateBody), (p) => eyeChecks(p));
  console.log("# C neg", neg.fails.filter((f) => /날짜/.test(f)));
  assert.ok(neg.items.some((x) => x.kind === "C" && /2026\.09/.test(x.msg)), "숨은 탭 패널의 꺾인 날짜를 잡아야 한다");
  assert.ok(!pos.items.some((x) => x.kind === "C"), pos.fails.join(" / "));
  // 잰 뒤 탭 상태를 되돌린다
  const hiddenAfter = await withPage(page(dateCss(false), dateBody), async (p) => { await eyeChecks(p); return p.evaluate(() => document.querySelector('[data-hb-panel="b"]').hidden); });
  assert.equal(hiddenAfter, true, "숨은 패널은 다시 숨겨져야 한다");
});

// D — 같은 높이 두 상자, 오른쪽은 목록 2줄뿐이라 바닥이 크게 빔
const li = (n) => Array.from({ length: n }, (_, i) => `<li style="padding:10px 0">한빛시 소식 안내 ${i + 1}</li>`).join("");
const boxBody = (rightN) => `<section class="wrap row"><div class="box"><h2>배너 모음</h2><ul>${li(8)}</ul></div><div class="box"><h2>소식</h2><ul>${li(rightN)}</ul></div></section>`;
test("D 나란한 상자 빈 면 — 한쪽 바닥 크게 빔은 잡고(음성), 내용 끝이 맞으면 통과(양성)", opts, async () => {
  const neg = await withPage(page("", boxBody(3)), (p) => eyeChecks(p));
  const pos = await withPage(page("", boxBody(8)), (p) => eyeChecks(p));
  console.log("# D neg", neg.fails.filter((f) => /상자/.test(f)));
  const d = neg.items.find((x) => x.kind === "D");
  assert.ok(d, "빈 면을 잡아야 한다"); assert.match(d.msg, /div\.box 안쪽 바닥이 \d+px 빔/);
  assert.ok(!pos.items.some((x) => x.kind === "D"), pos.fails.join(" / "));
});

// E — 글자 든 배너(16:9·4.1:1)를 cover 로 다른 비율 칸에 넣음. 하나는 숨은 캐러셀 장. 글자 없는 사진(목록에 없음)은 제외
const cropBody = (fixed) => `<section class="wrap" style="margin-top:40px"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">
<img src="${SAMPLE}/txt16x9aaaa/web" alt="지진 대피 요령" style="width:100%;${fixed ? "aspect-ratio:16/9" : "height:300px"};object-fit:cover">
<img src="${SAMPLE}/photo16x9aa/web" alt="풍경" style="width:100%;height:300px;object-fit:cover"></div>
<div data-hb="carousel"><div class="track"><div data-hb-slide><img src="${SAMPLE}/txt16x9aaaa/web" alt="첫 장" style="width:440px;height:248px;object-fit:cover"></div>
<div data-hb-slide hidden><img src="${SAMPLE}/wideaaaaaaa/web" alt="청렴 신고센터" style="width:440px;${fixed ? "aspect-ratio:1450/350;object-fit:contain" : "height:123px;object-fit:cover"}"></div></div></div></section>`;
const tk = ["txt16x9aaaa", "wideaaaaaaa"];
test("E 글자 든 그림 잘림 — cover 로 8% 넘게 잘린 글자 그림(숨은 장 포함)은 잡고(음성), 비율 맞춤·글자 없는 사진은 통과(양성)", opts, async () => {
  const neg = await withPage(page("", cropBody(false)), (p) => eyeChecks(p, { textKeys: tk }));
  const pos = await withPage(page("", cropBody(true)), (p) => eyeChecks(p, { textKeys: tk }));
  const none = await withPage(page("", cropBody(false)), (p) => eyeChecks(p, { textKeys: [] }));
  console.log("# E neg", neg.fails.filter((f) => /그림 잘림/.test(f)));
  const e = neg.items.filter((x) => x.kind === "E");
  assert.ok(e.some((x) => x.key === "txt16x9aaaa" && /좌우 \d+% 잘림/.test(x.msg)), "보이는 글자 그림 잘림");
  assert.ok(e.some((x) => x.key === "wideaaaaaaa"), "숨은 캐러셀 장의 글자 그림 잘림");
  assert.ok(!e.some((x) => x.key === "photo16x9aa"), "글자 없는 사진은 제외");
  assert.ok(!pos.items.some((x) => x.kind === "E"), pos.fails.join(" / "));
  assert.ok(!none.items.some((x) => x.kind === "E"), "글자 든 목록이 비면 가정하지 않는다(R07)");
});

// G — 바닥글 '관련 사이트' 펼침판: 바닥글 링크 흰 글자 규칙이 판 안 링크까지 덮어 흰 바탕에 흰 글자
const famCss = (fixed) => `footer a{color:#fff}.fam{position:relative;display:inline-block}.fam [data-hb-layer]{position:absolute;right:0;bottom:48px;width:240px;background:#fff;border-radius:10px;padding:8px}
.fam [data-hb-layer] a{display:block;padding:8px 12px${fixed ? ";color:#1F2328" : ""}}`;
const famBody = `<section class="wrap"><p>본문</p></section></main><footer><div class="wrap"><a href="#p">개인정보처리방침</a>
<div class="fam"><button type="button" data-hb-open="#fam" aria-label="관련 사이트 열기">관련 사이트</button><div id="fam" data-hb-layer hidden><a href="#">국가재난안전포털</a><a href="#">기후정보 개방 플랫폼</a></div></div></div></footer><main>`;
test("G 펼침판 글자 대비 — 흰 바탕 흰 글자는 잡고(음성), 판 글자색을 따로 주면 통과(양성)", opts, async () => {
  const neg = await withPage(page(famCss(false), famBody), (p) => eyeChecks(p));
  const pos = await withPage(page(famCss(true), famBody), (p) => eyeChecks(p));
  console.log("# G neg", neg.fails.filter((f) => /펼침판/.test(f)));
  assert.ok(neg.items.some((x) => x.kind === "G" && /관련 사이트/.test(x.msg) && /대비 1:1/.test(x.msg)), neg.fails.join(" / "));
  assert.ok(!pos.items.some((x) => x.kind === "G"), pos.fails.join(" / "));
  // 연 판은 다시 닫혀 있어야 한다
  const closed = await withPage(page(famCss(false), famBody), async (p) => { await eyeChecks(p); return p.evaluate(() => document.getElementById("fam").hidden); });
  assert.equal(closed, true);
});
test("G 펼침판 잘림 — 문서 끝에서 아래로 열리면 잡는다(음성)", opts, async () => {
  const down = famCss(true).replace("bottom:48px", "top:48px") + "footer{padding-bottom:8px}main:first-of-type{min-height:1600px}main:empty{display:none}";
  const neg = await withPage(page(down, famBody), (p) => eyeChecks(p));
  assert.ok(neg.items.some((x) => x.kind === "G" && /문서 끝 아래로/.test(x.msg)), neg.fails.join(" / "));
});

// 운영 시안 w02(사용자가 눈으로 네 가지를 잡은 것) — 원본이 있을 때만
const W02 = process.env.PP_EYE_W02 ?? "C:/Users/<사용자>/AppData/Local/Temp/claude/d--powerplus-platform/ebfcc297-c785-4b4b-abe7-44a89ad73f9d/scratchpad/wt/w02/main.html";
const W02_TEXT = ["pqgnsfpec3dfgcuk", "f9ibuuyunqk9yefq", "4njtyz9t2cfyyufi", "gpjqgptk4i8w77vr", "bsvf6vsme2iekg6k", "5e9kr5qumuu3esub", "665fx9577uxhasat", "6se9g6fttyfptfww", "q9j47wkungvmr24k", "ayp37w6nytybsqik", "xjuaxv5in7bchnnh", "95n3hmg35a9xv7i2", "q7733q24n59c7h4b"];
test("w02 운영 시안 — C·D·E·G 모두 걸린다(음성 대조)", { ...opts, skip: !pw || !fs.existsSync(W02) }, async () => {
  const b = await pw.firefox.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage();
    await p.setContent(fs.readFileSync(W02, "utf8"), { waitUntil: "load", timeout: 60_000 }).catch(() => {});
    await p.evaluate(async () => { await Promise.race([Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))), new Promise((r) => setTimeout(r, 8000))]); });
    const r = await eyeChecks(p, { textKeys: W02_TEXT });
    console.log("# w02", r.items.map((x) => x.kind).join(""));
    for (const k of ["C", "D", "G"]) assert.ok(r.items.some((x) => x.kind === k), `${k} 가 걸려야 한다: ${r.fails.join(" / ")}`);
    const net = await p.evaluate(() => [...document.images].some((im) => im.naturalWidth > 0));
    if (net) assert.ok(r.items.some((x) => x.kind === "E" && x.key === "bsvf6vsme2iekg6k"), "숨은 장 '청렴 신고센터' 잘림");
    else console.log("# 운영 그림을 못 받아 E 는 건너뜀");
  } finally { await b.close(); }
});
