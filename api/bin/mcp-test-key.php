<?php
/**
 * MCP 반복 시험용 임시 키(서버 CLI 전용) — 운영 powerMCP 를 실제로 불러 보는 시험(docs/MCP-반복시험-*).
 *   발급: php8.4 api/bin/mcp-test-key.php issue <키 저장 파일>   (원문은 화면에 찍지 않고 그 파일에만, 권한 600)
 *   폐기: php8.4 api/bin/mcp-test-key.php revoke <키 저장 파일>  (그 키만. 살아 있는 시험 키가 없으면 시안도 관리자에게 옮긴다)
 *         php8.4 api/bin/mcp-test-key.php revoke --all          (시험 계정 키 전부 — 동시에 도는 다른 세션 시험도 끊긴다)
 * 계정은 임직원(staff) 시험 계정 하나 — 관리자 역할은 주지 않는다. 시험이 만든 시안·갤러리는 transfer·revoke 때 관리자 계정으로 옮긴다(MC-35).
 *   그 밖: issue-owner·revoke-owner(관리자 mock 임시 키), lend·lend-any·unlend(시안 잠깐 빌려 고치기).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Consents;
use Pp\Core\Db;
use Pp\Core\Ids;
use Pp\Core\Keys;

const MCP_TEST_EMAIL = 'mcp-loop@test.powerplus.local';

$cmd = $argv[1] ?? '';
$uid = (int) Db::val('SELECT id FROM core_users WHERE email = ?', [MCP_TEST_EMAIL]);

if ($cmd === 'issue') {
    $out = (string) ($argv[2] ?? '');
    if ($out === '') {
        fwrite(STDERR, "키 저장 파일 경로가 필요합니다.\n");
        exit(1);
    }
    if (!$uid) {
        Db::exec("INSERT INTO core_users (public_id, email, name, kind) VALUES (?, ?, 'MCP 시험', 'staff')", [Ids::publicId(), MCP_TEST_EMAIL]);
        $uid = (int) Db::val('SELECT id FROM core_users WHERE email = ?', [MCP_TEST_EMAIL]);
    }
    Db::exec("UPDATE core_users SET kind = 'staff', status = 'active', deleted_at = NULL WHERE id = ?", [$uid]);
    foreach (['age14', 'terms', 'privacy', 'overseas'] as $k) {
        Db::exec('INSERT INTO core_consents (user_id, kind, version, agreed) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE agreed = 1', [$uid, $k, Consents::version()]);
    }
    [$pub, $raw] = Keys::issue($uid, 'mcp-loop-test', ['all']);
    file_put_contents($out, $raw);
    chmod($out, 0600);
    echo "발급: {$pub['masked']}\n";
    exit(0);
}
/**
 * 시험이 만든 시안·갤러리 보관본을 관리자 계정(config admin.owner_email, 없으면 superadmin 역할 첫 계정)으로 옮긴다.
 * 시험 계정에 남으면 사용자 '내 시안'에 안 보인다(2026-10-12·10-15 사용자 "테스트한 것들은 내 시안에 다 올라가 있어야").
 * 테스트 로그인 계정은 auth.test.mirror 로 그 관리자 시안을 함께 본다.
 */
