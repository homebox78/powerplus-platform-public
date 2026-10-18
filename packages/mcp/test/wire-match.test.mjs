// 와이어 일치 판정(qa/wire.mjs) 순수 함수 시험 — 브라우저 없이. node --test packages/mcp/test/
// 양성: 와이어를 따른 측정값은 통과 / 음성 대조: 표시 없음·줄 순서 바뀜·칸 폭 다름·칸 종류 다름은 실패(R14·R16·MC-50)
import { test } from "node:test";
import assert from "node:assert/strict";
import { wireMatch, wireRefRows, probeOk } from "../src/qa/wire.mjs";

const wire = { screen: "main", org: "local", rows: [
  { zone: "top", cols: [{ k: "header", span: 12 }] },
  { zone: "body", cols: [{ k: "main_visual", span: 12 }] },
  { zone: "body", cols: [{ k: "news_tabs", span: 8 }, { k: "quick_links", span: 4 }] },
  { zone: "body", cols: [{ k: "banner_zone", span: 12 }] },
  { zone: "bottom", cols: [{ k: "footer", span: 12 }] },
] };
const sig = { img: 2, links: 8, items: 6, inputs: 0, iframe: 0, text: 120 };
const cell = (k, x, w, y, h = 300) => ({ k, x, y, w, h, sig });
const follow = { marks: 9, rows: [
  { no: 2, x: 0, y: 200, w: 1920, h: 500, cells: [cell("main_visual", 0, 1920, 200, 500)] },
  { no: 3, x: 260, y: 780, w: 1400, h: 400, cells: [cell("news_tabs", 260, 917, 780, 400), cell("quick_links", 1201, 459, 780, 400)] },
  { no: 4, x: 260, y: 1260, w: 1400, h: 160, cells: [cell("banner_zone", 260, 1400, 1260, 160)] },
] };

test("와이어를 따른 시안은 통과", () => {
  const r = wireMatch(follow, wire);
  assert.equal(r.pass, true, JSON.stringify(r.rows));
  assert.equal(r.score, 100);
  assert.equal(r.expected, 3); // 본문 줄만(머리·바닥 제외)
  assert.equal(r.hard.length, 0);
});

test("음성 대조 — 와이어 표시가 하나도 없으면 실패(치명)", () => {
  const r = wireMatch({ rows: [], marks: 0 }, wire);
  assert.equal(r.pass, false);
  assert.equal(r.score, 0);
  assert.ok(r.hard.some((h) => h.includes("표시")), r.hard.join("/"));
});

test("음성 대조 — 줄 순서가 뒤바뀌면 실패", () => {
  const swapped = { marks: 9, rows: follow.rows.map((x) => (x.no === 2 ? { ...x, y: 1500, cells: x.cells.map((c) => ({ ...c, y: 1500 })) } : x)) };
  const r = wireMatch(swapped, wire);
  assert.equal(r.order_ok, false);
  assert.equal(r.pass, false);
  assert.ok(r.hard.includes("와이어 줄 순서와 다름"));
});

test("음성 대조 — 칸 폭 비율이 다르면(8:4 → 6:6) 실패", () => {
  const even = { marks: 9, rows: follow.rows.map((x) => (x.no === 3 ? { ...x, cells: [cell("news_tabs", 260, 688, 780, 400), cell("quick_links", 972, 688, 780, 400)] } : x)) };
  const r = wireMatch(even, wire);
  assert.equal(r.pass, false);
  assert.ok(r.rows.find((x) => x.no === 3).issues.some((i) => i.includes("칸 폭 비율")));
});

test("음성 대조 — 칸 종류·칸 수가 다르면 실패", () => {
  const wrong = { marks: 9, rows: follow.rows.map((x) => (x.no === 3 ? { ...x, cells: [cell("news_tabs", 260, 1400, 780, 400)] } : x.no === 4 ? { ...x, cells: [cell("calendar", 260, 1400, 1260, 160)] } : x)) };
  const r = wireMatch(wrong, wire);
  assert.equal(r.pass, false);
  assert.ok(r.rows.find((x) => x.no === 3).issues.some((i) => i.includes("칸 2개")));
  assert.ok(r.rows.find((x) => x.no === 4).issues.some((i) => i.includes("칸 종류")));
});

