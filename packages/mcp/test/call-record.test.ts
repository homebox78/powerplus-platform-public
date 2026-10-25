// 호출 기록 칸 만들기(MC-122) — 그림·주소를 모으는지, 없는 응답에서 지어내지 않는지(음성 대조)
import { test } from "node:test";
import assert from "node:assert/strict";
import { absolutizeUrls, buildCallBlocks, moduleOf, shrinkJson } from "../src/call-record.ts";

test("상대 주소 → powerPlus 절대 주소, 옛 홈박스 화면은 뺀다(MC-123)", () => {
  const d = { items: [{ thumb_url: "/mockref/api/files/1?exp=1&sig=a", favicon_url: "/mockref/api/files/2", page_url: "/sites/ut-ac-kr-main", url: "https://www.ut.ac.kr" }], wire_link: "/mock/plan?wire=x" };
  const n = absolutizeUrls(d, "https://pp.example");
  assert.equal(n, 4);
  assert.equal(d.items[0]!.thumb_url, "https://pp.example/mockref/api/files/1?exp=1&sig=a");
  assert.equal(d.items[0]!.favicon_url, "https://pp.example/mockref/api/files/2");
  assert.equal("page_url" in d.items[0]!, false);
  assert.equal(d.items[0]!.url, "https://www.ut.ac.kr");
  assert.equal(d.wire_link, "https://pp.example/mock/plan?wire=x");
});

test("음성 대조 — 주소 칸이 아닌 글·HTML·// 주소는 그대로", () => {
  const d = { html: "<img src=\"/api/x\">", path: "/sites/a", note: "/mockref/api", url: "//evil.example/x", items: ["/api/v1/a"] };
  assert.equal(absolutizeUrls(d, "https://pp.example"), 0);
  assert.equal(d.html, "<img src=\"/api/x\">");
  assert.equal(d.path, "/sites/a");
  assert.equal(d.url, "//evil.example/x");
});

test("샘플 이미지 응답 — 그림 칸(썸네일·눌러서 원본)과 주소 칸", () => {
  const data = {
    items: [
      { id: "banner-36", alt: "생활 속 안전 신고 배너", url: "https://pp.example/api/v1/assets/samples/a1/original", thumb_url: "https://pp.example/api/v1/assets/samples/a1/thumb", preview_url: "https://pp.example/api/v1/assets/samples/a1/original" },
      { id: "banner-18", alt: "학교폭력 예방", url: "https://pp.example/s/b2/original", thumb_url: "https://pp.example/s/b2/thumb" },
    ],
    wire_link: "https://pp.example/mock/plan?wire=x1",
  };
  const b = buildCallBlocks({ kind: ["banner"], limit: 2 }, data);
  const img = b.find((x) => x.type === "images");
  assert.ok(img && img.type === "images");
  assert.equal(img.items.length, 2);
  assert.equal(img.items[0]!.caption, "생활 속 안전 신고 배너");
  assert.equal(img.items[0]!.link, "https://pp.example/api/v1/assets/samples/a1/original");
  const links = b.find((x) => x.type === "links");
  assert.ok(links && links.type === "links");
  assert.ok(links.items.some((l) => l.url === "https://pp.example/mock/plan?wire=x1"));
  // 그림으로 쓴 원본 주소를 주소 칸에 또 싣지 않는다
  assert.ok(!links.items.some((l) => l.url.endsWith("/a1/original")));
  assert.ok(b.some((x) => x.type === "list") && b.some((x) => x.type === "json"));
});

test("음성 대조 — 그림·주소가 없는 응답엔 그림·주소 칸이 없다", () => {
  const b = buildCallBlocks({}, { score: 92, pass: true, notes: ["javascript:alert(1)", "//evil.example/x"] , url: "javascript:alert(1)" });
  assert.equal(b.some((x) => x.type === "images"), false);
  assert.equal(b.some((x) => x.type === "links"), false);
  assert.equal(b.some((x) => x.type === "list"), false); // 인자 없음
  assert.equal(b.at(-1)!.type, "json");
});

test("원본 JSON 줄이기 — 긴 글·긴 배열", () => {
  const s = shrinkJson({ html: "x".repeat(5000), arr: Array.from({ length: 100 }, (_, i) => i) });
  assert.match(s, /글 5,000자 생략/);
  assert.match(s, /60개 더/);
  assert.equal(moduleOf("mock_get_wireframe"), "mock");
  assert.equal(moduleOf("powerplus_check_request"), "all");
});
