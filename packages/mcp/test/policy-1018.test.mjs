// 2026-10-18 정책 결정 4건 + 버그 2건 시험. 문서: docs/전수조사-부분실패-2026-10-18.md
//  ① 장표 작업당 비용 한도 — 시안 확정 때 다시 채움(budget_base_usd, 0043) + 발표 대본·예상 질문 제외 (api/src/Deck/AiKeys.php · Jobs.php)
//  ② 관리자 포인트 일괄 지급 — 같은 대상·같은 사유·같은 날(한국 시각) 한 번만 (api/routes/admin_bulk.php · Core/Points::bulkRef)
//  ③ 자산 업로드 화소 상한 4천만 — 한 곳(Assets\Service::MAX_PIXELS), 처리 전 거절 (api/routes/admin.php)
//  ④ 하루 호출 한도 기준 = 한국 0시 (Core/Keys::day · Core/RateLimit::windowStart · mockref routes/api-keys.php)
//  ⑤ mockref 결제 기록 한 트랜잭션 (services/mockref-api/src/Billing.php · Db::tx · routes/billing.php)
//  ⑥ 채팅 자료 올리기 — 끝내기 성공 때만 무료 몫을 센다 (api/routes/chat.php · apps/web/app/components/chat/main-chat.tsx)
// 각 항목은 고친 판(양성)과 고치기 전 판(git c75395d, 음성 대조)을 같은 검사에 대 실제로 가르는지 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BASE = "c75395d";   // 고치기 전 판
const has = (cmd, args) => { try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch { return false; } };
const PHP = has("php", ["-v"]);
const posix = (p) => p.replace(/\\/g, "/");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const old = (rel) => { try { return execFileSync("git", ["-C", ROOT, "show", `${BASE}:${rel}`], { encoding: "utf8", maxBuffer: 1 << 24 }); } catch { return null; } };
/** PHP 조각 실행 — 마지막에 echo 한 JSON 을 돌려준다 */
function php(code) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pp-policy-"));
  const run = path.join(d, "run.php");
  // 기본 시간대가 UTC 여도 한국 날짜로 세는지(namespace 블록으로 시작하는 조각은 맨 앞에 둘 수 없어 그대로)
  fs.writeFileSync(run, code.startsWith("namespace") ? `<?php\n${code}\n` : `<?php\ndate_default_timezone_set('UTC');\n${code}\n`);
  try { return JSON.parse(execFileSync("php", [run], { encoding: "utf8" })); } finally { fs.rmSync(d, { recursive: true, force: true }); }
}
const req = (rel) => `require ${JSON.stringify(posix(path.join(ROOT, rel)))};`;
/** 함수(메서드) 몸통 — 다음 메서드 선언 앞까지 */
const body = (s, name) => (s.split(new RegExp(`function ${name}\\(`))[1] ?? "").split(/\n    (?:public|private) static function /)[0];
/** 라우트 핸들러 몸통 — 그 경로 줄부터 다음 $r-> 등록 앞까지 */
const route = (s, needle) => { const i = s.indexOf(needle); if (i < 0) return ""; const rest = s.slice(i + needle.length); const j = rest.search(/\n {4}\$r->/); return j < 0 ? rest : rest.slice(0, j); };

/* ① 작업당 비용 한도 */
test("① 한도 판정은 기준선 이후 사용액 — 기획·시안에서 $1.80 을 써도 확정 뒤 장표 단계는 $2 를 온전히 쓴다", { skip: !PHP }, () => {
  const r = php(`${req("api/src/Deck/AiKeys.php")}
use Pp\\Deck\\AiKeys;
echo json_encode([
  'before' => AiKeys::countedSpend(['spent_usd' => '1.8000']),
  'after' => AiKeys::countedSpend(['spent_usd' => '1.8000', 'budget_base_usd' => '1.8000']),
  'mid' => AiKeys::countedSpend(['spent_usd' => '3.1000', 'budget_base_usd' => '1.8000']),
  'neg' => AiKeys::countedSpend(['spent_usd' => '1.0', 'budget_base_usd' => '1.5']),
  'cap' => AiKeys::engineCap(['budget_usd' => '2.00', 'budget_base_usd' => '1.8000']),
  'nocap' => AiKeys::engineCap(['budget_usd' => null, 'budget_base_usd' => '1.8']),
]);`);
  assert.equal(r.before, 1.8);
  assert.equal(r.after, 0, "확정 직후 장표 단계 사용액은 0 에서 시작");
  assert.ok(Math.abs(r.mid - 1.3) < 1e-9, "확정 뒤 $1.30 을 써도 $2 한도에 안 닿음");
  assert.equal(r.neg, 0, "기준선이 더 커도 음수로 내려가지 않는다");
  assert.ok(Math.abs(r.cap - 3.8) < 1e-9, "엔진은 누계와 견주므로 한도 + 기준선");
  assert.equal(r.nocap, null);
});

