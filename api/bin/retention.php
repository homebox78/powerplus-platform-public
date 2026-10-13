<?php
/**
 * 보유 기간 정리(서버 CLI 전용, OPS-008) — 개인정보처리방침 "3. 보유 기간"과 같은 기준으로 오래된 기록을 지우거나 비운다.
 *   미리보기: php8.4 /var/www/platform/api/bin/retention.php --dry
 *   실행:     php8.4 /var/www/platform/api/bin/retention.php
 * 크론(하루 한 번 새벽 4시 10분, www-data) 설치 예:
 *   ( sudo crontab -u www-data -l 2>/dev/null; echo '10 4 * * * php8.4 /var/www/platform/api/bin/retention.php >> /var/www/platform_data/retention.log 2>&1' ) | sudo crontab -u www-data -
 *
 * 기준(방침: 접속 기록 3개월, 관리자 처리 기록 2년, 탈퇴 즉시 익명화 — 탈퇴 익명화는 DELETE /me 가 그 자리에서 한다):
 *   - 검색 기록(asset_search_logs): 3개월 지나면 누가 검색했는지(user_id)를 비우고, 1년 지나면 행을 지운다(검색 품질 통계는 30일 기준).
 *   - 키 사용량(core_api_usage): 1년 지난 날짜 행을 지운다.
 *   - 문의·동의 IP(core_contacts.ip·core_consents.ip): 3개월 지나면 비운다(동의 기록 자체는 남긴다 — 동의 증빙).
 *   - 로그인 인증 코드(core_otp_codes): 만료 1일 뒤 지운다.
 *   - 알림(core_notifications): 읽은 지 180일, 안 읽어도 1년 지나면 지운다.
 *   - AI 판단 캐시(core_decisions)·처리된 내부 이벤트(core_events): 90일 지나면 지운다.
 *   - 만료된 보고서(core_reports): 만료·삭제 뒤 30일 지나면 행을 지운다.
 *   - 감사 기록(core_audit): 2년 지나면 지운다.
 *   - 결제·청구(core_invoices·core_subscriptions·core_billing_events)는 전자상거래법 5년 보존이라 건드리지 않는다.
 *   - 서버 자원 표본(core_server_metrics)은 sample-metrics.php 가 30일로 이미 지운다.
 * 웹에서는 실행되지 않는다(CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;

$dry = in_array('--dry', $argv, true);

/** [이름, 세는 SQL, 실행 SQL] — 세는 SQL 은 실행 SQL 과 같은 조건이어야 한다. */
$jobs = [
    ['검색 기록 사용자 비우기(3개월)',
        'SELECT COUNT(*) FROM asset_search_logs WHERE user_id IS NOT NULL AND created_at < NOW() - INTERVAL 3 MONTH',
        'UPDATE asset_search_logs SET user_id = NULL WHERE user_id IS NOT NULL AND created_at < NOW() - INTERVAL 3 MONTH'],
    ['검색 기록 지우기(1년)',
        'SELECT COUNT(*) FROM asset_search_logs WHERE created_at < NOW() - INTERVAL 1 YEAR',
        'DELETE FROM asset_search_logs WHERE created_at < NOW() - INTERVAL 1 YEAR'],
    ['키 사용량 지우기(1년)',
        'SELECT COUNT(*) FROM core_api_usage WHERE day < CURDATE() - INTERVAL 1 YEAR',
        'DELETE FROM core_api_usage WHERE day < CURDATE() - INTERVAL 1 YEAR'],
    ['문의 IP 비우기(3개월)',
        'SELECT COUNT(*) FROM core_contacts WHERE ip IS NOT NULL AND created_at < NOW() - INTERVAL 3 MONTH',
        'UPDATE core_contacts SET ip = NULL WHERE ip IS NOT NULL AND created_at < NOW() - INTERVAL 3 MONTH'],
    ['동의 IP 비우기(3개월)',
        'SELECT COUNT(*) FROM core_consents WHERE ip IS NOT NULL AND agreed_at < NOW() - INTERVAL 3 MONTH',
        'UPDATE core_consents SET ip = NULL WHERE ip IS NOT NULL AND agreed_at < NOW() - INTERVAL 3 MONTH'],
    ['인증 코드 지우기(만료 1일)',
        'SELECT COUNT(*) FROM core_otp_codes WHERE expires_at < NOW() - INTERVAL 1 DAY',
        'DELETE FROM core_otp_codes WHERE expires_at < NOW() - INTERVAL 1 DAY'],
    ['알림 지우기(읽고 180일·전체 1년)',
        'SELECT COUNT(*) FROM core_notifications WHERE (read_at IS NOT NULL AND read_at < NOW() - INTERVAL 180 DAY) OR created_at < NOW() - INTERVAL 1 YEAR',
        'DELETE FROM core_notifications WHERE (read_at IS NOT NULL AND read_at < NOW() - INTERVAL 180 DAY) OR created_at < NOW() - INTERVAL 1 YEAR'],
    ['AI 판단 캐시 지우기(90일)',
        'SELECT COUNT(*) FROM core_decisions WHERE created_at < NOW() - INTERVAL 90 DAY',
        'DELETE FROM core_decisions WHERE created_at < NOW() - INTERVAL 90 DAY'],
    ['처리된 이벤트 지우기(90일)',
        'SELECT COUNT(*) FROM core_events WHERE processed_at IS NOT NULL AND processed_at < NOW() - INTERVAL 90 DAY',
        'DELETE FROM core_events WHERE processed_at IS NOT NULL AND processed_at < NOW() - INTERVAL 90 DAY'],
    ['만료된 보고서 지우기(30일)',
        'SELECT COUNT(*) FROM core_reports WHERE (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL 30 DAY) OR (deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL 30 DAY)',
        'DELETE FROM core_reports WHERE (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL 30 DAY) OR (deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL 30 DAY)'],
    ['감사 기록 지우기(2년)',
        'SELECT COUNT(*) FROM core_audit WHERE created_at < NOW() - INTERVAL 2 YEAR',
        'DELETE FROM core_audit WHERE created_at < NOW() - INTERVAL 2 YEAR'],
];

$total = 0;
$failed = 0;
echo date('Y-m-d H:i:s') . ($dry ? ' 보유 기간 정리 미리보기(--dry, 바꾸지 않음)' : ' 보유 기간 정리') . PHP_EOL;
foreach ($jobs as [$name, $countSql, $runSql]) {
    try {
        $n = (int) Db::val($countSql);
        if (!$dry && $n > 0) {
            $n = Db::exec($runSql);
        }
        $total += $n;
        printf("  %-28s %s건%s\n", $name, number_format($n), $dry ? ' (예정)' : '');
    } catch (\Throwable $e) {
        $failed++;
        // 표가 없는 환경(일부 마이그레이션 전)에서도 나머지는 계속 돈다.
        printf("  %-28s 건너뜀: %s\n", $name, mb_substr($e->getMessage(), 0, 120));
    }
}
printf("합계 %s건%s\n", number_format($total), $failed ? " · 건너뜀 {$failed}개" : '');
exit($failed > 0 ? 1 : 0);
