<?php
/**
 * 레퍼런스 엔진 단위 시험대 — Plan::planHintSigned(MC-131), homebox_wire_query(MC-133). 실제 파일을 읽고 DB 는 쓰지 않는다.
 *   php mockref-units.php '<json>' → 표준 출력에 결과 JSON
 */
declare(strict_types=1);

$root = dirname(__DIR__, 4) . '/services/mockref-api';
require $root . '/src/Plan.php';
// replica.php 맨 위 라우트 등록만 받아넘긴다 — 함수 선언이 필요할 뿐이다
$router = new class {
    public function __call(string $m, array $a): void
    {
    }
};
require $root . '/routes/replica.php';

$c = json_decode($argv[1] ?? '{}', true, 16, JSON_THROW_ON_ERROR);
if ($c['fn'] === 'plan') {
    echo json_encode(['ok' => \Homebox\Plan::planHintSigned($c['hint'], $c['sig'], (int) $c['ts'], $c['secret'], (int) $c['now'])]);
} else {
    $_GET = $c['get'];
    echo json_encode(['json' => homebox_wire_query()]);
}
