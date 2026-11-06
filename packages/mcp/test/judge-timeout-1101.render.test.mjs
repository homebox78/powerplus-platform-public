// 판정 전체 시간 제한(MC-126, R170) — 시안의 무한 반복 스크립트가 하나뿐인 판정 대기열을 영원히 막던 것(2026-11-01 전체 검수 C1).
// Firefox(로컬 기본)·Chromium(운영 엔진, 이 PC 는 %LOCALAPPDATA%\ms-playwright\chromium-1248) 두 가지로, 강제 종료 뒤 다음 판정이 정상인지까지 본다.
// 음성 대조: 고치기 전 판(git 55a5714 의 check.mjs)을 같은 폴더에 잠깐 두고 같은 입력을 주면 끝나지 않아야 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkMockup, closeJudgeBrowser } from "../src/qa/check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pw = await import("playwright-core").catch(() => null);
const sharp = (await import("sharp").catch(() => null))?.default ?? null;

const chromiumPath = process.env.PP_TEST_CHROMIUM ?? path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const engines = [
  { name: "firefox", launch: () => pw.firefox.launch() },
  { name: "chromium", launch: () => pw.chromium.launch(fs.existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}) },
];
const usable = async (e) => { try { const b = await e.launch(); await b.close(); return true; } catch { return false; } };

const NORMAL = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>한빛시</title></head><body><header><h1>한빛시</h1></header><main id="main"><h2>알림판</h2><p>본문</p></main><footer>바닥</footer></body></html>`;
const LOOP_NOW = `<!doctype html><html><body>x<script>while(true){}</script></body></html>`;
const LOOP_LATER = `<!doctype html><html><body>x<script>setTimeout(function(){while(true){}},300)</script></body></html>`;
const ref = { screen_id: 1, ref_id: "1", site_slug: "test", page_type: "main", width: 1920, height: 1200, sub: null, leak: [], rows: [] };
const judge = (fn, e, html, extra = {}) => fn({ html, ref, refImage: null, sharp, launch: e.launch, width: 1920, want: "", ...extra });
// 판정 브라우저는 모듈에 하나 — 안 닫으면 다음 엔진 시험이 앞 엔진 브라우저로 돈다(첫 판에서 chromium 시험이 Firefox 로 통과할 뻔했다)
const launched = [];

for (const e0 of engines) {
  const e = { ...e0, launch: async () => { const b = await e0.launch(); launched.push(b.browserType().name()); return b; } };
  const ok = pw && sharp && (await usable(e0));
  const opts = { skip: !ok && `${e.name} 를 띄우지 못함`, timeout: 300_000 };

  test(`${e.name} 무한 반복 — 시간 제한에 끊기고, 다음 판정이 정상으로 끝난다`, opts, async () => {
    await closeJudgeBrowser();
    launched.length = 0;
    for (const html of [LOOP_NOW, LOOP_LATER]) {
      const t0 = Date.now();
      await assert.rejects(judge(checkMockup, e, html, { timeoutMs: 8000 }), (err) => err.code === "JUDGE_TIMEOUT" && /무한 반복/.test(err.message));
      const took = Date.now() - t0;
      assert.ok(took < 20_000, `제한 뒤 곧 돌려줘야 한다: ${took}ms`);
      const { result } = await judge(checkMockup, e, NORMAL);
      assert.equal(typeof result.score, "number", "강제 종료 뒤 다음 판정");
    }
    assert.deepEqual(launched, [e0.name], "그 엔진으로 돌았고, 문맥만 닫아 브라우저는 그대로 썼다");
  });

  test(`${e.name} 대기열 — 멈춘 판정 뒤에 줄 선 판정도 차례가 온다`, opts, async () => {
    const stuck = judge(checkMockup, e, LOOP_NOW, { timeoutMs: 5000 });
    const next = judge(checkMockup, e, NORMAL);
    await assert.rejects(stuck, (err) => err.code === "JUDGE_TIMEOUT");
    const { result } = await next;
    assert.equal(typeof result.score, "number");
  });

  test(`${e.name} 양성 대조 — 정상 시안은 시간 제한에 걸리지 않는다`, opts, async () => {
    const { result } = await judge(checkMockup, e, NORMAL, { timeoutMs: 100_000 });
    assert.equal(typeof result.score, "number");
  });
}

test("문맥을 닫지 못하면 브라우저를 버리고 다음 판정은 새로 띄운다", { skip: !sharp, timeout: 60_000 }, async () => {
  await closeJudgeBrowser();
  let launches = 0;
  const never = new Promise(() => {});
  const fake = { newContext: async () => ({ route: () => never, on() {}, newPage: () => never, close: () => never }), close: async () => {} };
  const launch = async () => { launches += 1; return fake; };
  await assert.rejects(checkMockup({ html: NORMAL, ref, refImage: null, sharp, launch, timeoutMs: 300 }), (err) => err.code === "JUDGE_TIMEOUT");
  await assert.rejects(checkMockup({ html: NORMAL, ref, refImage: null, sharp, launch, timeoutMs: 300 }), (err) => err.code === "JUDGE_TIMEOUT");
  assert.equal(launches, 2, "버리고 새로 띄웠다");
  await closeJudgeBrowser();
});

test("음성 대조 — 고치기 전 판은 같은 입력에서 25초가 지나도 끝나지 않는다", { skip: !(pw && sharp), timeout: 120_000 }, async () => {
  const old = path.join(HERE, "../src/qa/.check-old-1101.tmp.mjs");
  let src;
  try { src = execFileSync("git", ["show", "55a5714:packages/mcp/src/qa/check.mjs"], { cwd: HERE, encoding: "utf8", maxBuffer: 1 << 26 }); } catch { return; }
  fs.writeFileSync(old, src);
  let browser = null;
  try {
    const mod = await import(pathToFileURL(old).href);
    const launch = async () => (browser = await pw.firefox.launch());
    const run = mod.checkMockup({ html: LOOP_LATER, ref, refImage: null, sharp, launch, width: 1920, want: "" }).then(() => "끝남", () => "실패");
    const r = await Promise.race([run, new Promise((ok) => setTimeout(() => ok("안 끝남"), 25_000))]);
    assert.equal(r, "안 끝남");
    run.catch(() => {});
  } finally {
    fs.rmSync(old, { force: true });
    await Promise.race([browser?.close().catch(() => {}), new Promise((ok) => setTimeout(ok, 5000))]);
  }
});
