<?php
/**
 * 임시 테스트 계정 만들기·지우기(서버 CLI 전용) — TestLogin 참고.
 *   만들기: TEST_PASS=… php8.4 api/bin/test-account.php create <아이디> [일수=15]
 *   지우기: php8.4 api/bin/test-account.php remove
 *   상태:   php8.4 api/bin/test-account.php status
 *   로그인 칸 보이기·숨기기: php8.4 api/bin/test-account.php show | hide  (만들 때 보이고, 지우면 숨는다. 숨기면 로그인도 막힌다)
 * 테스트 계정 세션은 읽기 전용이고 다른 회원 정보는 가려 보인다(Core/TestLogin::guard).
 * 비밀번호는 환경 변수로만 받고 해시로만 저장한다(원문은 어디에도 남기지 않는다).
 * 계정은 임직원(staff) + admin 역할 + 필수 동의 — 관리자 화면까지 열린다. superadmin 은 코드 고정이라 주지 않는다.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Audit;
use Pp\Core\Consents;
use Pp\Core\Db;
use Pp\Core\Ids;

const TEST_EMAIL = 'test-account@test.powerplus.local';

$cmd = $argv[1] ?? 'status';
$set = static function (string $k, string $v): void {
    Db::exec('INSERT INTO core_settings (k, v, is_secret) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE v = VALUES(v)', [$k, $v]);
};

if ($cmd === 'create') {
    $user = trim((string) ($argv[2] ?? ''));
    $days = max(1, min(30, (int) ($argv[3] ?? 15)));
    $pass = (string) getenv('TEST_PASS');
    if ($user === '' || $pass === '') {
        fwrite(STDERR, "아이디(인자)와 TEST_PASS(환경 변수)가 필요합니다.\n");
        exit(1);
    }
    $uid = (int) Db::val('SELECT id FROM core_users WHERE email = ?', [TEST_EMAIL]);
    if (!$uid) {
        Db::exec("INSERT INTO core_users (public_id, email, name, kind) VALUES (?, ?, '테스트 계정', 'staff')", [Ids::publicId(), TEST_EMAIL]);
        $uid = (int) Db::val('SELECT id FROM core_users WHERE email = ?', [TEST_EMAIL]);
    }
    Db::exec("UPDATE core_users SET kind = 'staff', status = 'active', deleted_at = NULL, session_epoch = session_epoch + 1 WHERE id = ?", [$uid]);
    Db::exec("INSERT IGNORE INTO core_user_roles (user_id, role) VALUES (?, 'admin')", [$uid]);
    foreach (['age14', 'terms', 'privacy', 'overseas'] as $k) {
        Db::exec('INSERT INTO core_consents (user_id, kind, version, agreed) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE agreed = 1', [$uid, $k, Consents::version()]);
    }
    $until = date('Y-m-d H:i:s', time() + $days * 86400);
    $set('auth.test.user', $user);
    $set('auth.test.hash', password_hash($pass, PASSWORD_DEFAULT));
    $set('auth.test.until', $until);
    $set('auth.test.user_id', (string) $uid);
    $set('auth.test.fail', '0');
    $set('auth.test.show_login', '1');
    Audit::log(null, 'auth.test_account.create', 'core_users:' . $uid, null, ['until' => $until]);
    echo "만들었습니다 — user_id {$uid}, 만료 {$until}\n";
    exit(0);
}

// 거울: 샘플 계정의 시안·갤러리·장표 작업을 테스트 계정 목록에 보이게(읽기 전용). 이메일은 인자로만 받아 설정에 둔다.
//   php8.4 api/bin/test-account.php mirror a@x.com,b@y.com   (빈 값이면 해제)
if ($cmd === 'mirror') {
    $list = strtolower(trim((string) ($argv[2] ?? '')));
    $set('auth.test.mirror', $list);
    $n = $list === '' ? 0 : count(array_filter(explode(',', $list)));
    Audit::log(null, 'auth.test_account.mirror', 'core_settings:auth.test.mirror', null, ['count' => $n]);
    echo $n ? "거울 계정 {$n}개를 연결했습니다.\n" : "거울 연결을 해제했습니다.\n";
    exit(0);
}

// 로그인 화면의 테스트 로그인 칸 보이기·숨기기(보고할 때만 켠다)
if ($cmd === 'show' || $cmd === 'hide') {
    $set('auth.test.show_login', $cmd === 'show' ? '1' : '0');
    Audit::log(null, 'auth.test_account.' . $cmd, 'core_settings:auth.test.show_login');
    echo $cmd === 'show' ? "로그인 화면에 테스트 로그인 칸을 보입니다.\n" : "테스트 로그인 칸을 숨겼습니다(로그인도 막힘).\n";
    exit(0);
}

if ($cmd === 'remove') {
    $uid = (int) Db::val('SELECT id FROM core_users WHERE email = ?', [TEST_EMAIL]);
    Db::exec("DELETE FROM core_settings WHERE k LIKE 'auth.test.%'");
    if ($uid) {
        // 작업물이 남아 있으면 지울 수 없는 표가 있을 수 있어 막고 익명화만 한다
        try {
            Db::exec('DELETE FROM core_users WHERE id = ?', [$uid]);
            echo "계정·설정을 지웠습니다(user_id {$uid}).\n";
        } catch (\Throwable $e) {
            Db::exec("UPDATE core_users SET status = 'blocked', deleted_at = NOW(3), session_epoch = session_epoch + 1 WHERE id = ?", [$uid]);
            Db::exec("DELETE FROM core_user_roles WHERE user_id = ?", [$uid]);
            echo "설정을 지우고 계정은 막았습니다(남은 작업물 때문에 행 삭제 불가: " . $e->getMessage() . ").\n";
        }
        Audit::log(null, 'auth.test_account.remove', 'core_users:' . $uid);
    } else {
        echo "테스트 계정이 없습니다. 설정만 지웠습니다.\n";
    }
    exit(0);
}

$rows = Db::rows("SELECT k, v FROM core_settings WHERE k IN ('auth.test.user','auth.test.until','auth.test.user_id','auth.test.fail','auth.test.show_login')");
foreach ($rows as $r) {
    echo $r['k'] . ' = ' . $r['v'] . "\n";
}
if (!$rows) {
    echo "테스트 계정 없음\n";
}
