<?php
declare(strict_types=1);

/**
 * 로그인 (Phase 4, docs/08): GET /api/auth/{provider} → 동의 화면, GET /api/auth/{provider}/callback → 세션, POST /api/auth/logout, GET /api/me
 * 소셜 3종(구글·네이버·카카오). 이메일 로그인은 후속. 프론트는 `?next=` 로 돌아갈 경로를 넘긴다(앱 내부 경로만 허용).
 * @var Homebox\Http\Router $router
 */

use Homebox\Auth\OAuth;
use Homebox\Auth\Session;
use Homebox\Db;
use Homebox\Http\Response;

$appPath = static function (string $next): string {
    $base = rtrim((string) Config::get('app.base', '/'), '/');
    // 오픈 리다이렉트 방지: 앱 내부 절대 경로만
    if ($next === '' || $next[0] !== '/' || str_starts_with($next, '//') || str_contains($next, '://') || str_contains($next, '\\') || preg_match('/[\x00-\x1f]/', $next)) {
        $next = '/';
    }
    return ($base === '' ? '' : $base) . $next;
};

$router->get('/api/auth/logout', static function () use ($appPath): void {
    Session::logout();
    header('Location: ' . $appPath('/'), true, 302);
    exit;
});
$router->post('/api/auth/logout', static function (): void {
    Session::logout();
    Response::json(['ok' => true]);
});

$router->get('/api/me', static function (): void {
    $u = Session::user();
    if ($u === null) {
        Response::json(['user' => null], 200, ['Cache-Control' => 'no-store']);
    }
    $providers = array_column(Db::rows('SELECT provider FROM oauth_accounts WHERE user_id = ? ORDER BY id', [$u['id']]), 'provider');
    $sub = Db::row("SELECT plan_id, status, billing, current_period_end FROM subscriptions WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due') ORDER BY id DESC LIMIT 1", [$u['id']]);
    $changes = $u['name_changes']; unset($u['name_changes']);
    // 소셜 계정이 이메일을 안 준 경우(카카오 비즈 앱 전 등) 만든 자리표시자 주소는 화면에 보이지 않게 null 로 (2026-09-24)
    if (str_ends_with((string) $u['email'], '@noemail.homebox.local')) {
        $u['email'] = null;
    }
    Response::json(['user' => $u + ['providers' => $providers, 'plan' => $sub['plan_id'] ?? 'free', 'subscription' => $sub, 'name_change' => nameChangeRule($changes)]], 200, ['Cache-Control' => 'no-store']);
});

/**
 * 이름 변경 제한 (사용자 지시 2026-09-24 "아무 때나 바꿀 수 없게"): 바꾼 뒤 14일이 지나야 다시 바꿀 수 있고, 최근 12개월 동안 최대 4번.
 * @param list<string> $changes 변경 시각(ISO) 목록
 * @return array{allowed:bool, next_at:?string, left:int, gap_days:int, per_year:int}
 */
function nameChangeRule(array $changes): array
{
    $gap = 14; $perYear = 4; $now = time();
    $recent = array_values(array_filter(array_map('strtotime', $changes), static fn ($t) => $t !== false && $t > $now - 365 * 86400));
    sort($recent);
    $left = max(0, $perYear - count($recent));
    $next = null;
    if ($recent !== []) {
        $byGap = end($recent) + $gap * 86400;
        $byYear = $left === 0 ? $recent[0] + 365 * 86400 : 0;
        $t = max($byGap, $byYear);
        if ($t > $now) {
            $next = date('c', $t);
        }
    }
    return ['allowed' => $next === null && $left > 0, 'next_at' => $next, 'left' => $left, 'gap_days' => $gap, 'per_year' => $perYear];
}

