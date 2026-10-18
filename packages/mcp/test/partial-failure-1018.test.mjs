// 2026-10-18 전수조사(부분 실패) — 한 건·한 단계 실패가 앞의 결과를 버리거나 뒤 단계를 막던 곳의 시험. 문서: docs/전수조사-부분실패-2026-10-18.md
// 계기: powerDeck 작업 55ae9b… — 합치기 단계가 모르는 연결(차트)에 멈춰 다 만든 4장($2.36)을 버림.
// 각 시험은 고친 판(양성)과 고치기 전 판(git a80572c, 음성 대조)을 같은 입력으로 돌려 실제로 가르는지 본다.
//  ① 바이러스 검사(api/src/Core/Scan.php classify · api/bin/scan-queue.php) — 묶음이 코드 2 여도 감염 판정을 버리지 않고, 오류 파일만 뺀다
//  ② 배포 마이그레이션(scripts/deploy.sh) — 실패한 마이그레이션 뒤로 다음 것·코드 교체를 하지 않는다
//  ③ 서버 밖 백업(scripts/offsite-backup.sh) — DB 복사가 실패해도 데이터 동기화는 돌고, 결과는 fail
//  ④ 시안 기본 CSS 새로 고침(api/bin/mock-refresh.php) — 정규식 한도 초과(null)로 시안 HTML 을 빈 값으로 덮지 않는다
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BASE = "a80572c";   // 고치기 전 판
const has = (cmd, args = ["--version"]) => { try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch { return false; } };
const PHP = has("php", ["-v"]);
const BASH = has("bash");
const old = (rel) => { try { return execFileSync("git", ["-C", ROOT, "show", `${BASE}:${rel}`], { encoding: "utf8", maxBuffer: 1 << 24 }); } catch { return null; } };
const tmpdir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const posix = (p) => p.replace(/\\/g, "/");

/* ① 바이러스 검사 */
function classify(scenario) {
  const d = tmpdir("pp-scan-");
  const run = path.join(d, "run.php");
  fs.writeFileSync(run, `<?php
require ${JSON.stringify(posix(path.join(ROOT, "api/src/Core/Scan.php")))};
$sc = ${JSON.stringify(scenario)};
$fake = function (array $paths) use ($sc): array {
    if ($sc === 'missing') return [2, ['clamscan: command not found']];
    $out = []; $code = 0;
    foreach ($paths as $p) {
        if ($p === '/up/bad.exe') { $out[] = "$p: Eicar-Test-Signature FOUND"; $code = max($code, 1); }
        if ($p === '/up/locked.pdf') { $out[] = "$p: Can't open file or directory ERROR"; $code = 2; }
    }
    return [$code, $out];
};
echo json_encode(\\Pp\\Core\\Scan::classify($fake, ['/up/a.pptx', '/up/bad.exe', '/up/locked.pdf', '/up/b.docx']), JSON_UNESCAPED_SLASHES);
`);
  try { return JSON.parse(execFileSync("php", [run], { encoding: "utf8" })); } finally { fs.rmSync(d, { recursive: true, force: true }); }
}

test("① 묶음이 코드 2 여도 감염 파일은 격리 대상으로 남고, 못 읽은 파일만 빠진다", { skip: !PHP }, () => {
  const r = classify("mixed");
  assert.deepEqual(r.infected, { "/up/bad.exe": "Eicar-Test-Signature" });
  assert.deepEqual(Object.keys(r.errors), ["/up/locked.pdf"]);
  assert.deepEqual(r.clean.sort(), ["/up/a.pptx", "/up/b.docx"]);
  assert.equal(r.global, null);
});

test("① clamscan 자체가 없으면 전체 실패(global)로 — 파일을 오류로 찍어 버리지 않는다(다음 회차에 다시)", { skip: !PHP }, () => {
  const r = classify("missing");
  assert.match(String(r.global), /command not found/);
  assert.equal(Object.keys(r.errors).length, 0);   // PHP 빈 배열은 JSON [] 로 온다
  assert.equal(Object.keys(r.infected).length, 0);
});

