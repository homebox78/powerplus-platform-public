<?php
declare(strict_types=1);
/**
 * 배포 전 검사 — apps/web/app/routes.ts 의 화면 경로가 api/src/Core/SpaRoutes.php PATTERNS 에 다 있는지.
 * 빠지면 그 화면이 운영에서 404 상태로 나간다(화면은 그려지지만 검색엔진·공유 미리보기가 없는 주소로 본다). 2026-10-17 spa.php 도입.
 * 사용: php scripts/preflight/spa-routes.php [routes.ts 경로]  — 빠진 것이 있으면 종료 코드 1, 남는 것(routes.ts 에서 지운 것)은 알림만.
 */
$root = dirname(__DIR__, 2);
$ts = $argv[1] ?? $root . '/apps/web/app/routes.ts';
$src = @file_get_contents($ts);
if ($src === false) {
    fwrite(STDERR, "routes.ts 를 읽지 못함: {$ts}\n");
    exit(1);
}
require $root . '/api/src/Core/SpaRoutes.php';

// 주석 줄은 뺀다(// route("x") 같은 예시가 경로로 잡히지 않게)
$src = (string) preg_replace('#^\s*//.*$#m', '', $src);
preg_match_all('#\b(?:route)\(\s*"([^"]*)"#', $src, $m);
$paths = $m[1];
if (preg_match('#\bindex\(#', $src)) {
    $paths[] = '';
}
$paths = array_values(array_unique(array_filter($paths, static fn (string $p): bool => $p !== '*')));
if (count($paths) < 10) {
    fwrite(STDERR, "routes.ts 에서 경로를 " . count($paths) . "개만 찾음 — 형식이 바뀌었나? 이 검사를 고칠 것\n");
    exit(1);
}
$have = \Pp\Core\SpaRoutes::PATTERNS;
$missing = array_diff($paths, $have);
$extra = array_diff($have, $paths);
foreach ($extra as $p) {
    echo "ℹ️  SpaRoutes 에만 있는 경로(routes.ts 에서 지웠으면 같이 지울 것): '{$p}'\n";
}
if ($missing) {
    foreach ($missing as $p) {
        echo "❌ routes.ts 경로 '{$p}' 가 api/src/Core/SpaRoutes.php PATTERNS 에 없다 — 운영에서 404 로 나간다\n";
    }
    exit(1);
}
echo 'SPA 경로 ' . count($paths) . "개 일치\n";