// 계정 화면 (Mobbin Account·Preferences 구조, 2026-09-24): 이름·환경설정 수정 / 모든 기기 로그아웃 / 계정 삭제
$router->patch('/api/me', static function (): void {
    $u = Session::user() ?? Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
    if (array_key_exists('name', $body)) {
        $name = trim((string) $body['name']);
        if ($name === '' || mb_strlen($name) > 60) {
            Response::error(400, 'BAD_NAME', '이름은 1~60자로 입력하세요.');
        }
        if ($name !== (string) $u['name']) {
            $rule = nameChangeRule($u['name_changes']);
            if (!$rule['allowed']) {
                $when = $rule['next_at'] !== null ? date('Y.m.d', (int) strtotime($rule['next_at'])) . '부터' : '나중에';
                Response::error(429, 'NAME_CHANGE_LIMIT', "이름은 바꾼 뒤 {$rule['gap_days']}일이 지나야 다시 바꿀 수 있고, 1년에 {$rule['per_year']}번까지 바꿀 수 있습니다. {$when} 다시 바꿀 수 있습니다.");
            }
            $changes = array_values(array_filter($u['name_changes'], static fn ($t) => strtotime((string) $t) > time() - 365 * 86400));
            $changes[] = date('c');
            Db::exec('UPDATE users SET name = ?, name_changes = ? WHERE id = ?', [$name, json_encode($changes), $u['id']]);
        }
    }
    if (isset($body['prefs']) && is_array($body['prefs'])) {
        $allowed = ['hide_attribution', 'autoplay', 'email_news'];
        $prefs = $u['prefs'];
        foreach ($allowed as $k) {
            if (array_key_exists($k, $body['prefs'])) {
                $prefs[$k] = (bool) $body['prefs'][$k];
            }
        }
        Db::exec('UPDATE users SET prefs = ? WHERE id = ?', [json_encode($prefs), $u['id']]);
    }
    Response::json(['ok' => true]);
});
$router->post('/api/auth/logout-all', static function (): void {
    $u = Session::user() ?? Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    Db::exec('UPDATE users SET session_epoch = session_epoch + 1 WHERE id = ?', [$u['id']]);
    Session::logout();
    Response::json(['ok' => true]);
});
$router->delete('/api/me', static function (): void {
    $u = Session::user() ?? Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    $sub = Db::row("SELECT id FROM subscriptions WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due') LIMIT 1", [$u['id']]);
    if ($sub !== null) {
        Response::error(409, 'ACTIVE_SUBSCRIPTION', '이용 중인 구독이 있습니다. 구독을 해지한 뒤 삭제해 주세요.');
    }
    // 소프트 삭제: 평가·컬렉션 FK 는 두고 개인정보(메일·이름·사진)는 비운다. 소셜 연결을 끊어 다시 로그인하면 새 계정이 된다
    Db::exec("UPDATE users SET email = CONCAT('deleted+', id, '@homebox.invalid'), name = NULL, avatar_url = NULL, prefs = NULL, deleted_at = NOW(3), session_epoch = session_epoch + 1 WHERE id = ?", [$u['id']]);
    Db::exec('DELETE FROM oauth_accounts WHERE user_id = ?', [$u['id']]);
    Db::exec("UPDATE api_keys SET revoked_at = NOW(3) WHERE owner_type = 'user' AND owner_id = ? AND revoked_at IS NULL", [$u['id']]);
    Session::logout();
    Response::json(['ok' => true]);
});

