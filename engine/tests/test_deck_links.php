<?php
declare(strict_types=1);
/**
 * 완성 산출물 받기 링크(0044, Deck\Links) 시험 — 토큰 생성·해시만 저장·만료·끊김·다른 작업 거절·경로 노출 없음·비로그인 받기,
 * 그리고 음성 대조(로그인이 필요한 다른 경로는 여전히 401).
 *   php engine/tests/test_deck_links.php          (전부 통과면 0)
 * 앞 절반은 가짜 PDO 로 함수를 직접 부르고, 뒤 절반은 php -S 로 실제 api/public/index.php 를 띄워 HTTP 머리·본문을 본다.
 * 운영 DB·네트워크 접근 없음(127.0.0.1 시험 서버만).
 */

$root = dirname(__DIR__, 2);
require $root . '/api/src/bootstrap.php';
require __DIR__ . '/deck_links_fake.php';

$tmp = sys_get_temp_dir() . '/pp-links-' . bin2hex(random_bytes(4));
$storage = $tmp . '/storage';
$stateFile = $tmp . '/state.json';
mkdir($storage, 0775, true);
$env = ['STORAGE_DIR' => $storage, 'APP_URL' => 'https://pp.example.test', 'APP_SECRET' => 'test-secret', 'PD_LINK_STATE' => $stateFile];
foreach ($env as $k => $v) putenv("$k=$v");

$A = 'a1b2c3d4e5f60718';   // 완성 작업(주인 owner@example.com)
$B = 'b1b2c3d4e5f60718';   // 다른 사람 완성 작업
$C = 'c1b2c3d4e5f60718';   // 진행 중 작업
$jobs = [
    $A => ['id' => $A, 'email' => 'owner@example.com', 'title' => '제안 결과', 'filename' => '내용 입력', 'status' => 'done', 'result_name' => '제안_결과.pptx', 'source_kind' => 'text', 'plan' => null, 'script' => null, 'kind' => 'design'],
    $B => ['id' => $B, 'email' => 'other@example.com', 'title' => '남의 장표', 'filename' => '내용 입력', 'status' => 'done', 'result_name' => '남의_장표.pptx', 'source_kind' => 'text', 'plan' => null, 'script' => null, 'kind' => 'design'],
    $C => ['id' => $C, 'email' => 'owner@example.com', 'title' => '진행 중', 'filename' => '내용 입력', 'status' => 'running', 'result_name' => null, 'source_kind' => 'text', 'plan' => null, 'script' => null, 'kind' => 'design'],
];
$pptxA = "PPTX-A-BYTES-" . str_repeat('x', 64);
$pptxB = "PPTX-B-BYTES-" . str_repeat('y', 64);
foreach ([[$A, $pptxA], [$B, $pptxB]] as [$id, $bytes]) {
    @mkdir("$storage/deck/jobs/$id/result", 0775, true);
    @mkdir("$storage/deck/jobs/$id/extra", 0775, true);
    file_put_contents("$storage/deck/jobs/$id/result/out_{$id}.pptx", $bytes);   // 서버 안 이름에 작업 id — 응답에 새면 잡힌다
}
file_put_contents("$storage/deck/jobs/$A/extra/Pretendard-Regular.otf", 'FONT');
file_put_contents("$storage/deck/jobs/$A/extra/서체_라이선스.txt", 'OFL');
file_put_contents($stateFile, json_encode(['jobs' => $jobs, 'links' => [], 'seq' => 0], JSON_UNESCAPED_UNICODE));
$db = link_fake_install($stateFile);

use Pp\Deck\Links;
use Pp\Core\HttpError;

/** 응답 어딘가에 작업 id·서버 경로·내부 저장 위치가 있는가 */
$leaks = static function (string $s) use ($A, $B, $storage): array {
    $hit = [];
    foreach ([$A, $B, str_replace('\\', '/', $storage), str_replace('/', '\\', $storage), '/jobs/', 'out_', 'storage', 'deck/jobs'] as $n) {
        if ($n !== '' && stripos($s, $n) !== false) $hit[] = $n;
    }
    return $hit;
};
$expectFail = static function (callable $fn, int $status): void {
    try { $fn(); } catch (HttpError $e) { if ($e->status !== $status) throw new RuntimeException("상태 {$e->status} (기대 $status): " . $e->getMessage()); return; }
    throw new RuntimeException("거절하지 않음(기대 $status)");
};