test("① 한도 글: 다시 채움·대본 제외·올리는 곳, 대본 금액은 내역에서 뺀다", { skip: !PHP }, () => {
  const r = php(`${req("api/src/Deck/AiKeys.php")}
use Pp\\Deck\\AiKeys;
echo json_encode([
  'after' => AiKeys::budgetStopMessage(2.0, 2.01, ['plan' => 0.41, 'image' => 1.39, 'build' => 2.01, 'script' => 0.3], 1.8),
  'before' => AiKeys::budgetStopMessage(2.0, 2.0, ['plan' => 0.5, 'image' => 1.5]),
], JSON_UNESCAPED_UNICODE);`);
  assert.match(r.after, /확정 전 사용 \$1\.80 은 빼고/);
  assert.match(r.after, /장표 제작 \$2\.01/);
  assert.doesNotMatch(r.after, /발표 대본 \$/, "대본 금액은 한도 내역에 싣지 않는다");
  assert.match(r.after, /발표 대본·예상 질문은 작업 한도에 들지 않습니다/);
  assert.match(r.after, /관리자 › AI 설정 › 비용 한도\(작업당\)/);
  assert.match(r.before, /시안을 확정하면 장표 제작용으로 한도가 다시 채워집니다/);
});

test("① 시안 확정(build)이 기준선을 잡고, 대본(script)은 작업 한도를 건너뛰고 기준선을 올린다 — 옛 판에는 없다(음성)", (t) => {
  const jobs = src("api/src/Deck/Jobs.php"), ai = src("api/src/Deck/AiKeys.php");
  const build = (s) => (body(s, "approveDesign").split("} elseif ($mode === 'redo')")[0] ?? "");
  assert.match(build(jobs), /budget_base_usd = spent_usd/);
  assert.match(body(ai, "budgetGuard"), /self::countedSpend\(\$job\)/);
  assert.match(body(ai, "ask"), /self::budgetGuard\(\$job, \$email, !\$side\)/);
  assert.match(body(ai, "ask"), /budget_base_usd = budget_base_usd \+ \?/);
  assert.match(body(jobs, "claim"), /AiKeys::engineCap\(\$row\)/, "엔진에게도 기준선을 더한 한도");
  assert.match(src("db/migrations/0043_deck_budget_base.sql"), /ADD COLUMN IF NOT EXISTS budget_base_usd/);
  const oj = old("api/src/Deck/Jobs.php"), oa = old("api/src/Deck/AiKeys.php");
  if (!oj || !oa) { t.skip("git 이력이 없어 음성 대조를 건너뜀"); return; }
  assert.doesNotMatch(build(oj), /budget_base_usd/, "옛 판은 확정 때 다시 채우지 않았다");
  assert.match(body(oa, "budgetGuard"), /\$spent = \(float\) \$job\['spent_usd'\]/, "옛 판은 누계 전체를 한도와 견줬다");
  assert.doesNotMatch(body(oa, "ask"), /!\$side/, "옛 판은 대본도 작업 한도에 막혔다");
});

