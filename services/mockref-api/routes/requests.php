<?php
declare(strict_types=1);

/**
 * 수행사 제보·요청 (S15 일부, 2026-09-24 "수행사·제작일시 확보 방법 ⑤"):
 *   POST /api/sites/{slug}/vendor-claim {vendor, relation: 'vendor'|'staff'|'user', contact?, evidence_url?, note?}  로그인 필요 → requests(kind=vendor_claim, open)
 *   GET  /api/sites/{slug}/vendor-claim   내 제보 상태
 *   GET  /api/admin/requests?kind=&status=          관리자 목록
 *   POST /api/admin/requests/{id}/accept {vendor?}  수락 → vendors upsert + sites.vendor_id(vendor_source='manual') (+ relation=vendor 면 verified)
 *   POST /api/admin/requests/{id}/reject {note?}
 * @var Homebox\Http\Router $router
 */

use Homebox\Auth\Session;
use Homebox\Db;
use Homebox\Http\Auth;
use Homebox\Http\Response;

$body = static fn (): array => json_decode((string) file_get_contents('php://input'), true) ?: [];
$siteBySlug = static function (string $slug): array {
    if (preg_match('/^[a-z0-9-]{1,100}$/', $slug) !== 1) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $s = Db::row("SELECT id, vendor_id FROM sites WHERE slug = ? AND status = 'published'", [$slug]);
    if ($s === null) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    return $s;
};
$slugify = static function (string $name): string {
    $s = mb_strtolower(preg_replace('/\(주\)|주식회사|㈜/u', '', $name) ?? $name);
    $s = preg_replace('/[^a-z0-9가-힣]+/u', '-', $s) ?? $s;
    $s = trim($s, '-');
    return $s === '' ? 'vendor' : mb_substr($s, 0, 80);
};
$upsertVendor = static function (string $name) use ($slugify): int {
    $slug = $slugify($name);
    $ex = Db::row('SELECT id FROM vendors WHERE slug = ? OR name = ?', [$slug, $name]);
    if ($ex !== null) {
        return (int) $ex['id'];
    }
    Db::exec('INSERT INTO vendors (slug, name) VALUES (?, ?)', [$slug, $name]);
    return (int) Db::pdo()->lastInsertId();
};

