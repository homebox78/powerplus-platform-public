// 시안 미리보기 높이 알림(api/src/Mock/FrameHeight.php) 렌더 시험 — 실제 sandbox iframe 안에서 부모로 높이 메시지가 오는지.
// 2026-10-18: 10-15 수정 뒤 send() 가 정의 안 된 b 를 써 'b is not defined' 로 한 번도 못 보냈다 → 미리보기가 고정 높이에 갇혀
// "푸터를 스크롤해도 아래가 안 보임"(사용자). PHP 안의 JS 문자열이라 타입 검사·문법 검사로 못 잡는다 — 브라우저로 돌려 본다(R76).
// 음성 대조: 같은 스크립트에서 b 선언을 지우면 메시지가 0 이어야 한다(시험이 실제로 가르는지).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let pw = null;
try { pw = await import("playwright-core"); const b = await pw.firefox.launch(); await b.close(); }
catch (e) { pw = null; console.log("# Firefox 를 띄우지 못해 렌더 시험을 건너뜀:", String(e?.message ?? e).slice(0, 160)); }
const opts = { skip: !pw, timeout: 120_000 };

const php = fs.readFileSync(new URL("../../../api/src/Mock/FrameHeight.php", import.meta.url), "utf8");
const SCRIPT = (php.match(/<<<'JS'\r?\n([\s\S]*?)\r?\nJS;/) ?? [])[1] ?? "";

/** 부모 페이지에 sandbox iframe(미리보기와 같은 sandbox 값)을 두고, 자식이 보낸 높이 메시지를 모은다 */
async function heights(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-fh-"));
  fs.writeFileSync(path.join(dir, "child.html"), `<!doctype html><html><body style="margin:0"><header style="height:120px">머리</header><main style="height:2400px">본문</main><footer style="height:260px;background:#222;color:#fff">바닥글</footer>${script}</body></html>`);
  fs.writeFileSync(path.join(dir, "parent.html"), `<!doctype html><body><iframe id="f" src="child.html" sandbox="allow-scripts allow-popups allow-forms allow-modals" style="width:1920px;height:600px"></iframe>
<script>window.__h=[];addEventListener("message",e=>{const v=+(e.data&&e.data.ppFrameHeight);if(v)window.__h.push(v);});</script></body>`);
  const b = await pw.firefox.launch();
  try {
    const p = await b.newPage();
    await p.goto(pathToFileURL(path.join(dir, "parent.html")).href, { waitUntil: "load" });
    await p.waitForTimeout(1500);
    return await p.evaluate(() => window.__h);
  } finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}

test("FrameHeight 스크립트를 PHP 에서 꺼낼 수 있다", () => {
  assert.ok(SCRIPT.includes("ppFrameHeight"), "FrameHeight.php 의 JS 블록을 찾지 못함");
});

test("sandbox iframe 안에서 내용 높이(머리+본문+바닥글 2780)를 부모로 보낸다", opts, async () => {
  const h = await heights(SCRIPT);
  assert.ok(h.length > 0, "높이 메시지가 하나도 오지 않음 — 스크립트 오류(콘솔)를 본다");
  assert.equal(Math.max(...h), 2780);
});

test("음성 대조 — send() 의 body 선언을 지우면(10-18 결함) 메시지가 오지 않는다", opts, async () => {
  const broken = SCRIPT.replace("var d=document.documentElement,b=document.body;", "var d=document.documentElement;");
  assert.notEqual(broken, SCRIPT, "음성 대조용 치환이 안 됨 — 스크립트 꼴이 바뀌었으면 이 시험도 고친다");
  assert.equal((await heights(broken)).length, 0);
});
