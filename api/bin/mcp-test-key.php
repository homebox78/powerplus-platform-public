<?php
/**
 * MCP 반복 시험용 임시 키(서버 CLI 전용) — 운영 powerMCP 를 실제로 불러 보는 시험(docs/MCP-반복시험-*).
 *   발급: php8.4 api/bin/mcp-test-key.php issue <키 저장 파일>   (원문은 화면에 찍지 않고 그 파일에만, 권한 600)
 *   폐기: php8.4 api/bin/mcp-test-key.php revoke                (이 시험 계정 키 전부 폐기)
 * 계정은 임직원(staff) 시험 계정 하나 — 관리자 역할은 주지 않는다. 시험이 만든 시안·보고서는 이 계정 소유로 남는다.
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
if ($cmd === 'revoke') {
    $n = $uid ? Db::exec('UPDATE core_api_keys SET revoked_at = NOW(3) WHERE user_id = ? AND revoked_at IS NULL', [$uid]) : 0;
    echo "폐기: {$n}개\n";
    exit(0);
}
fwrite(STDERR, "사용: issue <파일> | revoke\n");
exit(1);
