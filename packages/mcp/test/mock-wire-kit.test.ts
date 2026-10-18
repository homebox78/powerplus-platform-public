// 재현 묶음에 와이어를 넘기는 MCP 쪽(tools/mock-wire.ts) 시험 — 플랫폼 API 는 가짜(pp)로. node --experimental-strip-types --test packages/mcp/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWire, mergeWireKit, compactWire, SAMPLE_KIND, type WireDoc } from "../src/tools/mock-wire.ts";

type Call = { p: string; method: string; body?: unknown };
const W: WireDoc = { screen: "main", org: "local", title: "t", rows: [
  { zone: "top", cols: [{ k: "header", span: 12 }] },
  { zone: "body", cols: [{ k: "news_tabs", span: 8, ev: { adopt: 88, n: 200 } }, { k: "sns_video", span: 4, t: "영상", ev: { adopt: 67, n: 200 } }] },
] };
const fake = (routes: Record<string, (c: Call) => { status: number; data: unknown }>) => {
  const calls: Call[] = [];
  const pp = async (p: string, _k: string | null, init?: { method?: string; body?: unknown }) => {
    const c = { p, method: init?.method ?? "GET", body: init?.body }; calls.push(c);
    const h = routes[`${c.method} ${p}`];
    const r = h ? h(c) : { status: 404, data: null };
    return { ok: r.status < 400, status: r.status, data: r.data, body: r.status < 400 ? { data: r.data } : { error: "없음", code: "NOT_FOUND" } };
  };
  return { ctx: { pp, key: "pp_live_test", ppMsg: (r: { body: { error?: string } | null }, f: string) => r.body?.error ?? f }, calls };
};

test("wire_id — 저장한 와이어를 읽는다(주인 확인은 플랫폼)", async () => {
  const { ctx, calls } = fake({ "GET /mock/wireframes/AbCd1234": () => ({ status: 200, data: { id: "AbCd1234", wire: W } }) });
  const r = await resolveWire(ctx as never, { wire_id: "AbCd1234" }, true);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.id, "AbCd1234");
  assert.equal(calls.length, 1);
});

test("음성 대조 — 남의·없는 와이어 id 는 NOT_FOUND", async () => {
  const { ctx } = fake({});
  const r = await resolveWire(ctx as never, { wire_id: "nope1234" }, true);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "NOT_FOUND");
});

test("wire JSON — 정리·근거를 받고 내 와이어에 저장해 id 를 만든다(ev 는 빼고 저장)", async () => {
  let saved: unknown = null;
  const { ctx } = fake({
    "POST /mock/wire/check": () => ({ status: 200, data: { wire: W } }),
    "POST /mock/wireframes": (c) => { saved = c.body; return { status: 201, data: { id: "NewId0001" } }; },
  });
  const r = await resolveWire(ctx as never, { wire: { rows: [] } }, true);
  assert.equal(r.ok && r.id, "NewId0001");
  assert.equal(JSON.stringify(saved).includes("\"ev\""), false);
});

test("wire JSON — 저장이 실패해도 묶음은 받고 id 없음 + 안내", async () => {
  const { ctx } = fake({ "POST /mock/wire/check": () => ({ status: 200, data: { wire: W } }), "POST /mock/wireframes": () => ({ status: 429, data: null }) });
  const r = await resolveWire(ctx as never, { wire: { rows: [] } }, true);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.id, null);
  assert.ok(r.ok && r.note?.includes("wire 를 함께"));
});

test("compactWire — 엔진에 칸 종류·폭·높이만", () => {
  const c = compactWire(W);
  assert.deepEqual(c.rows[1]!.cols, [{ k: "news_tabs", span: 8 }, { k: "sns_video", span: 4 }]);
  assert.equal(JSON.stringify(c).includes("adopt"), false);
});

test("mergeWireKit — 칸마다 ev·예시 내용·샘플 종류, 가상 기관 이름은 묶음 persona 로", () => {
  const kitRows = [{ no: 1, cells: [{ k: "header" }] }, { no: 2, cells: [{ k: "news_tabs" }, { k: "sns_video" }] }] as Array<{ no: number; cells: Array<Record<string, unknown>> }>;
  const content = { org: "한빛시", rows: [{ cols: [{ k: "header", t: "한빛시" }] }, { cols: [{ k: "news_tabs", t: "한빛시 소식", items: ["한빛시 공지"] }, { k: "sns_video", t: "영상", img: { kind: "video-thumb", label: "영상 썸네일" } }] }] };
  mergeWireKit(kitRows, W, content, "새솔군");
  const c0 = kitRows[1]!.cells[0]!, c1 = kitRows[1]!.cells[1]!;
  assert.deepEqual(c0.ev, { adopt: 88, n: 200 });
  assert.equal((c0.content as { t: string }).t, "새솔군 소식");
  assert.deepEqual((c0.content as { items: string[] }).items, ["새솔군 공지"]);
  assert.equal((c1.content as { img: { sample_kind: string } }).img.sample_kind, "video-thumb"); // 영상 썸네일 샘플이 따로 있다(MC-104)
  assert.equal(c1.label, "영상");
  assert.equal(SAMPLE_KIND["pattern-bg"], "pattern-bg"); // 무늬 바탕 샘플이 따로 있다(MC-104)
});

test("mergeWireKit — 묶음 samples.for_wire 가 있으면 그 값이 먼저(null = 그 기관 대상에 없음, MC-104)", () => {
  const kitRows = [{ no: 1, cells: [{}] }];
  const w = { screen: "main", org: "culture", rows: [{ cols: [{ k: "banner_zone", span: 12 }] }] } as const;
  const content = { org: null, rows: [{ cols: [{ k: "banner_zone", t: "배너", img: { kind: "banner", label: "배너" } }] }] };
  const rows = JSON.parse(JSON.stringify(kitRows));
  mergeWireKit(rows, w as never, content, null, { banner: null });
  assert.equal((rows[0].cells[0].content as { img: { sample_kind: string | null } }).img.sample_kind, null);
  const rows2 = JSON.parse(JSON.stringify(kitRows));
  mergeWireKit(rows2, w as never, content, null);
  assert.equal((rows2[0].cells[0].content as { img: { sample_kind: string | null } }).img.sample_kind, "strip-banner");
});
