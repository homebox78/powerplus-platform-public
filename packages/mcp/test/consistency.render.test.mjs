// 같은 묶음 일관성(eye.mjs consistencyChecks) 렌더 시험 — 로컬 Firefox(이 PC 는 Chromium 이 막힘). 못 띄우면 건너뛴다.
// 2026-10-18 사용자 최우선 기준 "어떤 건 길고 어떤 건 짧고 어떤 건 찌그러지고 어떤 건 줄바꿈되고" — 음성(일부러 들쭉날쭉)이 걸리고
// 양성(가지런한 카드 묶음·세로 소식 목록·캐러셀 숨은 장·머리 메뉴)은 안 걸리는지 같이 본다(R14·R16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { consistencyChecks } from "../src/qa/eye.mjs";

let pw = null;
try { pw = await import("playwright-core"); const b = await pw.firefox.launch(); await b.close(); }
catch (e) { pw = null; console.log("# Firefox 를 띄우지 못해 렌더 시험을 건너뜀:", String(e?.message ?? e).slice(0, 160)); }
const opts = { skip: !pw, timeout: 300_000 };

const IMG = "https://pp.test/img";
const svg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#2468ff"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="#fff"/></svg>`;
async function run(html) {
  const b = await pw.firefox.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage();
    await p.route(`${IMG}/**`, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(1280, 720) }));
    await p.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await p.waitForTimeout(200);
    return await consistencyChecks(p);
  } finally { await b.close(); }
}
const page = (css, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>한빛시</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.6 sans-serif;color:#1F2328;background:#fff;word-break:keep-all}.wrap{max-width:1200px;margin:60px auto}ul{margin:0;padding:0;list-style:none}
.cards{display:flex;gap:24px}.card{flex:1;min-width:0;background:#fff;border:1px solid #E3E5E8;border-radius:12px;padding:20px;display:flex;flex-direction:column}
.card h3{margin:12px 0 8px;font-size:22px}.card p{margin:0 0 16px}.card .btn{display:inline-block;padding:8px 14px;border:1px solid #333;border-radius:6px}
header nav ul{display:flex;gap:40px}header nav li{width:120px;height:64px}${css}</style></head><body>
<header><nav><ul><li>소식</li><li>참여 마당 안내</li><li>정보 공개</li></ul></nav></header><main>${body}</main></body></html>`;
const titles = ["시민 소식", "한빛시 2026 하반기 시민 참여 예산 공모 결과 발표", "문화 행사"];
const descs = ["짧은 설명.", "설명이 깁니다. 시민 여러분의 많은 관심 부탁드립니다. 참여 예산 공모는 해마다 열리며 올해는 열두 개 사업이 뽑혔습니다. 자세한 내용은 공고를 봐 주세요. 문의는 기획예산과로 해 주세요.", "보통 길이 설명입니다."];
const card = (i, img) => `<div class="card"><div class="thumb">${img(i)}</div><h3>${titles[i]}</h3><p>${descs[i]}</p><a class="btn" href="#">자세히 보기</a></div>`;

// 음성 — 상자 높이 제각각(align-items:start)·그림 높이 제각각·제목 1/2줄·설명 줄 수 차·단추 위치 제각각
const badImg = (i) => `<img src="${IMG}/${i}" alt="" style="width:100%;height:${[200, 160, 220][i]}px;object-fit:cover">`;
test("일관성 — 들쭉날쭉한 카드 묶음은 높이·그림 비율·제목 줄·설명 줄·단추 위치를 모두 잡는다(음성)", opts, async () => {
  const r = await run(page(".cards{align-items:flex-start}.card .btn{align-self:flex-start}", `<section class="wrap"><div class="cards">${[0, 1, 2].map((i) => card(i, badImg)).join("")}</div></section>`));
  console.log("# neg", r.fails);
  for (const s of ["height", "ratio", "title", "desc", "btn"]) assert.ok(r.items.some((x) => x.sub === s), `${s} 가 걸려야 한다: ${r.fails.join(" / ")}`);
  assert.match(r.items.find((x) => x.sub === "title").msg, /제목\(h3\)이 1\/2\/1줄|제목\(h3\)이 \d\/\d\/\d줄/);
  assert.match(r.items.find((x) => x.sub === "height").msg, /div\.cards > div\.card/);
});

// 음성 — 상자는 늘어나 같은 높이(stretch)인데 단추를 바닥에 안 붙여 안쪽 내용 끝이 다름
test("일관성 — 같은 높이 상자 안 내용 끝이 다르면 잡는다(음성)", opts, async () => {
  const short = (i) => `<img src="${IMG}/${i}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover">`;
  const r = await run(page(".card h3{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}", `<section class="wrap"><div class="cards">${[0, 1, 2].map((i) => card(i, short)).join("")}</div></section>`));
  console.log("# neg-end", r.fails);
  const h = r.items.find((x) => x.sub === "height"); assert.ok(h, r.fails.join(" / ")); assert.match(h.msg, /안쪽 내용 끝/);
  assert.ok(r.items.some((x) => x.sub === "btn"), "단추 위치도 어긋난다");
  assert.ok(!r.items.some((x) => x.sub === "ratio" || x.sub === "title"), r.fails.join(" / "));
});

// 음성 — 상자 비율은 같은데 object-fit 없이(fill) 16:9 그림을 정사각에 넣어 찌그러짐
test("일관성 — object-fit:fill 로 찌그러진 그림을 잡는다(음성)", opts, async () => {
  const sq = (i) => `<img src="${IMG}/${i}" alt="" style="width:240px;height:240px">`;
  const r = await run(page(".card h3,.card p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card .btn{margin-top:auto;align-self:flex-start}", `<section class="wrap"><div class="cards">${[0, 1, 2].map((i) => card(i, sq)).join("")}</div></section>`));
  console.log("# neg-fill", r.fails);
  const x = r.items.find((z) => z.sub === "ratio"); assert.ok(x, r.fails.join(" / ")); assert.match(x.msg, /찌그러짐/);
});

// 양성 — 가지런한 카드(stretch·aspect-ratio+cover·제목 말줄임·설명 2줄 고정·단추 바닥) + 세로 소식 목록 + 캐러셀 숨은 장
const goodImg = (i) => `<img src="${IMG}/${i}" alt="" style="width:100%;aspect-ratio:16/10;object-fit:cover;display:block">`;
const goodCss = `.card h3{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.card .btn{margin-top:auto;align-self:flex-start}
.news li{padding:10px 0;border-bottom:1px solid #eee;height:auto}.news li strong{display:block;width:300px}
.car{width:600px;overflow:hidden}.track{display:flex;width:1800px}.slide{width:600px;flex:none;height:300px;background:#eee;padding:20px}.slide img{width:200px}`;
test("일관성 — 가지런한 카드 묶음·세로 목록·캐러셀 숨은 장·머리 메뉴는 안 걸린다(양성)", opts, async () => {
  const news = `<ul class="news">${titles.map((t) => `<li><strong>${t}</strong><span>2026.10.18</span></li>`).join("")}</ul>`;
  const car = `<div class="car"><div class="track"><div class="slide"><img src="${IMG}/a" style="height:112px;object-fit:cover"><h3>첫 장</h3></div><div class="slide"><img src="${IMG}/b" style="height:200px;object-fit:cover"><h3>둘째 장 제목이 무척 길어서 두 줄로 꺾입니다 정말로</h3></div><div class="slide"><img src="${IMG}/c" style="height:80px;object-fit:cover"><h3>셋</h3></div></div></div>`;
  const r = await run(page(goodCss, `<section class="wrap"><div class="cards">${[0, 1, 2].map((i) => card(i, goodImg)).join("")}</div>${news}${car}</section>`));
  assert.deepEqual(r.fails, []);
  assert.ok(r.r.groups >= 1, "카드 묶음은 검사 대상으로 잡혀야 한다(측정기 동작 확인)");
});