$tests = [];
$tok = [];   // kind => token

$tests['음성 대조 — 누출 검사기가 작업 id·서버 경로를 실제로 잡는다'] = static function () use ($leaks, $A, $storage): void {
    if (!$leaks("x-file: $A.pptx")) throw new RuntimeException('작업 id 를 못 잡음');
    if (!$leaks('path=' . str_replace('\\', '/', $storage) . '/deck')) throw new RuntimeException('서버 경로를 못 잡음');
    if ($leaks('Content-Disposition: attachment; filename="powerDeck.pptx"; filename*=UTF-8\'\'%EC%A0%9C%EC%95%88_%EA%B2%B0%EA%B3%BC.pptx')) throw new RuntimeException('깨끗한 머리를 누출로 봄');
};

$tests['토큰 생성 — 43자 base64url, DB 에는 sha256 만, URL 에 작업 id 없음, 감사 로그'] = static function () use (&$tok, $A, $db, $stateFile, $leaks): void {
    foreach (['result', 'export', 'fonts'] as $k) {
        $r = Links::create($A, 'owner@example.com', false, ['kind' => $k, 'days' => 7]);
        if (!preg_match('#^https://pp\.example\.test/api/v1/d/([A-Za-z0-9_-]{43})$#', $r['url'], $m)) throw new RuntimeException('URL 모양: ' . $r['url']);
        $tok[$k] = $m[1];
        if ($leaks($r['url'])) throw new RuntimeException('URL 에 누출: ' . implode(',', $leaks($r['url'])));
    }
    if (count(array_unique($tok)) !== 3) throw new RuntimeException('토큰이 겹침');
    $raw = (string) file_get_contents($stateFile);
    foreach ($tok as $t) {
        if (str_contains($raw, $t)) throw new RuntimeException('토큰 원문이 DB 에 저장됨');
        if (!str_contains($raw, hash('sha256', $t))) throw new RuntimeException('sha256 해시가 저장되지 않음');
    }
    $acts = array_column($db->state['audit'] ?? [], 'action');
    if (count(array_keys($acts, 'deck.link.create', true)) !== 3) throw new RuntimeException('감사 로그 deck.link.create 3건이 아님');
    $list = Links::list($A, 'owner@example.com', false);
    if (count($list) !== 3 || $list[0]['state'] !== 'active' || $list[0]['tail'] !== substr($tok['fonts'], -4)) throw new RuntimeException('목록 모양');
    if (str_contains(json_encode($list), $tok['result'])) throw new RuntimeException('목록에 토큰 원문');
    // 기한 기본 7일
    $r = Links::create($A, 'owner@example.com', false, ['kind' => 'result']);
    $days = (strtotime($r['expires_at']) - time()) / 86400;
    if ($days < 6.99 || $days > 7.01) throw new RuntimeException("기본 기한이 7일이 아님: $days");
};

$tests['만들기 거절 — 남의 작업 404 · 진행 중 409 · 종류·기한 잘못 400 · 서체 없는 작업 fonts 404'] = static function () use ($A, $B, $C, $expectFail): void {
    $expectFail(fn () => Links::create($B, 'owner@example.com', false, ['kind' => 'result']), 404);
    $expectFail(fn () => Links::create($C, 'owner@example.com', false, ['kind' => 'result']), 409);
    $expectFail(fn () => Links::create($A, 'owner@example.com', false, ['kind' => 'source']), 400);
    $expectFail(fn () => Links::create($A, 'owner@example.com', false, ['kind' => 'result', 'days' => 3]), 400);
    $expectFail(fn () => Links::create($B, 'other@example.com', false, ['kind' => 'fonts']), 404);
    Links::create($B, 'owner@example.com', true, ['kind' => 'result', 'days' => 1]);   // 관리자는 된다
};

