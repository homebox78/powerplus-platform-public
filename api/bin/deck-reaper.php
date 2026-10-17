<?php
/**
 * 멈춘 장표 작업 정리(서버 CLI 전용, 2026-10-17) — Deck\Jobs::reap 을 엔진 요청과 상관없이 돌린다.
 * 예전엔 엔진이 다음 작업을 가지러 올 때(claim)만 정리해서, 엔진이 꺼지면 취소 요청·끊긴 작업이 그대로 '진행 중'에 남았다.
 *   미리보기: 없음(정리 규칙은 Jobs::reap 머리 주석) — 결과 건수만 찍는다
 *   실행:     php8.4 /var/www/platform/api/bin/deck-reaper.php
 * 크론(5분마다, www-data) — scripts/deploy.sh 가 등록한다. 크론식은 별표·슬래시 5 라 PHP 주석에 그대로 적지 않는다.
 * 웹에서는 실행되지 않는다(CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Deck\Jobs;

try {
    $r = Jobs::reap();
    if (array_sum($r) > 0) {
        echo date('Y-m-d H:i:s') . " 취소 {$r['canceled']} · 대기열로 {$r['requeued']} · 실패 처리 {$r['failed']} · 엔진 꺼짐 안내 {$r['engine_down']}\n";
    }
} catch (\Throwable $e) {
    fwrite(STDERR, '[deck-reaper] ' . $e->getMessage() . "\n");
    exit(1);
}