test("① 음성 대조: 옛 scan-queue 는 코드 2 에서 FOUND 를 읽기 전에 끝냈다", (t) => {
  const src = old("api/bin/scan-queue.php");
  if (!src) { t.skip("git 이력 없음"); return; }
  const exitAt = src.indexOf("exit(1);", src.indexOf("$code >= 2"));
  const foundAt = src.indexOf("FOUND$/");
  assert.ok(exitAt > 0 && foundAt > exitAt, "옛 판은 감염 줄 해석보다 먼저 exit(1)");
  const now = fs.readFileSync(path.join(ROOT, "api/bin/scan-queue.php"), "utf8");
  assert.match(now, /Scan::classify\(/);
});

/* ② 배포 마이그레이션 */
function migrateLoop(deploySrc) {
  const lines = deploySrc.split(/\r?\n/);
  const a = lines.findIndex((l) => l.startsWith('for f in $(ls "$T/db/migrations"'));
  const b = lines.findIndex((l, i) => i > a && l === "done");
  assert.ok(a >= 0 && b > a, "deploy.sh 에서 마이그레이션 반복문을 찾지 못함");
  const d = tmpdir("pp-mig-");
  fs.mkdirSync(path.join(d, "db/migrations"), { recursive: true });
  for (const f of ["0001_a.sql", "0002_bad.sql", "0003_c.sql"]) fs.writeFileSync(path.join(d, "db/migrations", f), f.includes("bad") ? "FAIL" : "ok");
  // 가짜 DB: -N … SELECT COUNT → 0, -e INSERT → 기록, 표준 입력이 FAIL 이면 실패
  const script = `set -euo pipefail
T=${JSON.stringify(posix(d))}
LOG="$T/log"; : > "$LOG"
fakedb() { if [ "\${1:-}" = "-N" ]; then echo 0; return 0; fi; if [ "\${1:-}" = "-e" ]; then echo "INSERT $2" >> "$LOG"; return 0; fi; if grep -q FAIL; then return 1; fi; return 0; }
DB=fakedb
${lines.slice(a, b + 1).join("\n")}
echo "REPLACED" >> "$LOG"
`;
  const r = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  const log = fs.readFileSync(path.join(d, "log"), "utf8");
  fs.rmSync(d, { recursive: true, force: true });
  return { code: r.status, log, stderr: r.stderr };
}

test("② 마이그레이션이 실패하면 멈춘다 — 다음 마이그레이션·코드 교체로 가지 않는다", { skip: !BASH }, () => {
  const r = migrateLoop(fs.readFileSync(path.join(ROOT, "scripts/deploy.sh"), "utf8"));
  assert.notEqual(r.code, 0);
  assert.match(r.log, /0001_a\.sql/);
  assert.doesNotMatch(r.log, /0002_bad|0003_c|REPLACED/, r.log);
  assert.match(r.stderr, /마이그레이션 실패: 0002_bad\.sql/);
});

test("② 음성 대조: 옛 deploy.sh 는 실패를 삼키고 다음 것·교체까지 갔다", { skip: !BASH }, (t) => {
  const src = old("scripts/deploy.sh");
  if (!src) { t.skip("git 이력 없음"); return; }
  const r = migrateLoop(src);
  assert.equal(r.code, 0);
  assert.match(r.log, /0003_c\.sql/);
  assert.match(r.log, /REPLACED/);
  assert.doesNotMatch(r.log, /0002_bad/, "실패한 것은 이력 없이 남았다");
});

/* ③ 서버 밖 백업 */
function offsite(src) {
  const d = tmpdir("pp-off-");
  const bin = path.join(d, "bin"); fs.mkdirSync(bin);
  const home = path.join(d, "home"); fs.mkdirSync(path.join(home, "db-backup/nightly"), { recursive: true });
  const day = new Date(); const ymd = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;
  fs.writeFileSync(path.join(home, `db-backup/nightly/pp_platform-${ymd}-0240.sql.gz`), "x");
  fs.writeFileSync(path.join(d, "key.json"), "{}");
  fs.writeFileSync(path.join(d, "offsite.env"), `GCS_BUCKET=gs://test\nGCS_KEY=${posix(path.join(d, "key.json"))}\n`);
  fs.writeFileSync(path.join(bin, "sudo"), `#!/usr/bin/env bash\n[ "$1" = "-n" ] && shift\nexec "$@"\n`);
  fs.writeFileSync(path.join(bin, "gsutil"), `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in cp) echo cp >> "${posix(d)}/calls"; exit 1;; rsync) echo rsync >> "${posix(d)}/calls"; exit 0;; esac; done\n`);
  fs.chmodSync(path.join(bin, "sudo"), 0o755); fs.chmodSync(path.join(bin, "gsutil"), 0o755);
  const script = path.join(d, "offsite.sh"); fs.writeFileSync(script, src);
  const r = spawnSync("bash", [posix(script)], { encoding: "utf8", env: { ...process.env, PATH: `${posix(bin)}:${process.env.PATH}`, HOME: posix(home), CONF: posix(path.join(d, "offsite.env")), STATUS: posix(path.join(d, "status")) } });
  const read = (f) => (fs.existsSync(path.join(d, f)) ? fs.readFileSync(path.join(d, f), "utf8") : "");
  const out = { code: r.status, calls: read("calls"), status: read("status"), err: r.stderr };
  fs.rmSync(d, { recursive: true, force: true });
  return out;
}

test("③ DB 복사가 실패해도 데이터 동기화는 돌고, 상태는 fail db", { skip: !BASH }, () => {
  const r = offsite(fs.readFileSync(path.join(ROOT, "scripts/offsite-backup.sh"), "utf8"));
  assert.notEqual(r.code, 0);
  assert.match(r.calls, /cp/);
  assert.match(r.calls, /rsync/, `데이터 동기화가 돌아야 한다: ${r.calls} ${r.err}`);
  assert.match(r.status, / fail db/);
});

test("③ 음성 대조: 옛 offsite-backup.sh 는 DB 복사 실패에서 데이터 동기화를 시도도 안 했다", { skip: !BASH }, (t) => {
  const src = old("scripts/offsite-backup.sh");
  if (!src) { t.skip("git 이력 없음"); return; }
  const r = offsite(src);
  assert.notEqual(r.code, 0);
  assert.match(r.calls, /cp/);
  assert.doesNotMatch(r.calls, /rsync/);
});

/* ④ 시안 기본 CSS 새로 고침 */
test("④ 정규식 한도 초과(null)면 그 시안을 건너뛴다 — 빈 값으로 덮지 않는다", { skip: !PHP }, () => {
  const src = fs.readFileSync(path.join(ROOT, "api/bin/mock-refresh.php"), "utf8");
  const fix = src.match(/\$fix = static function[\s\S]*?\n\};/)?.[0];
  assert.ok(fix, "mock-refresh.php 의 $fix 를 찾지 못함");
  const oldSrc = old("api/bin/mock-refresh.php");
  const oldFix = oldSrc?.match(/\$fix = static function[\s\S]*?\n\};/)?.[0];
  const d = tmpdir("pp-mr-");
  const runFix = (code) => {
    const f = path.join(d, "r.php");
    fs.writeFileSync(f, `<?php
ini_set('pcre.backtrack_limit', '1000'); ini_set('pcre.jit', '0');
$css = 'NEWCSS'; $js = 'NEWJS';
${code}
$html = '<style data-hb-base>' . str_repeat('x', 100000) . '</style>';
$r = $fix($html);
echo $r === null ? 'NULL' : 'LEN' . strlen($r);
`);
    return execFileSync("php", [f], { encoding: "utf8" });
  };
  try {
    assert.equal(runFix(fix), "NULL", "고친 판은 null 을 돌려 건너뛴다");
    assert.match(src, /if \(\$new === null\)/);
    if (oldFix) assert.equal(runFix(oldFix), "LEN0", "옛 판은 빈 문자열로 바꿔 UPDATE 로 갔다(음성 대조)");
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