$transfer = static function (int $from): array {
    $to = 0;
    $em = (string) \Pp\Core\Config::get('admin.owner_email', '');
    if ($em !== '') {
        $to = (int) Db::val('SELECT id FROM core_users WHERE LOWER(email) = LOWER(?)', [$em]);
    }
    if (!$to) {
        $to = (int) Db::val("SELECT u.id FROM core_users u JOIN core_user_roles r ON r.user_id = u.id WHERE r.role = 'superadmin' ORDER BY u.id LIMIT 1");
    }
    if (!$from || !$to || $from === $to) {
        return [0, 0, $to];
    }
    // 시험이 만든 통과 시안은 갤러리 공개(shared)까지 — 학습 보관(study)으로 두면 '공개 시안'에 안 보였다
    // (2026-10-18 사용자 "mcp 테스트해서 제작한 결과물은 모두 게시 공개 시안에 다 볼 수 있게"). 숨김(hidden)은 그대로 둔다.
    $gids = array_map('intval', array_column(Db::rows("SELECT id FROM mock_gallery WHERE owner_user_id = ? AND status = 'study'", [$from]), 'id'));
    $m = Db::exec('UPDATE mock_mockups SET owner_user_id = ? WHERE owner_user_id = ?', [$to, $from]);
    $g = Db::exec('UPDATE mock_gallery SET owner_user_id = ? WHERE owner_user_id = ?', [$to, $from]);
    if ($gids) {
        Db::exec("UPDATE mock_gallery SET status = 'shared' WHERE status = 'study' AND id IN (" . implode(',', $gids) . ')');
    }
    return [$m, $g, $to];
};
// 관리자 계정 소유 시안을 일괄 고칠 때(2026-10-15 "만들어진 모든 목업에 같이 반영") — 관리자 계정에 mock 범위만 쓰는 임시 키.
// 원문은 화면에 찍지 않고 파일에만(권한 600). 다 고치면 revoke-owner 로 폐기.
if ($cmd === 'issue-owner' || $cmd === 'revoke-owner') {
    [, , $owner] = $transfer(0);
    if (!$owner) {
        fwrite(STDERR, "관리자 계정을 찾지 못했습니다.\n");
        exit(1);
    }
    if ($cmd === 'revoke-owner') {
        $n = Db::exec("UPDATE core_api_keys SET revoked_at = NOW(3) WHERE user_id = ? AND name = 'mock-repair-temp' AND revoked_at IS NULL", [$owner]);
        echo "폐기: {$n}개\n";
        exit(0);
    }
    $out = (string) ($argv[2] ?? '');
    if ($out === '') {
        fwrite(STDERR, "키 저장 파일 경로가 필요합니다.\n");
        exit(1);
    }
    [$pub, $raw] = Keys::issue($owner, 'mock-repair-temp', ['mock']);
    file_put_contents($out, $raw);
    chmod($out, 0600);
    echo "발급(관리자 {$owner}, mock 범위): {$pub['masked']}\n";
    exit(0);
}
// 관리자 시안을 시험 계정에 잠깐 빌려준다(관리자 플랜 일 한도 100건으로는 87장 일괄 수정이 막혀서, 2026-10-15 사용자 선택).
// 목록 파일 = 한 줄에 token 하나. 다 고치면 transfer(또는 revoke)로 관리자에게 되돌린다.
if ($cmd === 'lend') {
    [, , $owner] = $transfer(0);
    $file = (string) ($argv[2] ?? '');
    $tokens = $file !== '' && is_file($file) ? array_values(array_filter(array_map('trim', file($file) ?: []))) : [];
    if (!$owner || !$uid || !$tokens) {
        fwrite(STDERR, "사용: lend <token 목록 파일>\n");
        exit(1);
    }
    $m = 0;
    $g = 0;
    foreach (array_chunk($tokens, 200) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        $m += Db::exec("UPDATE mock_mockups SET owner_user_id = ? WHERE owner_user_id = ? AND token IN ({$ph})", array_merge([$uid, $owner], $chunk));
        $g += Db::exec("UPDATE mock_gallery g JOIN mock_mockups m ON m.id = g.mockup_id SET g.owner_user_id = ? WHERE g.owner_user_id = ? AND m.token IN ({$ph})", array_merge([$uid, $owner], $chunk));
    }
    echo "빌려줌: 시안 {$m}건 · 갤러리 {$g}건 → 시험 계정 {$uid}\n";
    exit(0);
}
// 소유자가 여러 명인 시안을 잠깐 빌려 고칠 때(2026-10-15 동료 계정의 '제목 없는 시안' 개선) — 원래 소유자를 지도 파일에 남기고 unlend 로 그대로 되돌린다.
//   lend-any <token 목록 파일> <지도 파일>   /   unlend <지도 파일>
if ($cmd === 'lend-any') {
    $file = (string) ($argv[2] ?? '');
    $mapf = (string) ($argv[3] ?? '');
    $tokens = $file !== '' && is_file($file) ? array_values(array_filter(array_map('trim', file($file) ?: []))) : [];
    if (!$uid || !$tokens || $mapf === '') {
        fwrite(STDERR, "사용: lend-any <token 목록 파일> <지도 파일>\n");
        exit(1);
    }
    $map = [];
    foreach ($tokens as $t) {
        $o = (int) Db::val('SELECT owner_user_id FROM mock_mockups WHERE token = ? AND deleted_at IS NULL', [$t]);
        if (!$o || $o === $uid) {
            continue;
        }
        $map[$t] = $o;
        Db::exec('UPDATE mock_mockups SET owner_user_id = ? WHERE token = ?', [$uid, $t]);
        Db::exec('UPDATE mock_gallery g JOIN mock_mockups m ON m.id = g.mockup_id SET g.owner_user_id = ? WHERE m.token = ?', [$uid, $t]);
    }
    file_put_contents($mapf, json_encode($map));
    echo '빌려줌: ' . count($map) . "건 → 시험 계정 {$uid}\n";
    exit(0);
}
if ($cmd === 'unlend') {
    $map = json_decode((string) @file_get_contents((string) ($argv[2] ?? '')), true);
    if (!is_array($map)) {
        fwrite(STDERR, "사용: unlend <지도 파일>\n");
        exit(1);
    }
    $n = 0;
    foreach ($map as $t => $o) {
        $n += Db::exec('UPDATE mock_mockups SET owner_user_id = ? WHERE token = ? AND owner_user_id = ?', [(int) $o, (string) $t, $uid]);
        Db::exec('UPDATE mock_gallery g JOIN mock_mockups m ON m.id = g.mockup_id SET g.owner_user_id = ? WHERE m.token = ?', [(int) $o, (string) $t]);
    }
    echo "되돌림: {$n}건\n";
    exit(0);
}
if ($cmd === 'transfer') {
    [$m, $g, $to] = $transfer($uid);
    echo "옮김: 시안 {$m}건 · 갤러리 {$g}건 → 계정 {$to}\n";
    exit(0);
}
// 폐기 = 내 키 파일 하나만(2026-10-18: 인자 없는 revoke 가 시험 계정 키를 전부 폐기해, 동시에 돌던 다른 세션 시험 10건이 13:12 에 한꺼번에 UNAUTHORIZED).
// 시안 옮기기는 살아 있는 시험 키가 더 없을 때만 — 시험 중인 다른 세션의 시안 주인이 바뀌면 그 세션의 edits·게시가 막힌다.
// 전부 폐기는 revoke --all 로만.
if ($cmd === 'revoke') {
    $arg = (string) ($argv[2] ?? '');
    if ($arg === '') {
        fwrite(STDERR, "사용: revoke <키 파일>(그 키만) | revoke --all(시험 계정 키 전부 — 다른 세션 시험도 끊긴다)\n");
        exit(1);
    }
    if ($arg === '--all') {
        $n = $uid ? Db::exec('UPDATE core_api_keys SET revoked_at = NOW(3) WHERE user_id = ? AND revoked_at IS NULL', [$uid]) : 0;
    } else {
        $raw = is_file($arg) ? trim((string) file_get_contents($arg)) : '';
        if ($raw === '') {
            fwrite(STDERR, "키 파일을 읽지 못했습니다: {$arg}\n");
            exit(1);
        }
        $n = $uid ? Db::exec('UPDATE core_api_keys SET revoked_at = NOW(3) WHERE user_id = ? AND key_hash = ? AND revoked_at IS NULL', [$uid, hash('sha256', $raw)]) : 0;
    }
    $live = $uid ? (int) Db::val('SELECT COUNT(*) FROM core_api_keys WHERE user_id = ? AND revoked_at IS NULL', [$uid]) : 0;
    if ($live > 0) {
        echo "폐기: {$n}개 · 살아 있는 시험 키 {$live}개(다른 세션 시험 중) — 시안 옮기기는 마지막 폐기 때 한다\n";
        exit(0);
    }
    [$m, $g, $to] = $transfer($uid);
    echo "폐기: {$n}개\n옮김: 시안 {$m}건 · 갤러리 {$g}건 → 계정 {$to}\n";
    exit(0);
}
fwrite(STDERR, "사용: issue <파일> | transfer | revoke <키 파일>|--all(옮긴 뒤 폐기)\n");
exit(1);