$router->post('/api/sites/{slug}/vendor-claim', static function (array $p) use ($body, $siteBySlug): void {
    $u = Session::user();
    if ($u === null) {
        Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    $s = $siteBySlug((string) $p['slug']);
    $b = $body();
    $vendor = trim((string) ($b['vendor'] ?? ''));
    if (mb_strlen($vendor) < 2 || mb_strlen($vendor) > 120) {
        Response::error(422, 'INVALID_VENDOR', '수행사 이름은 2~120자입니다.');
    }
    $relation = in_array($b['relation'] ?? '', ['vendor', 'staff', 'user'], true) ? $b['relation'] : 'user';
    $payload = [
        'vendor' => $vendor, 'relation' => $relation,
        'contact' => mb_substr(trim((string) ($b['contact'] ?? '')), 0, 120) ?: null,
        'evidence_url' => mb_substr(trim((string) ($b['evidence_url'] ?? '')), 0, 300) ?: null,
        'note' => mb_substr(trim((string) ($b['note'] ?? '')), 0, 500) ?: null,
    ];
    if ($payload['evidence_url'] !== null && preg_match('#^https?://#i', $payload['evidence_url']) !== 1) {
        Response::error(422, 'INVALID_URL', '근거 URL 은 http(s) 로 시작해야 합니다.');
    }
    // 같은 사용자의 열린 제보는 갱신
    $open = Db::row("SELECT id FROM requests WHERE kind = 'vendor_claim' AND site_id = ? AND user_id = ? AND status = 'open'", [$s['id'], $u['id']]);
    if ($open !== null) {
        Db::exec('UPDATE requests SET payload = ? WHERE id = ?', [json_encode($payload, JSON_UNESCAPED_UNICODE), $open['id']]);
        Response::json(['id' => (int) $open['id'], 'status' => 'open', 'updated' => true], 200, ['Cache-Control' => 'no-store']);
    }
    Db::exec("INSERT INTO requests (kind, site_id, user_id, payload) VALUES ('vendor_claim', ?, ?, ?)", [$s['id'], $u['id'], json_encode($payload, JSON_UNESCAPED_UNICODE)]);
    Response::json(['id' => (int) Db::pdo()->lastInsertId(), 'status' => 'open'], 201, ['Cache-Control' => 'no-store']);
});

$router->get('/api/sites/{slug}/vendor-claim', static function (array $p) use ($siteBySlug): void {
    $u = Session::user();
    $s = $siteBySlug((string) $p['slug']);
    $mine = $u ? Db::row("SELECT id, status, payload, created_at, admin_note FROM requests WHERE kind = 'vendor_claim' AND site_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1", [$s['id'], $u['id']]) : null;
    $openN = (int) (Db::row("SELECT COUNT(*) AS n FROM requests WHERE kind = 'vendor_claim' AND site_id = ? AND status = 'open'", [$s['id']])['n'] ?? 0);
    Response::json([
        'mine' => $mine ? ['id' => (int) $mine['id'], 'status' => $mine['status'], 'payload' => json_decode((string) $mine['payload'], true), 'created_at' => $mine['created_at'], 'admin_note' => $mine['admin_note']] : null,
        'open_count' => $openN,
    ], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/admin/requests', static function (): void {
    Auth::requireAdmin();
    $kind = (string) ($_GET['kind'] ?? 'vendor_claim');
    $status = (string) ($_GET['status'] ?? 'open');
    $where = ['1=1']; $params = [];
    if (in_array($kind, ['update', 'vendor_claim', 'new_site'], true)) { $where[] = 'r.kind = ?'; $params[] = $kind; }
    if (in_array($status, ['open', 'accepted', 'rejected', 'done'], true)) { $where[] = 'r.status = ?'; $params[] = $status; }
    $rows = Db::rows('SELECT r.id, r.kind, r.status, r.payload, r.admin_note, r.created_at, r.handled_at, r.site_id, s.slug, s.title, u.email, u.name AS user_name
                      FROM requests r LEFT JOIN sites s ON s.id = r.site_id LEFT JOIN users u ON u.id = r.user_id WHERE ' . implode(' AND ', $where) . ' ORDER BY r.id DESC LIMIT 200', $params);
    Response::json(['items' => array_map(static function (array $r): array {
        $r['id'] = (int) $r['id']; $r['site_id'] = $r['site_id'] === null ? null : (int) $r['site_id'];
        $r['payload'] = json_decode((string) $r['payload'], true);
        return $r;
    }, $rows)], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/admin/requests/{id}/accept', static function (array $p) use ($body, $upsertVendor): void {
    Auth::requireAdmin();
    $r = Db::row("SELECT * FROM requests WHERE id = ? AND status = 'open'", [(int) $p['id']]);
    if ($r === null) {
        Response::error(404, 'NOT_FOUND', '열린 요청이 없습니다.');
    }
    $pl = json_decode((string) $r['payload'], true) ?: [];
    $b = $body();
    $vendor = trim((string) ($b['vendor'] ?? $pl['vendor'] ?? ''));
    if ($r['kind'] === 'vendor_claim') {
        if ($vendor === '' || $r['site_id'] === null) {
            Response::error(422, 'INVALID', '수행사 이름과 사이트가 필요합니다.');
        }
        $vid = $upsertVendor($vendor);
        Db::exec("UPDATE sites SET vendor_id = ?, vendor_source = 'manual' WHERE id = ?", [$vid, $r['site_id']]);
        if (($pl['relation'] ?? '') === 'vendor') {
            Db::exec('UPDATE vendors SET verified = 1 WHERE id = ?', [$vid]);
        }
    }
    Db::exec("UPDATE requests SET status = 'accepted', handled_at = NOW(3), admin_note = ? WHERE id = ?", [mb_substr((string) ($b['note'] ?? ''), 0, 300) ?: null, $r['id']]);
    if ($r['user_id'] !== null) {
        $slug = $r['site_id'] !== null ? (Db::row('SELECT slug FROM sites WHERE id = ?', [$r['site_id']])['slug'] ?? null) : null;
        \Homebox\Notify::send((int) $r['user_id'], 'request', '보내 주신 요청이 반영되었습니다', $vendor !== '' ? "수행사: $vendor" : null, $slug ? "/sites/$slug" : null);
    }
    Response::json(['ok' => true, 'vendor' => $vendor], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/admin/requests/{id}/reject', static function (array $p) use ($body): void {
    Auth::requireAdmin();
    $note = mb_substr((string) ($body()['note'] ?? ''), 0, 300) ?: null;
    $n = Db::exec("UPDATE requests SET status = 'rejected', handled_at = NOW(3), admin_note = ? WHERE id = ? AND status = 'open'", [$note, (int) $p['id']]);
    if ($n === 0) {
        Response::error(404, 'NOT_FOUND', '열린 요청이 없습니다.');
    }
    $r = Db::row('SELECT user_id FROM requests WHERE id = ?', [(int) $p['id']]);
    if ($r !== null && $r['user_id'] !== null) {
        \Homebox\Notify::send((int) $r['user_id'], 'request', '보내 주신 요청을 반영하지 못했습니다', $note);
    }
    Response::json(['ok' => true], 200, ['Cache-Control' => 'no-store']);
});

// 업데이트 요청 (Mobbin "Request update", 2026-09-24): 개편됐거나 캡처가 오래된 기관을 다시 수집해 달라는 요청.
// 로그인 필요, 같은 사용자·같은 기관의 열린 요청은 하나만(다시 누르면 메모만 갱신).
$router->post('/api/sites/{slug}/update-request', static function (array $p) use ($body, $siteBySlug): void {
    $u = Session::user();
    if ($u === null) {
        Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    $s = $siteBySlug((string) $p['slug']);
    $note = mb_substr(trim((string) ($body()['note'] ?? '')), 0, 500);
    $payload = json_encode(['note' => $note], JSON_UNESCAPED_UNICODE);
    $open = Db::row("SELECT id FROM requests WHERE kind = 'update' AND site_id = ? AND user_id = ? AND status = 'open'", [$s['id'], $u['id']]);
    if ($open !== null) {
        Db::exec('UPDATE requests SET payload = ? WHERE id = ?', [$payload, $open['id']]);
    } else {
        Db::exec("INSERT INTO requests (kind, site_id, user_id, payload) VALUES ('update', ?, ?, ?)", [$s['id'], $u['id'], $payload]);
    }
    Response::json(['ok' => true, 'already' => $open !== null]);
});

// 문의 (/contact, 2026-09-24): 비로그인도 가능. 같은 이메일은 1분에 한 번. 팀 도입·Enterprise 상담도 여기로 받는다.
$router->post('/api/contact', static function () use ($body): void {
    $b = $body();
    $name = trim((string) ($b['name'] ?? ''));
    $email = trim((string) ($b['email'] ?? ''));
    $topic = in_array($b['topic'] ?? '', ['general', 'team', 'enterprise', 'partner', 'bug', 'data'], true) ? $b['topic'] : 'general';
    $message = trim((string) ($b['message'] ?? ''));
    $errors = [];
    if (mb_strlen($name) < 1 || mb_strlen($name) > 60) { $errors['name'] = '이름을 입력해 주세요.'; }
    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) { $errors['email'] = '이메일 형식이 올바르지 않습니다.'; }
    if (mb_strlen($message) < 10 || mb_strlen($message) > 3000) { $errors['message'] = '내용을 10자 이상 적어 주세요.'; }
    if ($errors !== []) {
        Response::error(422, 'INVALID', '입력값을 확인해 주세요.', $errors);
    }
    $dup = Db::row("SELECT id FROM requests WHERE kind = 'contact' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.email')) = ? AND created_at > NOW() - INTERVAL 1 MINUTE", [$email]);
    if ($dup !== null) {
        Response::error(429, 'TOO_MANY', '잠시 뒤에 다시 보내 주세요.');
    }
    $u = Session::user();
    $payload = json_encode(['name' => $name, 'email' => $email, 'org' => mb_substr(trim((string) ($b['org'] ?? '')), 0, 120), 'seats' => (int) ($b['seats'] ?? 0) ?: null, 'topic' => $topic, 'message' => $message], JSON_UNESCAPED_UNICODE);
    Db::exec("INSERT INTO requests (kind, user_id, payload) VALUES ('contact', ?, ?)", [$u['id'] ?? null, $payload]);
    Response::json(['ok' => true]);
});

// 기관 수집 요청 (Mobbin "어떤 앱을 추가할까요?" 모달, 2026-09-24) → requests(kind=new_site). 로그인 필요, 같은 주소는 한 번만.
$router->post('/api/requests/new-site', static function () use ($body): void {
    $u = Session::user();
    if ($u === null) {
        Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    $b = $body();
    $name = mb_substr(trim((string) ($b['name'] ?? '')), 0, 120);
    $url = trim((string) ($b['url'] ?? ''));
    if ($url !== '' && !preg_match('#^https?://#i', $url)) {
        $url = 'https://' . $url;
    }
    if ($name === '' && $url === '') {
        Response::error(422, 'INVALID', '기관 이름이나 주소를 입력해 주세요.');
    }
    if ($url !== '' && filter_var($url, FILTER_VALIDATE_URL) === false) {
        Response::error(422, 'INVALID_URL', '주소 형식이 올바르지 않습니다.');
    }
    $host = $url !== '' ? preg_replace('/^www\./', '', (string) parse_url($url, PHP_URL_HOST)) : '';
    if ($host !== '') {
        $have = Db::row("SELECT slug, status FROM sites WHERE REPLACE(domain, 'www.', '') = ? LIMIT 1", [$host]);
        if ($have !== null && $have['status'] === 'published') {
            Response::json(['ok' => true, 'exists' => $have['slug']]);
        }
        $dup = Db::row("SELECT id FROM requests WHERE kind = 'new_site' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.host')) = ? AND status = 'open'", [$host]);
        if ($dup !== null) {
            Response::json(['ok' => true, 'already' => true]);
        }
    }
    $payload = json_encode(['name' => $name, 'url' => $url, 'host' => $host, 'note' => mb_substr(trim((string) ($b['note'] ?? '')), 0, 500)], JSON_UNESCAPED_UNICODE);
    Db::exec("INSERT INTO requests (kind, user_id, payload) VALUES ('new_site', ?, ?)", [$u['id'], $payload]);
    Response::json(['ok' => true]);
});