/* ② 포인트 일괄 지급 */
test("② 묶음 키: 같은 사유·같은 한국 날짜면 같고, 한국 0시를 넘으면 바뀐다(40자 안)", { skip: !PHP }, () => {
  const r = php(`${req("api/src/Core/Points.php")}
use Pp\\Core\\Points;
$at = fn(string $iso) => new DateTimeImmutable($iso);
echo json_encode([
  'a' => Points::bulkRef('10월 출석 이벤트', $at('2026-10-18T01:00:00Z')),
  'b' => Points::bulkRef('  10월   출석 이벤트 ', $at('2026-10-18T14:59:59Z')),
  'c' => Points::bulkRef('10월 출석 이벤트', $at('2026-10-18T15:00:00Z')),
  'd' => Points::bulkRef('다른 사유', $at('2026-10-18T01:00:00Z')),
]);`);
  assert.equal(r.a, r.b, "같은 날(한국 18일 10시·23시59분)·공백만 다른 사유는 같은 키");
  assert.notEqual(r.a, r.c, "한국 0시(UTC 15시)를 넘으면 새 날");
  assert.ok(r.a.startsWith("20261018:") && r.c.startsWith("20261019:"));
  assert.notEqual(r.a, r.d);
  assert.ok(r.a.length <= 40, "ref_id VARCHAR(40)");
});

