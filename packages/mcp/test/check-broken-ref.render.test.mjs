// 판정기: 레퍼런스 그림이 깨졌을 때(잘린 캡처·200 응답에 HTML 본문·sharp 가 모르는 형식) — 2026-10-18 전수조사(부분 실패) A.
// 예전: refImage 가지에만 catch 가 없어 앞의 레이아웃·게이트·동작 판정까지 버리고 판정 전체가 RENDER_FAILED. 같은 레퍼런스라 다시 불러도 늘 실패.
// 고친 뒤: 밝기 비교·나란히 이미지만 건너뛰고 notes 에 이유를 남긴 채 결과를 돌려준다.
// 음성 대조: 고치기 전 판(git a80572c 의 check.mjs)을 같은 폴더에 잠깐 두고 같은 입력을 주면 던져야 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkMockup } from "../src/qa/check.mjs";

let pw = null; let sharp = null;
try {
  pw = await import("playwright-core"); sharp = (await import("sharp")).default;
  const b = await pw.firefox.launch(); await b.close();
} catch (e) { pw = null; console.log("# Firefox 를 띄우지 못해 렌더 시험을 건너뜀:", String(e?.message ?? e).slice(0, 160)); }
const opts = { skip: !pw, timeout: 300_000 };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>한빛시</title>
<style>body{margin:0;font:16px/1.5 sans-serif}header{height:100px;padding:0 40px}main{max-width:1200px;margin:0 auto;padding:40px}footer{background:#1F2328;color:#fff;height:200px;padding:40px}</style></head>
<body><header><h1>한빛시</h1></header><main id="main"><h2>알림판</h2><ul><li><a href="#a">공지 1</a></li><li><a href="#b">공지 2</a></li></ul></main><footer><p>한빛시 · 대표전화 1234-5678</p></footer></body></html>`;
const ref = { screen_id: 1, ref_id: "1", site_slug: "test", page_type: "main", width: 1920, height: 1200, sub: null, leak: [], rows: [] };
const BROKEN = Buffer.from("<!doctype html><html><body>not an image</body></html>");
const run = (fn, refImage) => fn({ html, ref, refImage, sharp, launch: () => pw.firefox.launch(), width: 1920, want: "한빛시" });

test("깨진 레퍼런스 그림 — 판정은 결과를 돌려주고 이유를 notes 에 남긴다", opts, async () => {
  const { result, compare } = await run(checkMockup, BROKEN);
  assert.equal(typeof result.score, "number");
  assert.equal(result.similarity, null);
  assert.equal(compare, null);
  assert.ok(result.notes.some((n) => /레퍼런스 그림을 읽지 못해/.test(n)), JSON.stringify(result.notes));
});

test("양성 대조 — 정상 레퍼런스 그림이면 밝기 비교가 돈다(이유 글 없음)", opts, async () => {
  const png = await sharp({ create: { width: 1920, height: 1200, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const { result } = await run(checkMockup, png);
  assert.equal(typeof result.similarity, "number");
  assert.ok(!result.notes.some((n) => /레퍼런스 그림을 읽지 못해/.test(n)));
});

test("음성 대조 — 고치기 전 판은 같은 입력에 던진다(판정 전체 실패)", opts, async (t) => {
  let old = "";
  try { old = execFileSync("git", ["-C", path.join(HERE, "../../.."), "show", "a80572c:packages/mcp/src/qa/check.mjs"], { encoding: "utf8", maxBuffer: 1 << 24 }); }
  catch { t.skip("git 이력이 없어 건너뜀"); return; }
  const tmp = path.join(HERE, "../src/qa/_check.old-neg.mjs");   // 같은 폴더여야 상대 import 가 풀린다 — 끝나면 지운다
  fs.writeFileSync(tmp, old);
  try {
    const { checkMockup: oldCheck } = await import(pathToFileURL(tmp).href);
    await assert.rejects(() => run(oldCheck, BROKEN));
  } finally { fs.rmSync(tmp, { force: true }); }
});