$tests['다른 작업 거절 — 남의 작업 id 로 내 링크를 끊거나 보지 못하고, 토큰은 제 작업 파일만 준다'] = static function () use (&$tok, $A, $B, $db, $expectFail, $pptxA): void {
    $lidA = (int) $db->state['links'][0]['id'];
    $expectFail(fn () => Links::revoke($B, $lidA, 'owner@example.com', false), 404);          // 남의 작업
    Links::revoke($B, $lidA, 'other@example.com', false);                                       // B 주인이 A 링크 id 로
    if ($db->state['links'][0]['revoked_at'] !== null) throw new RuntimeException('다른 작업의 링크가 끊김');
    $expectFail(fn () => Links::list($A, 'other@example.com', false), 404);
    $p = Links::prepare($tok['result']);
    if (file_get_contents($p['path']) !== $pptxA) throw new RuntimeException('토큰이 다른 작업 파일을 줌');
    if ($p['name'] !== '제안_결과.pptx') throw new RuntimeException('받을 이름: ' . $p['name']);
};

$tests['만료·끊김·작업 삭제·엉터리 토큰 — 전부 같은 404 글'] = static function () use (&$tok, $A, $db, $expectFail): void {
    $msgs = [];
    $grab = static function (string $t) use (&$msgs): void {
        try { Links::prepare($t); } catch (HttpError $e) { $msgs[] = [$e->status, $e->getMessage()]; return; }
        throw new RuntimeException('받아짐: ' . $t);
    };
    // 끊기 전에는 받아진다(양성)
    Links::prepare($tok['export']);
    $extra = Links::create($A, 'owner@example.com', false, ['kind' => 'result', 'days' => 1]);
    $tExp = substr($extra['url'], -43);
    foreach ($db->state['links'] as &$l) if ($l['id'] === $extra['id']) $l['expires_at'] = Links::now(time() - 1);
    unset($l);
    $db->save();
    $grab($tExp);
    $rv = Links::create($A, 'owner@example.com', false, ['kind' => 'result']);
    Links::revoke($A, (int) $rv['id'], 'owner@example.com', false);
    $grab(substr($rv['url'], -43));
    $grab('not-a-token');
    $grab(str_repeat('A', 43));
    $states = array_column(Links::list($A, 'owner@example.com', false), 'state', 'id');
    if (($states[$extra['id']] ?? '') !== 'expired' || ($states[$rv['id']] ?? '') !== 'revoked') throw new RuntimeException('목록 상태(expired·revoked)');
    if (!in_array('deck.link.revoke', array_column($db->state['audit'], 'action'), true)) throw new RuntimeException('끊기 감사 로그 없음');
    if (count(array_unique(array_map('json_encode', $msgs))) !== 1 || $msgs[0][0] !== 404) throw new RuntimeException('404 모양이 다름: ' . json_encode($msgs, JSON_UNESCAPED_UNICODE));
};

$tests['회원 관문 — /d/ 만 열리고, 다른 덱 경로는 그대로 회원 전용(음성 대조)'] = static function () use ($A): void {
    if (!\Pp\Core\Router::isOpen('GET', '/d/' . str_repeat('A', 43))) throw new RuntimeException('/d/ 가 열리지 않음');
    foreach (["/deck/jobs/$A/export.zip", "/deck/jobs/$A/fonts.zip", "/deck/jobs/$A/links", "/deck/jobs/$A/plan.md", '/dl/x', '/d', '/deck/jobs'] as $p) {
        if (\Pp\Core\Router::isOpen('GET', $p)) throw new RuntimeException("열리면 안 되는 경로가 열림: $p");
    }
};

/* ── 실제 index.php 를 php -S 로 띄워 HTTP 로 본다 ── */
$port = random_int(18100, 19900);
$cmd = [PHP_BINARY, '-S', "127.0.0.1:$port", __DIR__ . '/deck_links_server.php'];
$srv = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['file', $tmp . '/srv.out', 'a'], 2 => ['file', $tmp . '/srv.err', 'a']], $pipes, $root . '/api/public', array_merge(getenv(), $env));
$up = false;
for ($i = 0; $i < 50 && !$up; $i++) { $fp = @fsockopen('127.0.0.1', $port, $en, $es, 0.2); if ($fp) { fclose($fp); $up = true; } else usleep(100000); }
$http = static function (string $method, string $path, ?string $json = null) use ($port): array {
    $hdr = "X-Requested-With: test\r\n" . ($json !== null ? "Content-Type: application/json\r\n" : '');
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => $hdr, 'content' => $json ?? '', 'ignore_errors' => true, 'timeout' => 20]]);
    $body = @file_get_contents("http://127.0.0.1:$port$path", false, $ctx);
    $h = $http_response_header ?? [];
    preg_match('#HTTP/\S+ (\d+)#', $h[0] ?? '', $m);
    return ['status' => (int) ($m[1] ?? 0), 'headers' => implode("\n", $h), 'body' => (string) $body];
};
$hasHdr = static function (array $r, string $re): bool { return (bool) preg_match($re, $r['headers']); };

