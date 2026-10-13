<?php
declare(strict_types=1);

/**
 * 작업물 보관함 (2026-10-02, 관리자 전용): storage 에 만든 시안·연습·MCP 시험 결과를 목록·썸네일로 보고 하나씩 연다.
 * 서버: storage/works/{_works.json, _thumbs/, <폴더>/...} — scripts/works-sync.mjs 가 만들고 올린다.
 * 로컬: 목록·썸네일은 storage/works, 파일은 storage/<폴더> 에 그대로 있다(복사하지 않음).
 * 파일 응답은 세션 role=admin 만. storage 폴더는 웹에서 직접 못 연다(.htaccess 403).
 * @var Homebox\Http\Router $router
 */

use Homebox\Http\Auth;
use Homebox\Http\Response;

$worksRoots = static function (): array {
    $storage = rtrim((string) Config::get('storage.dir', __DIR__ . '/../../storage'), '/\\');
    return [rtrim((string) Config::get('works.dir', $storage . '/works'), '/\\'), $storage];
};

$worksManifest = static function () use ($worksRoots): array {
    [$root] = $worksRoots();
    $f = $root . '/_works.json';
    $m = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    return is_array($m) ? $m : ['generated_at' => null, 'groups' => []];
};

// GET /api/admin/works — 폴더별 목록(제목·썸네일·수정 시각)
$router->get('/api/admin/works', static function () use ($worksManifest): void {
    Auth::requireAdmin();
    Response::json($worksManifest(), 200, ['Cache-Control' => 'no-store']);
});

// GET /api/admin/works/file/{폴더/경로} — 시안 HTML·이미지. 상대 경로(img/x.png)가 그대로 풀리도록 경로형 주소.
$router->get('/api/admin/works/file/{path+}', static function (array $p) use ($worksRoots, $worksManifest): void {
    Auth::requireAdmin();
    $rel = str_replace('\\', '/', (string) $p['path']);
    $parts = array_values(array_filter(explode('/', $rel), static fn (string $s): bool => $s !== '' && $s !== '.'));
    if ($parts === [] || in_array('..', $parts, true)) {
        Response::error(404, 'NOT_FOUND', '파일을 찾을 수 없습니다.');
    }
    $folders = array_column($worksManifest()['groups'] ?? [], 'folder');
    if ($parts[0] !== '_thumbs' && !in_array($parts[0], $folders, true)) {
        Response::error(404, 'NOT_FOUND', '보관함에 없는 폴더입니다.');
    }
    $mimes = ['html' => 'text/html; charset=utf-8', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
        'gif' => 'image/gif', 'svg' => 'image/svg+xml', 'css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
        'woff2' => 'font/woff2', 'woff' => 'font/woff', 'mp4' => 'video/mp4'];
    $ext = strtolower(pathinfo(end($parts), PATHINFO_EXTENSION));
    if (!isset($mimes[$ext])) {
        Response::error(404, 'NOT_FOUND', '열 수 없는 형식입니다.');
    }
    $path = null;
    foreach ($worksRoots() as $root) {
        $c = $root . '/' . implode('/', $parts);
        $real = realpath($c);
        if ($real !== false && is_file($real) && str_starts_with(str_replace('\\', '/', $real), str_replace('\\', '/', (string) realpath($root)) . '/')) {
            $path = $real;
            break;
        }
    }
    if ($path === null) {
        Response::error(404, 'NOT_FOUND', '파일이 없습니다.');
    }
    header('Content-Type: ' . $mimes[$ext]);
    header('Content-Length: ' . (string) filesize($path));
    header('Cache-Control: private, max-age=' . ($ext === 'html' ? '0, no-store' : '3600'));
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex');
    // AI 가 만든 시안 파일을 홈박스 출처에서 그대로 실행하면 관리자 세션으로 관리자 API 를 부를 수 있다(보안 점검 2026-10-05).
    // 공개 시안과 같은 sandbox(같은 출처 아님) — 상대 경로 이미지·css·js 는 그대로 읽힌다.
    if ($ext === 'html' || $ext === 'svg') {
        header("Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals; form-action 'none'");
    }
    readfile($path);
    exit;
});

// GET /api/admin/mockups — MCP(check_mockup·publish_mockup)로 만든 시안과 판정 기록(운영 DB mockup_pages). 통과 못 한 시안도 보인다.
$router->get('/api/admin/mockups', static function (): void {
    Auth::requireAdmin();
    $rows = Homebox\Db::rows(
        'SELECT m.token, m.title, m.bytes, m.views, m.published, m.ref_id, m.check_score, m.check_pass, m.check_count, m.check_result,
                m.created_at, m.updated_at, m.checked_at, m.expires_at, k.name AS key_name, u.name AS user_name, u.email AS user_email
           FROM mockup_pages m
           LEFT JOIN api_keys k ON k.id = m.api_key_id
           LEFT JOIN users u ON u.id = k.created_by
          WHERE m.discarded_at IS NULL OR ? = 1
          ORDER BY m.updated_at DESC LIMIT 300', [(string) ($_GET['all'] ?? '')]
    ); // 80점 이하로 끝난 시안은 폐기 표시라 숨긴다(?all=1 이면 전부, 2026-10-03)
    $items = array_map(static function (array $r): array {
        $res = is_string($r['check_result']) ? json_decode($r['check_result'], true) : null;
        $ref = (string) ($r['ref_id'] ?? '');
        return [
            'token' => $r['token'], 'title' => $r['title'], 'bytes' => (int) $r['bytes'], 'views' => (int) $r['views'],
            'published' => (int) $r['published'] === 1,
            'score' => $r['check_score'] === null ? null : (int) $r['check_score'],
            'pass' => $r['check_pass'] === null ? null : (int) $r['check_pass'] === 1,
            'checks' => (int) $r['check_count'],
            'kind' => str_starts_with($ref, 'mix1:') ? 'mix' : ($ref === '' ? 'none' : 'single'),
            'summary' => is_array($res) ? (string) ($res['summary'] ?? '') : '',
            'fixes' => is_array($res) ? array_slice(array_map(static fn ($f) => is_array($f) ? (string) ($f['message'] ?? $f['what'] ?? json_encode($f, JSON_UNESCAPED_UNICODE)) : (string) $f, (array) ($res['fixes'] ?? [])), 0, 8) : [],
            'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'], 'checked_at' => $r['checked_at'], 'expires_at' => $r['expires_at'],
            'by' => trim((string) ($r['user_name'] ?? '')) !== '' ? $r['user_name'] : ($r['user_email'] ?? null),
            'key_name' => $r['key_name'],
        ];
    }, $rows);
    Response::json(['items' => $items], 200, ['Cache-Control' => 'no-store']);
});

// GET /api/admin/mockups/{token}/view — 관리자 보기(게시 전·만료 뒤 시안도 연다, 조회수는 올리지 않는다). 공개 주소와 같은 sandbox.
$router->get('/api/admin/mockups/{token}/view', static function (array $p): void {
    Auth::requireAdmin();
    $token = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($p['token'] ?? ''));
    $row = $token === '' ? null : Homebox\Db::row('SELECT html FROM mockup_pages WHERE token = ?', [$token]);
    if ($row === null) { Response::error(404, 'NOT_FOUND', '시안을 찾을 수 없습니다.'); }
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: private, no-store');
    header("Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals; form-action 'none'");
    echo $row['html'];
    exit;
});
