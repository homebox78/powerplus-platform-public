<?php
/**
 * 최소 오토로더 + 시간대.
 * 출처: homebox-handoff api/src/bootstrap.php (네임스페이스 Homebox → Pp)
 */
declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'Pp\\')) {
        return;
    }
    $rel = str_replace('\\', '/', substr($class, 3));
    $file = __DIR__ . '/' . $rel . '.php';
    if (is_file($file)) {
        require $file;
    }
});

date_default_timezone_set('Asia/Seoul');
