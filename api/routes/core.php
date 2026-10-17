<?php
/**
 * 공통 라우트: 상태·인증·내 정보·API 키.
 * 출처: homebox-handoff api/routes/auth.php·api-keys.php·public.php 구조 이식(응답 규약·Actor 로 변경)
 */
declare(strict_types=1);

use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Config;
use Pp\Core\Consents;
use Pp\Core\Db;
use Pp\Core\MailTemplate;
use Pp\Core\HttpError;
use Pp\Core\Keys;
use Pp\Core\OAuth;
use Pp\Core\Otp;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Core\Scan;
use Pp\Core\Session;
use Pp\Core\TestLogin;
use Pp\Core\Users;

return static function (Router $r): void {
    // ---- 상태 (DB 를 실제로 읽는다 — health 만으론 부족하다는 교훈)
    $r->get('/health', function (): void {
        $db = false;
        $tables = 0;
        try {
            $tables = (int) Db::val("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'core\\_%'");
            $db = $tables > 0;
        } catch (\Throwable) {
        }
        Response::json(['ok' => true, 'db' => $db, 'core_tables' => $tables, 'version' => Config::get('app.version', '0.1.0'), 'time' => date('c')]);
    });

    // ---- 이메일 OTP
    $r->post('/auth/otp/request', function (): void {
        $in = Response::input();
        Response::json(Otp::request((string) ($in['email'] ?? '')));
    });
    $r->post('/auth/otp/verify', function (): void {
        $in = Response::input();
        $u = Otp::verify((string) ($in['email'] ?? ''), (string) ($in['code'] ?? ''));
        Session::login((int) $u['id'], (int) $u['session_epoch']);
        Auth::reset();
        Response::json(Auth::actor()->toArray());
    });

    // ---- 로컬 개발 로그인(debug 만, 루프백만)
    $r->get('/auth/dev', function (array $p): void {
        if (!Config::debug() || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
            throw HttpError::notFound('경로');
        }
        $email = (string) ($_GET['email'] ?? 'dev@localhost.test');
        $u = Users::findOrCreateByLogin('email', $email, $email, true, 'dev', null);
        Session::login((int) $u['id'], (int) $u['session_epoch']);
        Auth::reset();
        Response::json(Auth::actor()->toArray());
    });

    // ---- 임시 테스트 계정(아이디·비밀번호, 기간 한정 — TestLogin). 기간 밖이거나 노출 플래그
    //      (auth.test.show_login, 기본 꺼짐 — test-account.php show/hide)가 꺼져 있으면 404 — 로그인 칸도 안 보이고 로그인도 안 된다.
    $r->get('/auth/test-login', function (): void {
        if (!TestLogin::shown()) {
            throw HttpError::notFound('경로');
        }
        Response::json(['active' => true, 'show' => true, 'until' => TestLogin::until()]);
    });
    $r->post('/auth/test-login', function (): void {
        if (!TestLogin::shown()) {
            throw HttpError::notFound('경로');
        }
        $in = Response::input();
        $u = TestLogin::verify(trim((string) ($in['user'] ?? '')), (string) ($in['password'] ?? ''));
        Session::login((int) $u['id'], (int) $u['session_epoch']);
        Auth::reset();
        Response::json(Auth::actor()->toArray());
    });

    // ---- 소셜 로그인
    $r->get('/auth/providers',function (): void {
        $out = [];
        foreach (OAuth::providers() as $p) {
            $out[] = ['provider' => $p, 'enabled' => (string) Config::get("oauth.{$p}.id", '') !== ''];
        }
        Response::json($out, 200, ['meta' => ['test_login' => TestLogin::shown()]]);
    });
    $r->get('/auth/{provider}', function (array $p): void {
        $url = OAuth::startUrl($p['provider'], (string) ($_GET['next'] ?? '/'));
        header('Location: ' . $url, true, 302);
        exit;
    });
    $r->get('/auth/{provider}/callback', function (array $p): void {
        $base = rtrim((string) Config::get('app.url'), '/');
        try {
            $u = OAuth::callback($p['provider'], $_GET);
        } catch (HttpError $e) {
            error_log('[pp-auth] ' . $p['provider'] . ' ' . $e->getMessage());
            header('Location: ' . $base . '/login?error=' . rawurlencode($e->errorCode), true, 302);
            exit;
        }
        Session::login((int) $u['id'], (int) $u['session_epoch']);
        header('Location: ' . $base . OAuth::nextAfterLogin(), true, 302);
        exit;
    });

    // ---- 세션
    $r->post('/auth/logout', function (): void {
        Session::logout();
        Response::noContent();
    });
    $r->post('/auth/logout-all', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        Db::exec('UPDATE core_users SET session_epoch = session_epoch + 1 WHERE id = ?', [$u['id']]);
        Session::logout();
        Response::noContent();
    }, ['auth' => true]);

    // ---- 내 정보
    $r->get('/me', function (array $p, Actor $a): void {
        $out = $a->toArray();
        if ($a->user) {
            $out['logins'] = Db::rows('SELECT provider, email, email_verified, last_login_at FROM core_user_logins WHERE user_id = ? ORDER BY id', [$a->id()]);
            $out['limits'] = ['api_daily' => Access::limit($a, 'api_daily', 0)];
            $out['billing_visible'] = (bool) Config::get('features.billing_visible', false) || $a->hasRole('superadmin');
            $out['consent'] = Consents::status((int) $a->id());
        }
        // 서비스 이용 자격(회원 전용, 2026-10-16) — 화면이 잠금 안내를 고른다. staff_until = 임직원 이용 기간 끝
        $member = Access::member($a);
        $out['access'] = [
            'member' => $member,
            'view' => $member || Access::viewer($a),   // 보기 — 로그인한 Free 회원은 화면을 볼 수 있다(쓰기·내려받기는 member 만)
            'reason' => $member ? null : Access::memberError($a)->errorCode,
            'staff_until' => $a->user !== null && ($a->user['kind'] ?? '') === 'staff' ? ($a->user['access_until'] ?? null) : null,
        ];
        Response::json($out);
    });

    // ---- 가입 동의(만 14세·약관·개인정보·국외 이전 필수, 마케팅 선택). 동의 전에는 Router 가 로그인 기능을 막는다.
    $r->post('/me/consents', function (array $p, Actor $a): void {
        Response::json(Consents::record($a, Response::input()));
    }, ['auth' => true]);

    // ---- 내 크레딧 지갑(결제 공개 여부와 무관하게 본다 — 관리자 지급·월 포함분도 여기서 보인다)
    $r->get('/me/credits', function (array $p, Actor $a): void {
        $uid = (int) $a->id();
        [$page, $limit, $off] = Response::paging(20, 100);
        $alive = '(expires_at IS NULL OR expires_at > NOW(3))';
        $sum = static fn (string $where): int => (int) Db::val("SELECT COALESCE(SUM(delta), 0) FROM core_credit_ledger WHERE user_id = ? AND {$where}", [$uid]);
        $total = (int) Db::val('SELECT COUNT(*) FROM core_credit_ledger WHERE user_id = ?', [$uid]);
        $rows = array_map(static fn ($x) => [
            'delta' => (int) $x['delta'], 'kind' => $x['kind'], 'balance_after' => (int) $x['balance_after'],
            'memo' => $x['memo'] ?? null, 'expires_at' => $x['expires_at'], 'created_at' => $x['created_at'],
        ], Db::rows("SELECT delta, kind, balance_after, memo, expires_at, created_at FROM core_credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT {$limit} OFFSET {$off}", [$uid]));
        // 장부의 '사용' 행은 어느 묶음에서 썼는지 남기지 않는다 → 묶음별 잔액은 못 나눈다. 받은 양(유효분)과 전체 잔액만 보여 준다.
        Response::list($rows, $total, $page, $limit, [
            'staff' => $a->isStaff(),
            'balance' => $sum($alive),
            'month_granted' => $sum("kind = 'grant_month' AND created_at >= DATE_FORMAT(NOW(3), '%Y-%m-01') AND {$alive}"),
            'purchased_alive' => $sum("kind = 'purchase' AND {$alive}"),
            'expiring_30d' => $sum("delta > 0 AND expires_at IS NOT NULL AND expires_at > NOW(3) AND expires_at <= NOW(3) + INTERVAL 30 DAY"),
            'plan_month' => (int) Db::val('SELECT credits_month FROM core_plans WHERE code = ?', [$a->plan]),
        ]);
    }, ['auth' => true]);
    $r->patch('/me', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $in = Response::input();
        $name = isset($in['name']) ? trim((string) $in['name']) : null;
        if ($name !== null && $name !== (string) $u['name']) {
            if (mb_strlen($name) < 1 || mb_strlen($name) > 40) {
                throw HttpError::invalid('이름은 1~40자입니다.');
            }
            // 기획 §8.1·홈박스 규칙: 바꾼 뒤 14일 지나야 다시 바꿀 수 있다(12개월 4회 상한은 이력 표가 생기면).
            $last = $u['name_changed_at'] ? strtotime((string) $u['name_changed_at']) : 0;
            if ($last && $last > time() - 14 * 86400) {
                throw new HttpError('NAME_CHANGE_LIMIT', '이름은 바꾼 뒤 14일이 지나야 다시 바꿀 수 있습니다.', 429, date('Y-m-d', $last + 14 * 86400) . ' 부터 가능');
            }
            Db::exec('UPDATE core_users SET name = ?, name_changed_at = NOW(3) WHERE id = ?', [$name, $u['id']]);
            Audit::log($a, 'user.rename', 'core_users:' . $u['id'], ['name' => $u['name']], ['name' => $name]);
        }
        if (array_key_exists('marketing_opt_in', $in)) {
            Db::exec('UPDATE core_users SET marketing_opt_in = ?, marketing_opt_at = NOW(3) WHERE id = ?', [$in['marketing_opt_in'] ? 1 : 0, $u['id']]);
        }
        if (array_key_exists('birthday', $in)) {
            $b = $in['birthday'];
            if ($b !== null && $b !== '') {
                $d = \DateTime::createFromFormat('Y-m-d', (string) $b);
                if (!$d || $d->format('Y-m-d') !== $b || $d > new \DateTime()) {
                    throw HttpError::invalid('생일은 YYYY-MM-DD 형식의 지난 날짜여야 합니다.');
                }
                Db::exec('UPDATE core_users SET birthday = ? WHERE id = ?', [$b, $u['id']]);
            } else {
                Db::exec('UPDATE core_users SET birthday = NULL WHERE id = ?', [$u['id']]);
            }
        }
        Auth::reset();
        Response::json(Auth::actor()->toArray());
    }, ['auth' => true]);

    // ---- 프로필 사진: multipart 'file' → 정사각 256 JPEG → storage/avatars. GD 만 쓴다(서버에 imagick 없음).
    $r->post('/me/avatar', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $f = $_FILES['file'] ?? null;
        if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
            throw HttpError::invalid('이미지 파일(file)을 보내세요.');
        }
        if ((int) $f['size'] > 5 * 1024 * 1024) {
            throw HttpError::invalid('5MB 이하만 올릴 수 있습니다.');
        }
        $info = @getimagesize((string) $f['tmp_name']);
        if (!$info || $info[0] * $info[1] > 40_000_000) {
            throw HttpError::invalid('이미지로 읽을 수 없거나 너무 큽니다.');
        }
        $src = match ($info[2]) {
            IMAGETYPE_JPEG => imagecreatefromjpeg((string) $f['tmp_name']),
            IMAGETYPE_PNG => imagecreatefrompng((string) $f['tmp_name']),
            IMAGETYPE_WEBP => imagecreatefromwebp((string) $f['tmp_name']),
            IMAGETYPE_GIF => imagecreatefromgif((string) $f['tmp_name']),
            default => null,
        };
        if (!$src) {
            throw HttpError::invalid('JPG·PNG·WEBP·GIF 만 됩니다.');
        }
        [$w, $h] = [imagesx($src), imagesy($src)];
        $side = min($w, $h);
        $dst = imagecreatetruecolor(256, 256);
        $white = imagecolorallocate($dst, 255, 255, 255);
        imagefill($dst, 0, 0, $white);
        imagecopyresampled($dst, $src, 0, 0, intdiv($w - $side, 2), intdiv($h - $side, 2), 256, 256, $side, $side);
        $dir = rtrim((string) Config::get('storage.dir'), '/\\') . '/avatars';
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            throw new HttpError('STORAGE', '저장 폴더를 만들 수 없습니다.', 500);
        }
        $name = $u['public_id'] . '-' . bin2hex(random_bytes(4)) . '.jpg';
        imagejpeg($dst, "$dir/$name", 88);
        imagedestroy($src);
        imagedestroy($dst);
        // 이전 파일 정리(소셜에서 온 외부 URL 은 그대로 둔다)
        if (!empty($u['avatar_url']) && preg_match('#/files/avatars/([A-Za-z0-9-]+\.jpg)$#', (string) $u['avatar_url'], $m) && is_file("$dir/{$m[1]}")) {
            @unlink("$dir/{$m[1]}");
        }
        Db::exec('UPDATE core_users SET avatar_url = ? WHERE id = ?', ['/api/v1/files/avatars/' . $name, $u['id']]);
        Scan::queue("$dir/$name", 'avatar', $name, (int) $u['id']);  // 바이러스 검사 대기열(SEC-011)
        Auth::reset();
        Response::json(Auth::actor()->toArray());
    }, ['auth' => true]);
    $r->delete('/me/avatar', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $dir = rtrim((string) Config::get('storage.dir'), '/\\') . '/avatars';
        if (!empty($u['avatar_url']) && preg_match('#/files/avatars/([A-Za-z0-9-]+\.jpg)$#', (string) $u['avatar_url'], $m) && is_file("$dir/{$m[1]}")) {
            @unlink("$dir/{$m[1]}");
        }
        Db::exec('UPDATE core_users SET avatar_url = NULL WHERE id = ?', [$u['id']]);
        Auth::reset();
        Response::json(Auth::actor()->toArray());
    }, ['auth' => true]);
    // 갤러리로 옮긴 옛 작업물 시안이 부르는 그림·스타일·스크립트(storage/works). HTML 문서는 내주지 않는다 — 시안 본문은 갤러리(can())로만.
    $r->get('/files/works/{path+}', function (array $p): void {
        $rel = str_replace('\\', '/', (string) $p['path']);
        $types = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif', 'svg' => 'image/svg+xml',
            'css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'woff2' => 'font/woff2', 'woff' => 'font/woff', 'ttf' => 'font/ttf', 'mp4' => 'video/mp4'];
        $ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
        if (!isset($types[$ext]) || str_contains($rel, '..') || str_starts_with($rel, '_trash') || !preg_match('#^[\w\-./가-힣 ]+$#u', $rel)) {
            throw HttpError::notFound('파일');
        }
        $base = realpath(rtrim((string) Config::get('storage.dir'), '/\\') . '/works');
        $path = $base ? realpath($base . '/' . $rel) : false;
        if (!$path || !str_starts_with($path, $base . DIRECTORY_SEPARATOR) || !is_file($path)) {
            throw HttpError::notFound('파일');
        }
        header('Content-Type: ' . $types[$ext]);
        header('Cache-Control: public, max-age=604800');
        header('Access-Control-Allow-Origin: *');
        header('Content-Length: ' . (string) filesize($path));
        readfile($path);
        exit;
    });
    // 공개 파일: 프로필 사진만(이름이 곧 토큰 — 추측 불가). 다른 storage 는 can() 을 거치는 별도 라우트로.
    $r->get('/files/avatars/{name}', function (array $p): void {
        $name = (string) $p['name'];
        if (!preg_match('#^[A-Za-z0-9-]+\.jpg$#', $name)) {
            throw HttpError::notFound('파일');
        }
        $path = rtrim((string) Config::get('storage.dir'), '/\\') . '/avatars/' . $name;
        if (!is_file($path)) {
            throw HttpError::notFound('파일');
        }
        header('Content-Type: image/jpeg');
        header('Cache-Control: public, max-age=31536000, immutable');
        header('Content-Length: ' . (string) filesize($path));
        readfile($path);
        exit;
    });
    $r->delete('/me', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        // 실수로 지우지 않게 화면에서 '탈퇴' 를 직접 입력해 보낸다.
        if (trim((string) (Response::input()['confirm'] ?? '')) !== '탈퇴') {
            throw HttpError::invalid('확인 문구가 맞지 않습니다.', "'탈퇴' 를 입력해 주세요.");
        }
        $mailTo = (string) $u['email'];
        $mailName = (string) ($u['name'] ?: '회원');
        // 탈퇴: 개인정보(이메일·이름·사진·로그인 연결) 즉시 익명화, API 키 폐기(§17.1).
        // 콘텐츠(글·댓글·시안·장표 작업)는 지우지 않고 그대로 두며 작성자는 '탈퇴한 사용자'로 보인다 — 소유 행(user id)만 남는다.
        // 결제·청구 기록은 전자상거래법에 따라 5년 보존(core_invoices 그대로).
        // ACC-005: 사용자 행에 남는 개인정보는 전부 이 자리에서 비운다(생일·마케팅 동의·환경설정·알림 메일 설정·이름 변경 시각·차단 사유).
        Db::tx(function () use ($u, $a, $mailTo): void {
            Db::exec(
                "UPDATE core_users SET email = CONCAT('deleted-', id, '@deleted.local'), name = '탈퇴한 사용자', avatar_url = NULL,
                    birthday = NULL, marketing_opt_in = 0, marketing_opt_at = NULL, name_changed_at = NULL, prefs = NULL,
                    notify_mail = NULL, blocked_reason = NULL, last_seen_at = NULL,
                    deleted_at = NOW(3), session_epoch = session_epoch + 1 WHERE id = ?",
                [$u['id']]
            );
            // 연결된 로그인(구글·네이버·카카오 식별자와 그 이메일) — 행째 지운다.
            Db::exec('DELETE FROM core_user_logins WHERE user_id = ?', [$u['id']]);
            // API 키: 폐기 + 다시 보기용 암호문·허용 IP 비움(검증은 해시라 폐기만으로 막히지만 원문 복원 수단도 없앤다).
            Db::exec('UPDATE core_api_keys SET revoked_at = COALESCE(revoked_at, NOW(3)), key_enc = NULL, ip_allow = NULL WHERE user_id = ?', [$u['id']]);
            // 인증 코드·알림·동의 기록(이 사람을 다시 식별할 수 있는 것).
            Db::exec('DELETE FROM core_otp_codes WHERE email = ?', [$mailTo]);
            Db::exec('DELETE FROM core_notifications WHERE user_id = ?', [$u['id']]);
            Db::exec('DELETE FROM core_consents WHERE user_id = ?', [$u['id']]);
            // 검색 기록은 사람과의 연결만 끊는다(검색어 통계는 남김).
            Db::exec('UPDATE asset_search_logs SET user_id = NULL WHERE user_id = ?', [$u['id']]);
            // 결제·청구(core_invoices·core_subscriptions)는 전자상거래법 5년 보존이라 손대지 않는다.
            Audit::log($a, 'user.delete', 'core_users:' . $u['id']);
        });
        MailTemplate::deliver('withdraw', $mailTo, ['name' => $mailName, 'date' => date('Y-m-d')]);
        Session::logout();
        Response::noContent();
    }, ['auth' => true]);

    // ---- API·MCP 키
    $r->get('/keys', function (array $p, Actor $a): void {
        Response::json(Keys::listFor((int) $a->id()));
    }, ['auth' => true]);
    $r->post('/keys', function (array $p, Actor $a): void {
        $in = Response::input();
        $max = Access::limit($a, 'api_keys', 1);
        $active = (int) Db::val('SELECT COUNT(*) FROM core_api_keys WHERE user_id = ? AND revoked_at IS NULL', [$a->id()]);
        if ($max >= 0 && $active >= $max) {
            throw HttpError::paymentRequired("현재 플랜의 키 수 한도 {$max}개");
        }
        [$row, $raw] = Keys::issue((int) $a->id(), (string) ($in['name'] ?? '기본 키'), (array) ($in['scopes'] ?? ['all']));
        Audit::log($a, 'key.issue', 'core_api_keys:' . $row['id']);
        Response::json($row + ['key' => $raw], 201);
    }, ['auth' => true]);
    $r->get('/keys/{id}/reveal', function (array $p, Actor $a): void {
        $row = Db::row('SELECT * FROM core_api_keys WHERE public_id = ? AND user_id = ? AND revoked_at IS NULL', [$p['id'], $a->id()]);
        if (!$row) {
            throw HttpError::notFound('키');
        }
        Response::json(['key' => Keys::reveal($row)]);
    }, ['auth' => true]);
    $r->delete('/keys/{id}', function (array $p, Actor $a): void {
        if (!Keys::revoke((int) $a->id(), $p['id'])) {
            throw HttpError::notFound('키');
        }
        Audit::log($a, 'key.revoke', 'core_api_keys:' . $p['id']);
        Response::noContent();
    }, ['auth' => true]);
    $r->get('/keys/{id}/usage', function (array $p, Actor $a): void {
        $row = Db::row('SELECT id FROM core_api_keys WHERE public_id = ? AND user_id = ?', [$p['id'], $a->id()]);
        if (!$row) {
            throw HttpError::notFound('키');
        }
        Response::json(Db::rows('SELECT day, tool, calls FROM core_api_usage WHERE api_key_id = ? AND day >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ORDER BY day DESC, tool', [$row['id']]));
    }, ['auth' => true]);

    // ---- powerMCP 키 검증(§10): MCP 가 받은 키를 그대로 Bearer 로 넘기면 Auth 미들웨어가 키 소유자 Actor 를 만든다.
    //      여기서는 키 경유인지·scope 가 맞는지 보고 일 한도 검사 + core_api_usage 1 증가(도구 이름별). 서버 간 비밀이 필요 없다.
    $r->post('/keys/verify', function (array $p, Actor $a): void {
        if ($a->via !== 'key' || $a->key === null) {
            throw HttpError::unauthorized('API·MCP 키(pp_live_…)로 불러야 합니다.');
        }
        $in = Response::input();
        $tool = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', (string) ($in['tool'] ?? 'mcp'));
        $scope = (string) ($in['scope'] ?? 'all');
        if (in_array($scope, Keys::SCOPES, true) && $scope !== 'all' && !Keys::allows($a, $scope)) {
            throw HttpError::forbiddenScope($scope);
        }
        Keys::hit($a, $tool !== '' ? $tool : 'mcp', true);
        Response::json([
            'plan' => $a->plan,
            'kind' => $a->kind,
            'roles' => $a->roles,
            'key' => ['id' => $a->key['public_id'] ?? null, 'scopes' => $a->key['scopes'] ?? ['all']],
            'limit' => Access::limit($a, 'api_daily', 0),
            'quota' => Keys::quota($a),
        ]);
    });

    // ---- 플랜 목록(결제 플래그 꺼져 있으면 superadmin 만)
    $r->get('/plans', function (array $p, Actor $a): void {
        $visible = (bool) Config::get('features.billing_visible', false) || $a->hasRole('superadmin');
        if (!$visible) {
            throw HttpError::notFound('요금제');
        }
        $rows = Db::rows('SELECT code, name, price_month_krw, price_year_krw, limits, sort FROM core_plans WHERE is_public = 1 ORDER BY sort');
        foreach ($rows as &$row) {
            $row['limits'] = json_decode((string) $row['limits'], true);
        }
        Response::json($rows, 200, [], true);
    });

};