test("음성 대조 — 칸 좌우 순서가 바뀌면 실패", () => {
  const flip = { marks: 9, rows: follow.rows.map((x) => (x.no === 3 ? { ...x, cells: [cell("quick_links", 260, 459, 780, 400), cell("news_tabs", 743, 917, 780, 400)] } : x)) };
  assert.equal(wireMatch(flip, wire).pass, false);
});

test("모바일은 칸이 세로로 쌓여도 폭 비율을 보지 않는다", () => {
  const mob = { marks: 9, rows: follow.rows.map((x) => (x.no === 3 ? { ...x, cells: [cell("news_tabs", 0, 390, 780, 400), cell("quick_links", 0, 390, 1190, 300)] } : x)) };
  assert.equal(wireMatch(mob, wire, { mobile: true }).pass, true);
  assert.equal(wireMatch(mob, wire).pass, false); // PC 로 재면 세로 쌓임·폭 다름
});

test("내용 종류 검사 — 비주얼 칸에 그림이 없으면 감점", () => {
  assert.equal(probeOk("main_visual", { img: 0, links: 0, items: 0, inputs: 0, iframe: 0, text: 20 }), false);
  assert.equal(probeOk("quick_links", { img: 0, links: 6, items: 6, inputs: 0, iframe: 0, text: 40 }), true);
  const bare = { marks: 9, rows: follow.rows.map((x) => (x.no === 2 ? { ...x, cells: [{ ...x.cells[0], sig: { img: 0, links: 0, items: 0, inputs: 0, iframe: 0, text: 10 } }] } : x)) };
  const r = wireMatch(bare, wire);
  assert.ok(r.score < 100 && r.rows.find((x) => x.no === 2).issues.some((i) => i.includes("내용이 그 종류로")));
});

test("wireRefRows — 시안 자신의 와이어 줄을 레퍼런스 줄 꼴로(가로 틀 검사용)", () => {
  const rows = wireRefRows(follow, wire);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1].cells.map((c) => c.type), ["news_tabs", "quick_links"]);
  assert.equal(rows[1].gap_above, 780 - 700);
});

test("음성 대조 — 번호는 차례대로인데 내용이 다른 줄 것이면 순서 바뀜(2026-10-18 w10)", () => {
  // 2번 자리에 배너, 4번 자리에 비주얼 — y 는 2·3·4 차례라 예전엔 order_ok=true 였다
  const swap = { marks: 9, rows: [
    { ...follow.rows[0], cells: [cell("banner_zone", 0, 1920, 200, 500)] },
    follow.rows[1],
    { ...follow.rows[2], cells: [cell("main_visual", 260, 1400, 1260, 160)] },
  ] };
  const r = wireMatch(swap, wire);
  assert.equal(r.order_ok, false);
  assert.equal(r.pass, false);
  assert.ok(r.fixes.some((f) => f.includes("2번 줄 자리에 4번 줄")), r.fixes.join("\n"));
});

test("머리·바닥 구역의 와이어 줄에 번호를 달아도 '없는 줄'로 안내하지 않는다(2026-10-18 w07·w08)", () => {
  const top = { marks: 11, rows: [{ no: 1, x: 0, y: 0, w: 1920, h: 150, cells: [cell("header", 0, 1920, 0, 150)] }, ...follow.rows] };
  const r = wireMatch(top, wire);
  assert.equal(r.pass, true);
  assert.ok(!r.fixes.some((f) => f.includes("와이어에 없는 줄 번호")), r.fixes.join("\n"));
  const bogus = { marks: 11, rows: [...follow.rows, { no: 9, x: 0, y: 1500, w: 1920, h: 100, cells: [] }] };
  assert.ok(wireMatch(bogus, wire).fixes.some((f) => f.includes("와이어에 없는 줄 번호 9")));
});