if (!$up) {
    $tests['HTTP 시험 서버'] = static function () use ($tmp): void { throw new RuntimeException('php -S 가 뜨지 않음: ' . @file_get_contents($tmp . '/srv.err')); };
} else {
    $tests['HTTP — 비로그인으로 결과 장표 받기: 200·본문 같음·안전 머리·한글 파일 이름·누출 없음·횟수 +1'] = static function () use (&$tok, $http, $hasHdr, $leaks, $pptxA, $stateFile): void {
        $r = $http('GET', '/api/v1/d/' . $tok['result']);
        if ($r['status'] !== 200) throw new RuntimeException("상태 {$r['status']}: " . mb_substr($r['body'], 0, 200));
        if ($r['body'] !== $pptxA) throw new RuntimeException('본문이 결과 장표와 다름');
        foreach (['#^X-Robots-Tag: noindex#mi', '#^Cache-Control: private, no-store#mi', '#^Referrer-Policy: no-referrer$#mi',
                  "#^Content-Disposition: attachment; filename=\"powerDeck\\.pptx\"; filename\\*=UTF-8''" . preg_quote(rawurlencode('제안_결과.pptx'), '#') . '$#mi',
                  '#^Content-Type: application/vnd\.openxmlformats-officedocument\.presentationml\.presentation#mi'] as $re) {
            if (!$hasHdr($r, $re)) throw new RuntimeException("머리 없음 $re\n" . $r['headers']);
        }
        if ($l = $leaks($r['headers'] . "\n" . $r['body'])) throw new RuntimeException('누출: ' . implode(',', $l));
        $st = json_decode((string) file_get_contents($stateFile), true);
        $row = array_values(array_filter($st['links'], static fn ($x) => $x['token_hash'] === hash('sha256', $tok['result'])))[0];
        if ($row['downloads'] !== 1 || $row['last_download_at'] === null) throw new RuntimeException('받은 횟수·때 기록 안 됨');
        $h = $http('HEAD', '/api/v1/d/' . $tok['result']);
        $st = json_decode((string) file_get_contents($stateFile), true);
        $row = array_values(array_filter($st['links'], static fn ($x) => $x['token_hash'] === hash('sha256', $tok['result'])))[0];
        if ($h['status'] !== 200 || $row['downloads'] !== 1) throw new RuntimeException('HEAD 가 횟수를 셈 또는 실패');
    };

    $tests['HTTP — 전체 묶음·서체 묶음 zip 받기(그 시점 파일로), 누출 없음'] = static function () use (&$tok, $http, $hasHdr, $leaks, $A, $storage): void {
        foreach (['export' => '_산출물.zip', 'fonts' => '_서체.zip'] as $k => $suf) {
            $r = $http('GET', '/api/v1/d/' . $tok[$k]);
            if ($r['status'] !== 200 || !str_starts_with($r['body'], 'PK')) throw new RuntimeException("$k 상태 {$r['status']}: " . mb_substr($r['body'], 0, 200));
            if (!$hasHdr($r, "#filename\\*=UTF-8''" . preg_quote(rawurlencode('제안 결과' . $suf), '#') . '#')) throw new RuntimeException("$k 파일 이름\n" . $r['headers']);
            if ($l = $leaks($r['headers'])) throw new RuntimeException("$k 머리 누출: " . implode(',', $l));
            if (str_contains($r['body'], $A)) throw new RuntimeException("$k 묶음 안에 작업 id");
        }
        // 결과가 바뀌면 새 결과 — 결과 장표를 새로 올린 뒤 같은 링크
        $f = "$storage/deck/jobs/$A/result/out2_x.pptx";
        file_put_contents($f, 'NEW-RESULT');
        touch($f, time() + 5);
        $r = $http('GET', '/api/v1/d/' . $tok['result']);
        if ($r['body'] !== 'NEW-RESULT') throw new RuntimeException('같은 링크가 최신 결과를 주지 않음');
    };

    $tests['HTTP — 끊김·엉터리·작업 삭제는 같은 404, 본문·머리에 누출 없음'] = static function () use (&$tok, $http, $leaks, $A, $B, $stateFile): void {
        $bLink = Links::create($B, 'other@example.com', false, ['kind' => 'result']);
        $tB = substr($bLink['url'], -43);
        if ($http('GET', '/api/v1/d/' . $tB)['status'] !== 200) throw new RuntimeException('B 링크가 삭제 전에 안 받아짐(양성)');
        \Pp\Deck\Jobs::delete($B, 'other@example.com', false);
        $st = json_decode((string) file_get_contents($stateFile), true);
        if (array_filter($st['links'], static fn ($x) => $x['job_id'] === $B)) throw new RuntimeException('작업 삭제 때 링크가 남음');
        $rv = Links::create($A, 'owner@example.com', false, ['kind' => 'export']);
        Links::revoke($A, (int) $rv['id'], 'owner@example.com', false);
        $outs = [];
        foreach ([$tB, substr($rv['url'], -43), str_repeat('Z', 43), 'short', $A] as $t) {
            $r = $http('GET', '/api/v1/d/' . $t);
            if ($r['status'] !== 404) throw new RuntimeException("404 아님($t): {$r['status']}");
            if ($l = $leaks($r['headers'] . $r['body'])) throw new RuntimeException('누출: ' . implode(',', $l));
            if (!preg_match('#^X-Robots-Tag: noindex#mi', $r['headers'])) throw new RuntimeException('404 에도 noindex 가 있어야 함');
            $outs[] = $r['body'];
        }
        if (count(array_unique($outs)) !== 1) throw new RuntimeException('404 본문이 서로 다름: ' . implode(' | ', array_unique($outs)));
    };

    $tests['HTTP 음성 대조 — 로그인 없이 다른 경로는 여전히 401'] = static function () use ($http, $A): void {
        foreach ([['GET', "/api/v1/deck/jobs/$A/export.zip"], ['GET', "/api/v1/deck/jobs/$A/fonts.zip"], ['GET', "/api/v1/deck/jobs/$A/links"],
                  ['POST', "/api/v1/deck/jobs/$A/links"], ['DELETE', "/api/v1/deck/jobs/$A/links/1"], ['GET', '/api/v1/deck/jobs']] as [$m, $p]) {
            $r = $http($m, $p, $m === 'GET' ? null : '{"kind":"result"}');
            if ($r['status'] !== 401) throw new RuntimeException("$m $p → {$r['status']} (401 이어야): " . mb_substr($r['body'], 0, 160));
        }
    };

    $tests['HTTP — 같은 IP 과다 요청은 429'] = static function () use (&$tok, $http, $stateFile): void {
        $_SERVER['REMOTE_ADDR'] = '127.0.0.1';   // 시험 서버도 같은 APP_SECRET·127.0.0.1
        $bucket = 'deck-dl:' . \Pp\Core\RateLimit::ipKey();
        $win = \Pp\Core\RateLimit::windowStart(\Pp\Core\RateLimit::HOUR);
        $st = json_decode((string) file_get_contents($stateFile), true);
        $st['rl']["$bucket|$win"] = Links::RATE_MAX;
        file_put_contents($stateFile, json_encode($st, JSON_UNESCAPED_UNICODE));
        $r = $http('GET', '/api/v1/d/' . $tok['result']);
        if ($r['status'] !== 429) throw new RuntimeException("429 아님: {$r['status']}");
    };
}

$bad = 0;
foreach ($tests as $name => $fn) {
    try {
        // 서버가 상태 파일을 바꾸므로 함수 직접 부르기 전에 다시 읽는다
        $db->state = json_decode((string) file_get_contents($stateFile), true) ?: [];
        $fn();
        echo "통과  $name\n";
    } catch (\Throwable $e) {
        $bad++;
        echo "실패  $name: " . get_class($e) . ': ' . $e->getMessage() . "\n";
    }
}
if (is_resource($srv)) { proc_terminate($srv); proc_close($srv); }
if ($bad && is_file($tmp . '/srv.err')) echo "--- 서버 오류 ---\n" . mb_substr((string) file_get_contents($tmp . '/srv.err'), -2000) . "\n";
// 정리
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
foreach ($it as $f) $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
@rmdir($tmp);
echo (count($tests) - $bad) . '/' . count($tests) . " 통과\n";
exit($bad ? 1 : 0);