// 로컬 개발 전용: app.debug=true 일 때만 관리자 토큰으로 사용자 1(개발자) 세션을 만든다 — 계정·키·결제 화면 테스트용. 운영(debug=false)에서는 404
$router->get('/api/auth/dev', static function () use ($appPath): void {
    $loop = in_array((string) ($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
    if (!$loop || !(bool) Config::get('app.debug', false) || !hash_equals((string) Config::get('admin.token', ''), (string) ($_GET['token'] ?? ''))) {
        Response::error(404, 'NOT_FOUND', '경로를 찾을 수 없습니다.');
    }
    $u = isset($_GET['uid']) // 알림 시험처럼 두 계정이 필요할 때 (개발 모드 전용)
        ? Db::row('SELECT id FROM users WHERE id = ?', [(int) $_GET['uid']])
        : Db::row('SELECT id FROM users ORDER BY id LIMIT 1');
    if ($u === null) {
        Response::error(404, 'NOT_FOUND', '사용자가 없습니다.');
    }
    Session::login((int) $u['id']);
    header('Location: ' . $appPath((string) ($_GET['next'] ?? '/account')), true, 302);
    exit;
});

/*
 * 이메일 로그인 (2026-09-24): 6자리 코드를 메일로 보내고, 맞으면 로그인(없으면 가입).
 *   POST /api/auth/email/request {email}      → 코드 발송 (같은 주소 60초에 1번·1시간에 5번, 같은 IP 1시간에 20번)
 *   POST /api/auth/email/verify  {email,code} → 10분 유효, 5번 틀리면 폐기
 * 메일 설정이 없으면: 로컬(app.debug)은 응답에 debug_code 를 실어 화면 테스트, 운영은 503.
 */
$emailBody = static fn (): array => json_decode((string) file_get_contents('php://input'), true) ?: [];
$router->post('/api/auth/email/request', static function () use ($emailBody): void {
    $email = mb_strtolower(trim((string) ($emailBody()['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        Response::error(400, 'INVALID_EMAIL', '이메일 주소를 확인해 주세요.');
    }
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $recent = Db::row('SELECT COUNT(*) AS n, MAX(created_at > NOW() - INTERVAL 60 SECOND) AS last FROM email_codes WHERE email = ? AND created_at > NOW() - INTERVAL 1 HOUR', [$email]);
    if ((int) ($recent['last'] ?? 0) === 1) {
        Response::error(429, 'TOO_SOON', '방금 코드를 보냈습니다. 1분 뒤에 다시 요청해 주세요.');
    }
    $byIp = (int) (Db::row('SELECT COUNT(*) AS n FROM email_codes WHERE ip = ? AND created_at > NOW() - INTERVAL 1 HOUR', [$ip])['n'] ?? 0);
    if ((int) ($recent['n'] ?? 0) >= 5 || $byIp >= 20) {
        Response::error(429, 'TOO_MANY', '요청이 너무 많습니다. 잠시 뒤에 다시 시도해 주세요.');
    }
    $debug = (bool) Config::get('app.debug', false);
    if (!\Homebox\Mail::configured() && !$debug) {
        Response::error(503, 'MAIL_NOT_CONFIGURED', '지금은 이메일 로그인을 쓸 수 없습니다. 소셜 계정으로 이용해 주세요.');
    }
    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    Db::exec('UPDATE email_codes SET used_at = NOW() WHERE email = ? AND used_at IS NULL', [$email]); // 이전 코드는 무효
    Db::exec('INSERT INTO email_codes (email, code_hash, expires_at, ip) VALUES (?, ?, NOW() + INTERVAL 10 MINUTE, ?)', [$email, hash('sha256', $email . '|' . $code), $ip]);
    if (\Homebox\Mail::configured()) {
        try {
            \Homebox\Mail::send($email, "[홈박스] 로그인 코드 $code", "홈박스 로그인 코드입니다.\n\n$code\n\n10분 안에 입력해 주세요.\n직접 요청하지 않았다면 이 메일은 무시하셔도 됩니다.\n\n— 홈박스 https://hom2box.com/homebox/");
        } catch (Throwable $e) {
            error_log('[homebox-mail] ' . $e->getMessage());
            Response::error(502, 'MAIL_FAILED', '메일을 보내지 못했습니다. 잠시 뒤에 다시 시도해 주세요.');
        }
    }
    Response::json(['ok' => true, 'ttl' => 600] + ($debug && !\Homebox\Mail::configured() ? ['debug_code' => $code] : []));
});

$router->post('/api/auth/email/verify', static function () use ($emailBody): void {
    $b = $emailBody();
    $email = mb_strtolower(trim((string) ($b['email'] ?? '')));
    $code = preg_replace('/\D/', '', (string) ($b['code'] ?? '')) ?? '';
    $row = Db::row('SELECT id, code_hash, attempts, expires_at < NOW() AS expired FROM email_codes WHERE email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', [$email]);
    if ($row === null || (int) $row['expired'] === 1) {
        Response::error(400, 'CODE_EXPIRED', '코드가 만료되었습니다. 다시 요청해 주세요.');
    }
    if ((int) $row['attempts'] >= 5) {
        Db::exec('UPDATE email_codes SET used_at = NOW() WHERE id = ?', [$row['id']]);
        Response::error(429, 'TOO_MANY_ATTEMPTS', '코드를 여러 번 틀렸습니다. 새 코드를 요청해 주세요.');
    }
    if (strlen($code) !== 6 || !hash_equals((string) $row['code_hash'], hash('sha256', $email . '|' . $code))) {
        Db::exec('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
        Response::error(400, 'CODE_MISMATCH', '코드가 맞지 않습니다.');
    }
    Db::exec('UPDATE email_codes SET used_at = NOW() WHERE id = ?', [$row['id']]);
    // 같은 이메일의 기존 사용자(소셜 가입 포함) → 그 계정으로, 없으면 신규. oauth_accounts 에 'email' 방식을 연결해 둔다
    $u = Db::row('SELECT id FROM users WHERE email = ?', [$email]);
    if ($u === null) {
        Db::exec('INSERT INTO users (email) VALUES (?)', [$email]);
        $userId = (int) Db::pdo()->lastInsertId();
    } else {
        $userId = (int) $u['id'];
    }
    Db::exec('INSERT IGNORE INTO oauth_accounts (user_id, provider, provider_uid) VALUES (?, "email", ?)', [$userId, $email]);
    Session::login($userId);
    Response::json(['ok' => true, 'new' => $u === null]);
});

$router->get('/api/auth/{provider}', static function (array $p): void {
    $prov = (string) $p['provider'];
    if (!in_array($prov, OAuth::PROVIDERS, true)) {
        Response::error(404, 'NOT_FOUND', '지원하지 않는 로그인 방식입니다.');
    }
    if (!OAuth::configured($prov)) {
        Response::error(503, 'OAUTH_NOT_CONFIGURED', "$prov 로그인 키가 설정되지 않았습니다 (config oauth.$prov).");
    }
    $state = bin2hex(random_bytes(16));
    Session::set('oauth_state', $state);
    Session::set('oauth_next', (string) ($_GET['next'] ?? '/'));
    header('Location: ' . OAuth::authorizeUrl($prov, $state), true, 302);
    exit;
});

$router->get('/api/auth/{provider}/callback', static function (array $p) use ($appPath): void {
    $prov = (string) $p['provider'];
    if (!in_array($prov, OAuth::PROVIDERS, true)) {
        Response::error(404, 'NOT_FOUND', '지원하지 않는 로그인 방식입니다.');
    }
    $next = (string) (Session::pull('oauth_next') ?? '/');
    $expected = (string) (Session::pull('oauth_state') ?? '');
    $state = (string) ($_GET['state'] ?? '');
    $code = (string) ($_GET['code'] ?? '');
    if (isset($_GET['error']) || $code === '' || $expected === '' || !hash_equals($expected, $state)) {
        // 원인 구분 로그 (2026-09-24 운영 로그인 실패 조사: state 불일치는 기록이 없어 원인 추적 불가였음)
        $why = isset($_GET['error']) ? 'provider:' . $_GET['error'] : ($code === '' ? 'no_code' : ($expected === '' ? 'no_session_state' : 'state_mismatch'));
        error_log("[homebox-auth] $prov callback 거부 ($why) sid=" . substr(session_id(), 0, 8) . ' cookie=' . (isset($_COOKIE[session_name()]) ? 'y' : 'n'));
        $err = isset($_GET['error']) ? (string) $_GET['error'] : ($expected === '' ? 'session' : 'state');
        header('Location: ' . $appPath('/login?error=' . rawurlencode($err)), true, 302);
        exit;
    }
    try {
        $me = OAuth::exchange($prov, $code, $state);
    } catch (Throwable $e) {
        error_log('[homebox-auth] ' . $e->getMessage());
        header('Location: ' . $appPath('/login?error=exchange'), true, 302);
        exit;
    }
    if ($me['uid'] === '') {
        header('Location: ' . $appPath('/login?error=profile'), true, 302);
        exit;
    }
    // 연결된 계정 → 로그인 / 같은 이메일의 사용자 → 계정 연결 / 없으면 신규
    $acct = Db::row('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_uid = ?', [$prov, $me['uid']]);
    if ($acct !== null) {
        $userId = (int) $acct['user_id'];
        Db::exec('UPDATE users SET name = COALESCE(name, ?), avatar_url = IF(avatar_url LIKE "%/api/avatars/%", avatar_url, COALESCE(?, avatar_url)) WHERE id = ?', [$me['name'], $me['avatar'], $userId]);
    } else {
        // 이메일은 공급자가 소유를 확인해 준 것만 쓴다(보안 점검 2026-10-05). 검증 안 된 이메일(네이버 연락처 등)로
        // 기존 계정에 붙이거나 그 이메일로 새 계정을 만들면, 나중에 진짜 주인이 로그인할 때 남의 계정에 들어가게 된다.
        $verified = !empty($me['verified']) && $me['email'] !== null && $me['email'] !== '';
        $email = $verified ? mb_strtolower((string) $me['email']) : "$prov-{$me['uid']}@noemail.homebox.local";
        $existing = Db::row('SELECT id FROM users WHERE email = ?', [$email]);
        if ($existing !== null) {
            $userId = (int) $existing['id'];
        } else {
            Db::exec('INSERT INTO users (email, name, avatar_url) VALUES (?, ?, ?)', [$email, $me['name'], $me['avatar']]);
            $userId = (int) Db::pdo()->lastInsertId();
        }
        Db::exec('INSERT INTO oauth_accounts (user_id, provider, provider_uid) VALUES (?, ?, ?)', [$userId, $prov, $me['uid']]);
    }
    Session::login($userId);
    header('Location: ' . $appPath($next), true, 302);
    exit;
});

// 프로필 이미지 업로드 (사용자 지시 2026-09-24): JPG·PNG·WEBP·GIF 5MB 이하 → 가운데를 정사각으로 잘라 256px WEBP 로 저장.
// 저장 위치는 storage/avatars/{id}.webp (공개 자산 폴더 밖 — 배포 동기화가 덮지 않게), 제공은 GET /api/avatars/{id}.
// 업로드한 사진은 소셜 로그인이 다시 덮어쓰지 않는다(콜백의 avatar_url 갱신이 /api/avatars/ 는 건너뜀).
$avatarPath = static fn (int $id): string => rtrim((string) Config::get('storage.dir', __DIR__ . '/../../storage'), '/\\') . "/avatars/$id.webp";
$router->post('/api/me/avatar', static function () use ($avatarPath): void {
    $u = Session::user() ?? Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    $f = $_FILES['file'] ?? null;
    if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        Response::error(400, 'NO_FILE', '이미지를 선택하세요.');
    }
    if ((int) $f['size'] > 5 * 1024 * 1024) {
        Response::error(413, 'TOO_LARGE', '5MB 이하 이미지만 올릴 수 있습니다.');
    }
    $info = @getimagesize((string) $f['tmp_name']);
    $types = [IMAGETYPE_JPEG => 'imagecreatefromjpeg', IMAGETYPE_PNG => 'imagecreatefrompng', IMAGETYPE_WEBP => 'imagecreatefromwebp', IMAGETYPE_GIF => 'imagecreatefromgif'];
    if ($info !== false && (int) $info[0] * (int) $info[1] > 40_000_000) {
        Response::error(413, 'IMAGE_TOO_LARGE', '이미지 크기가 너무 큽니다(4천만 화소 이하).');
    }
    if ($info === false || !isset($types[$info[2]])) {
        Response::error(415, 'BAD_IMAGE', 'JPG·PNG·WEBP·GIF 이미지만 올릴 수 있습니다.');
    }
    $src = @($types[$info[2]])((string) $f['tmp_name']);
    if ($src === false) {
        Response::error(415, 'BAD_IMAGE', '이미지를 읽을 수 없습니다.');
    }
    [$w, $h] = [imagesx($src), imagesy($src)];
    $side = min($w, $h);
    $dst = imagecreatetruecolor(256, 256);
    imagealphablending($dst, false); imagesavealpha($dst, true);
    imagecopyresampled($dst, $src, 0, 0, intdiv($w - $side, 2), intdiv($h - $side, 2), 256, 256, $side, $side);
    $path = $avatarPath((int) $u['id']);
    if (!is_dir(dirname($path))) {
        mkdir(dirname($path), 0775, true);
    }
    imagewebp($dst, $path, 86);
    $base = rtrim((string) Config::get('app.base', '/'), '/');
    $url = "$base/api/avatars/{$u['id']}?v=" . time();
    Db::exec('UPDATE users SET avatar_url = ? WHERE id = ?', [$url, $u['id']]);
    Response::json(['ok' => true, 'avatar_url' => $url]);
});
$router->delete('/api/me/avatar', static function () use ($avatarPath): void {
    $u = Session::user() ?? Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    @unlink($avatarPath((int) $u['id']));
    Db::exec('UPDATE users SET avatar_url = NULL WHERE id = ?', [$u['id']]);
    Response::json(['ok' => true]);
});
$router->get('/api/avatars/{id}', static function (array $p) use ($avatarPath): void {
    $path = $avatarPath((int) $p['id']);
    if (!is_file($path)) {
        Response::error(404, 'NOT_FOUND', '프로필 이미지가 없습니다.');
    }
    header('Content-Type: image/webp');
    header('Content-Length: ' . (string) filesize($path));
    header('Cache-Control: public, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
});
