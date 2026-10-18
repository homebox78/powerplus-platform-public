// powerDeck 작업당 비용 한도 오류 글 시험 (api/src/Deck/AiKeys.php budgetStopMessage·budgetGuard) — 2026-10-18 전수조사(부분 실패) C.
// 계기: 작업 55ae9b… 가 기획·시안 단계에서 한도 대부분을 쓴 채 장표 단계에 들어가 바로 402 로 멈췄다. 예전 글은
//   ① 엔진 대리 호출(chatForJob): 단계별로 누가 얼마를 썼는지 없음 ② 서버 직접 호출(ask — 발표 대본·예상 질문): "한도에 도달했습니다." 한 줄뿐, 어디서 올리는지 없음.
// 고친 뒤: 두 길이 같은 budgetGuard 를 거치고, 글에 단계별 사용액 + "관리자 › AI 설정 › 비용 한도(작업당)" 가 들어간다.
// 음성 대조: 같은 검사를 고치기 전 판(git HEAD 의 AiKeys.php)에 대면 실패해야 한다 — 시험이 실제로 가르는지.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FILE = path.join(ROOT, "api/src/Deck/AiKeys.php");

let php = null;
try { execFileSync("php", ["-v"], { stdio: "ignore" }); php = "php"; } catch { console.log("# php 가 없어 PHP 실행 시험을 건너뜀"); }

/** AiKeys.php 를 불러 순수 함수 하나를 부른다(DB 없이 — use 문은 쓸 때까지 클래스를 안 불러온다) */
function callPhp(file, expr) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-budget-"));
  const run = path.join(dir, "run.php");
  fs.writeFileSync(run, `<?php\nrequire ${JSON.stringify(file)};\necho ${expr};\n`);
  try { return execFileSync(php, [run], { encoding: "utf8" }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** 한도 판정 두 길(chatForJob·ask)이 모두 올리는 곳을 말하는 공통 판정을 거치는지 — 소스 검사 */
function guardsShared(src) {
  const body = (name) => (src.split(new RegExp(`public static function ${name}\\(`))[1] ?? "").split(/\n    (?:public|private) static function /)[0];
  return ["chatForJob", "ask"].every((n) => /self::budgetGuard\(/.test(body(n)));
}

test("두 호출 길(엔진 대리·서버 직접)이 같은 한도 판정 budgetGuard 를 쓴다", () => {
  assert.ok(guardsShared(fs.readFileSync(FILE, "utf8")));
});

test("한도 글: 단계별 사용액 + 올리는 곳 + '합친 금액'을 말한다", { skip: !php }, () => {
  const msg = callPhp(FILE, `\\Pp\\Deck\\AiKeys::budgetStopMessage(2.0, 2.36, ['plan' => 0.41, 'image' => 0.19, 'build' => 1.76, 'zz' => 0.0, 'newkind' => 0.001])`);
  assert.match(msg, /\$2\.00/);
  assert.match(msg, /기획·와이어 \$0\.41/);
  assert.match(msg, /시안 그림 \$0\.19/);
  assert.match(msg, /장표 제작 \$1\.76/);
  assert.match(msg, /newkind \$0\.00/, "모르는 종류도 이름 그대로 싣는다(버리지 않는다)");
  assert.doesNotMatch(msg, /zz/, "0원 종류는 뺀다");
  assert.match(msg, /관리자 › AI 설정 › 비용 한도\(작업당\)/);
  // 2026-10-18 사용자 결정 "시안 확정 때 다시 채움 + 대본 제외" 뒤 — '합친 금액' 대신 다시 채움·대본 제외를 말한다(policy-1018.test.mjs)
  assert.match(msg, /다시 채워집니다/);
  assert.match(msg, /발표 대본·예상 질문은 작업 한도에 들지 않습니다/);
});

test("내역이 비어도 글이 만들어진다(빈 값부터, R09)", { skip: !php }, () => {
  const msg = callPhp(FILE, `\\Pp\\Deck\\AiKeys::budgetStopMessage(5.0, 5.0, [])`);
  assert.match(msg, /\$5\.00/);
  assert.doesNotMatch(msg, / — /);
});

test("월 상한 글: 올리는 곳과 풀리는 때를 말한다", { skip: !php }, () => {
  const msg = callPhp(FILE, `\\Pp\\Deck\\AiKeys::monthlyStopMessage(30.0, 30.5)`);
  assert.match(msg, /사용자별 월 상한/);
  assert.match(msg, /다음 달 1일/);
});

test("음성 대조: 고치기 전 판(git HEAD)은 같은 검사에 걸린다", (t) => {
  let old = "";
  try { old = execFileSync("git", ["-C", ROOT, "show", "a80572c:api/src/Deck/AiKeys.php"], { encoding: "utf8", maxBuffer: 1 << 24 }); }
  catch { t.skip("git 이력이 없어(공개본 등) 건너뜀"); return; }
  assert.equal(guardsShared(old), false, "옛 판은 ask 가 따로 짧은 글로 막았다");
  assert.doesNotMatch(old, /budgetStopMessage/);
  const askOld = (old.split("public static function ask(")[1] ?? "").split("\n    public static function ")[0];
  const failLine = askOld.split("\n").find((l) => l.includes("Legacy::fail") && l.includes("비용 한도")) ?? "";
  assert.ok(failLine, "옛 ask 의 한도 거절 줄을 찾지 못함");
  assert.doesNotMatch(failLine, /관리자/, "옛 ask 한도 글에는 올리는 곳이 없다");
});