test("② 지급은 유일 키(INSERT IGNORE, ref_type bulk)로 막고 '이미 지급 N명'을 돌려준다 — 옛 판은 매번 새 키(음성)", (t) => {
  const s = route(src("api/routes/admin_bulk.php"), "'/admin/users/bulk'");
  assert.match(s, /INSERT IGNORE INTO core_point_ledger[^;]+'admin_adjust', 'bulk', \?/);
  assert.match(s, /\$bulkRef = Points::bulkRef\(\$reason\)/);
  assert.match(s, /'already'/);
  assert.match(s, /이미 지급 \{\$already\}명/);
  assert.match(src("apps/web/app/lib/admin-bulk.ts"), /이미 지급 \$\{r\.already/);
  const o = old("api/routes/admin_bulk.php");
  if (!o) { t.skip("git 이력이 없어 음성 대조를 건너뜀"); return; }
  const os_ = route(o, "'/admin/users/bulk'");
  assert.match(os_, /'admin_adjust', 'audit', \?/, "옛 판은 감사 id(매번 새 값)를 ref 로 써 중복이 막히지 않았다");
  assert.doesNotMatch(os_, /already/);
});

/* ③ 화소 상한 */
test("③ 화소 상한 4천만 — 8000×5000 은 통과, 8000×8000 은 줄여 달라는 글(최대 W×H)", { skip: !PHP }, () => {
  const r = php(`${req("api/src/Assets/Service.php")}
use Pp\\Assets\\Service;
echo json_encode(['max' => Service::MAX_PIXELS, 'ok' => Service::pixelLimitError(8000, 5000), 'big' => Service::pixelLimitError(8000, 8000), 'edge' => Service::pixelLimitError(8001, 5000)], JSON_UNESCAPED_UNICODE);`);
  assert.equal(r.max, 40_000_000);
  assert.equal(r.ok, null);
  assert.match(r.big, /8000×8000/);
  assert.match(r.big, /최대 4,000만 화소\(예 8000×5000\)/);
  assert.match(r.big, /줄여서 올려 주세요/);
  assert.ok(r.edge, "한 화소라도 넘으면 거절");
});

test("③ 업로드는 상한 한 곳을 쓰고 옮기기 전에 거절 — 옛 판은 8천만 숫자를 직접 적었다(음성)", (t) => {
  const s = src("api/routes/admin.php");
  assert.doesNotMatch(s, /80_000_000/);
  const i = s.indexOf("Service::pixelLimitError"), j = s.indexOf("move_uploaded_file($tmp, \"{$storage}/{$path}\")", i);
  assert.ok(i > 0 && j > i, "판정이 파일 옮기기보다 앞");
  const o = old("api/routes/admin.php");
  if (!o) { t.skip("git 이력이 없어 음성 대조를 건너뜀"); return; }
  assert.match(o, /80_000_000/);
});

/* ④ 한국 0시 */
test("④ 키 일 사용량 날짜·하루 창은 한국 0시에 바뀐다(기본 시간대 UTC 에서도) — 옛 창 식은 한국 09시(음성)", { skip: !PHP }, () => {
  const r = php(`${req("api/src/Core/Keys.php")}${req("api/src/Core/RateLimit.php")}
use Pp\\Core\\Keys; use Pp\\Core\\RateLimit;
$t1 = strtotime('2026-10-18T14:59:59Z'); $t2 = strtotime('2026-10-18T15:00:00Z'); $t3 = strtotime('2026-10-18T23:30:00Z');
date_default_timezone_set('Asia/Seoul');
$oldWin = fn(int $t, int $w) => date('Y-m-d H:i:s', intdiv($t, $w) * $w);   // 고치기 전 식(bootstrap 의 Asia/Seoul 로 찍음)
echo json_encode([
  'd1' => Keys::day($t1), 'd2' => Keys::day($t2),
  'w2' => RateLimit::windowStart(RateLimit::DAY, $t2), 'w3' => RateLimit::windowStart(RateLimit::DAY, $t3),
  'h3' => RateLimit::windowStart(RateLimit::HOUR, $t3),
  'old2' => $oldWin($t2, RateLimit::DAY), 'oldh3' => $oldWin($t3, RateLimit::HOUR),
]);`);
  assert.equal(r.d1, "2026-10-18");
  assert.equal(r.d2, "2026-10-19", "한국 19일 0시 정각부터 새 날");
  assert.equal(r.w2, "2026-10-19 00:00:00");
  assert.equal(r.w3, "2026-10-19 00:00:00", "한국 19일 08:30 도 같은 하루 창");
  assert.equal(r.h3, r.oldh3, "시간 창은 예전과 같다");
  assert.equal(r.old2, "2026-10-18 09:00:00", "음성: 옛 식은 한국 09시에 하루가 바뀌었다");
  assert.match(src("api/src/Core/Keys.php"), /자정\(한국 시각\)에 다시 채워집니다/);
});

test("④ mockref 키 일 사용량은 DB CURDATE 대신 한국 날짜를 넘긴다 — 옛 판은 CURDATE(음성)", (t) => {
  const s = src("services/mockref-api/routes/api-keys.php");
  assert.doesNotMatch(s, /CURDATE\(\)/);
  assert.match(s, /new DateTimeZone\('Asia\/Seoul'\)/);
  const o = old("services/mockref-api/routes/api-keys.php");
  if (!o) { t.skip("git 이력이 없어 음성 대조를 건너뜀"); return; }
  assert.match(o, /day = CURDATE\(\)/);
});

/* ⑤ mockref 결제 기록 */
const fakeDb = (failOn) => `namespace Homebox { final class Db {
  public static array $log = []; public static bool $inTx = false;
  public static function tx(callable $fn): mixed { self::$log[] = 'begin'; self::$inTx = true; try { $r = $fn(); self::$log[] = 'commit'; return $r; } catch (\\Throwable $e) { self::$log[] = 'rollback'; throw $e; } finally { self::$inTx = false; } }
  public static function exec(string $sql, array $p = []): int { $k = strtok(trim($sql), ' ') . ' ' . (preg_match('/(subscriptions|invoices)/', $sql, $m) ? $m[1] : '?');
    self::$log[] = (self::$inTx ? 'tx:' : 'out:') . $k; if (${JSON.stringify(failOn)} !== '' && str_contains($sql, ${JSON.stringify(failOn)})) throw new \\RuntimeException('db down'); return 1; }
  public static function lastId(): int { return 77; }
} }
namespace { ${req("services/mockref-api/src/Billing.php")}
  $err = null; $id = null;
  try { $id = \\Homebox\\Billing::recordPaid(['id' => 5], 'pro', 'month', 1, 'hb_user_5', 'bk', 11000, 'pay_1', '2026-11-18 00:00:00'); } catch (\\Throwable $e) { $err = $e->getMessage(); }
  echo json_encode(['log' => \\Homebox\\Db::$log, 'err' => $err, 'id' => $id]);
}`;

test("⑤ 영수증 INSERT 가 실패하면 기존 구독 취소까지 되돌린다(셋 다 한 트랜잭션)", { skip: !PHP }, () => {
  const bad = php(fakeDb("INSERT INTO invoices"));
  assert.equal(bad.err, "db down", "실패는 부르는 쪽으로 올라간다(주문번호와 함께 남김)");
  assert.deepEqual(bad.log, ["begin", "tx:UPDATE subscriptions", "tx:INSERT subscriptions", "tx:INSERT invoices", "rollback"]);
  const ok = php(fakeDb(""));
  assert.equal(ok.id, 77);
  assert.equal(ok.log.at(-1), "commit");
  assert.ok(ok.log.every((x) => x === "begin" || x === "commit" || x.startsWith("tx:")), "트랜잭션 밖 쓰기 없음");
});

test("⑤ 실제 Db::tx 는 예외 때 rollBack 하고 다시 던진다", { skip: !PHP }, () => {
  const r = php(`namespace { class Config { public static function get(string $k, $d = null) { return $d; } } }
namespace { ${req("services/mockref-api/src/Db.php")}
  class FakePdo extends PDO { public array $log = []; private bool $t = false; public function __construct() {}
    public function beginTransaction(): bool { $this->t = true; $this->log[] = 'begin'; return true; }
    public function commit(): bool { $this->t = false; $this->log[] = 'commit'; return true; }
    public function rollBack(): bool { $this->t = false; $this->log[] = 'rollback'; return true; }
    public function inTransaction(): bool { return $this->t; } }
  $f = new FakePdo(); $rp = new ReflectionProperty(\\Homebox\\Db::class, 'pdo'); $rp->setValue(null, $f);
  $err = null; try { \\Homebox\\Db::tx(function () { throw new RuntimeException('x'); }); } catch (Throwable $e) { $err = $e->getMessage(); }
  $ok = \\Homebox\\Db::tx(fn () => 3);
  echo json_encode(['log' => $f->log, 'err' => $err, 'ok' => $ok]);
}`);
  assert.deepEqual(r.log, ["begin", "rollback", "begin", "commit"]);
  assert.equal(r.err, "x");
  assert.equal(r.ok, 3);
});

test("⑤ 결제 성공 라우트는 recordPaid 하나로 기록 — 옛 판은 따로 세 줄(음성)", (t) => {
  const s = src("services/mockref-api/routes/billing.php");
  const success = s.split("'/api/billing/success'")[1].split("$router->post(")[0];
  assert.match(success, /Billing::recordPaid\(/);
  assert.doesNotMatch(success, /Db::exec\(/, "라우트에서 직접 쓰지 않는다");
  assert.match(success, /PAID_NOT_RECORDED order=/);
  const o = old("services/mockref-api/routes/billing.php");
  if (!o) { t.skip("git 이력이 없어 음성 대조를 건너뜀"); return; }
  const os_ = o.split("'/api/billing/success'")[1].split("$router->post(")[0];
  assert.equal((os_.match(/Db::exec\(/g) ?? []).length, 3);
  assert.doesNotMatch(os_, /tx\(|beginTransaction/);
});

/* ⑥ 채팅 자료 올리기 */
test("⑥ 무료 몫은 끝내기 성공 뒤에만 센다 — 시작은 세지 않음, 옛 판은 시작 때 셌다(음성)", (t) => {
  const s = src("api/routes/chat.php");
  const start = route(s, "'/chat/projects/{pid}/upload', ");
  const done = route(s, "'/chat/projects/{pid}/upload/{up}/complete', ");
  assert.ok(start && done);
  assert.doesNotMatch(start, /\$bump\(/);
  const c = done.indexOf("Uploads::complete("), b = done.indexOf("$bump($uid, 'upload_n')");
  assert.ok(c > 0 && b > c, "끝내기 성공(예외 없이 돌아온 뒤) 다음에 센다");
  assert.match(done, /open:doc:/, "이 대화 작업의 자료 업로드만 끝낸다");
  assert.match(src("apps/web/app/components/chat/main-chat.tsx"), /\/chat\/projects\/\$\{pid\}\/upload\/\$\{u\.id\}\/complete/);
  const o = old("api/routes/chat.php");
  if (!o) { t.skip("git 이력이 없어 음성 대조를 건너뜀"); return; }
  assert.match(route(o, "'/chat/projects/{pid}/upload', "), /\$bump\(\$uid, 'upload_n'\)/);
});
