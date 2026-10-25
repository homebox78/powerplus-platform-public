<?php
/**
 * 교육 자료 페이지 /edu — 사용자 2026-10-25 "직원 교육 때 바로 열고 닫는 페이지, 구글 로그인으로 내가 로그인하면 보이게".
 *  - 루트 .htaccess(scripts/platform.htaccess)가 /edu, /edu/… 를 여기로 보낸다.
 *  - 로그인 안 됨 → 구글 로그인(/api/v1/auth/google?next=/edu) 뒤 돌아온다.
 *  - 허용 = core_settings 'edu.allow'(쉼표로 이메일) 에 있는 계정만. 개인 메일을 코드·저장소에 적지 않기 위해 설정에만 둔다.
 *    테스트 계정(TestLogin)은 허용 목록에 있어도 막는다(계정 정보가 든 페이지라).
 *  - 내용·파일은 저장소 밖 서버 데이터 폴더 storage.dir/edu 에만 있다:
 *      index.html  — 페이지 본문(계정·교육 순서 포함, 서버에서만 고친다)
 *      files/      — 내려받을 파일. /edu/f/<파일 이름> 으로 내준다(?dl=1 이면 내려받기, 아니면 브라우저에서 바로 보기·Range 지원)
 *  - 볼 때마다 core_audit 에 남긴다(edu.view / edu.file).
 */
declare(strict_types=1);

ini_set('display_errors', '0');
require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\TestLogin;

header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
header('X-Robots-Tag: noindex, nofollow');

$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/edu'), PHP_URL_PATH);
$a = Auth::actor();
$email = strtolower((string) ($a->user['email'] ?? ''));

if ($email === '') {
    header('Location: /api/v1/auth/google?next=' . rawurlencode('/edu'), true, 302);
    exit;
}

$allow = array_filter(array_map('trim', explode(',', strtolower((string) Db::val("SELECT v FROM core_settings WHERE k = 'edu.allow'")))));
if (TestLogin::isActor($a) || !in_array($email, $allow, true)) {
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>교육 자료</title>'
        . '<body style="font-family:system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 16px;color:#1a1c22">'
        . '<h1 style="font-size:24px">이 계정은 볼 수 없습니다</h1><p>지금 로그인한 계정: ' . htmlspecialchars($email) . '</p>'
        . '<p>교육 자료는 지정한 계정만 볼 수 있습니다. 다른 계정으로 로그인하려면 <a href="/login">로그인 화면</a>에서 로그아웃 후 다시 로그인하세요.</p></body>';
    exit;
}

$base = rtrim((string) Config::get('storage.dir', ''), '/') . '/edu';

// 파일 내려받기·바로 보기
if (preg_match('#^/edu/f/(.+)$#', $path, $m)) {
    $name = basename(rawurldecode($m[1]));
    $file = $base . '/files/' . $name;
    if ($name === '' || $name[0] === '.' || !is_file($file)) {
        http_response_code(404);
        echo '파일이 없습니다.';
        exit;
    }
    Audit::log($a, 'edu.file', 'edu:' . mb_substr($name, 0, 60));
    $size = filesize($file);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $type = ['mp4' => 'video/mp4', 'pdf' => 'application/pdf', 'md' => 'text/markdown; charset=utf-8', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation'][$ext] ?? 'application/octet-stream';
    $disp = isset($_GET['dl']) ? 'attachment' : 'inline';
    header('Content-Type: ' . $type);
    header("Content-Disposition: {$disp}; filename*=UTF-8''" . rawurlencode($name));
    header('Accept-Ranges: bytes');
    $start = 0;
    $end = $size - 1;
    if (preg_match('/bytes=(\d*)-(\d*)/', (string) ($_SERVER['HTTP_RANGE'] ?? ''), $r)) {
        if ($r[1] !== '') { $start = (int) $r[1]; }
        if ($r[2] !== '') { $end = min((int) $r[2], $size - 1); }
        if ($r[1] === '' && $r[2] !== '') { $start = max(0, $size - (int) $r[2]); $end = $size - 1; }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */{$size}");
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes {$start}-{$end}/{$size}");
    }
    header('Content-Length: ' . ($end - $start + 1));
    @set_time_limit(0);
    while (ob_get_level() > 0) { ob_end_clean(); }
    $fh = fopen($file, 'rb');
    fseek($fh, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($fh)) {
        $chunk = fread($fh, (int) min(1048576, $left));
        if ($chunk === false) { break; }
        echo $chunk;
        flush();
        $left -= strlen($chunk);
    }
    fclose($fh);
    exit;
}

// 페이지 본문
$index = $base . '/index.html';
if (!is_file($index)) {
    http_response_code(503);
    echo '교육 페이지가 아직 없습니다(서버의 storage.dir/edu/index.html).';
    exit;
}
Audit::log($a, 'edu.view', 'edu:index');
header('Content-Type: text/html; charset=utf-8');
readfile($index);
