<?php
declare(strict_types=1);

// 최소 오토로더 (Composer 없이) — Homebox\Http\Router → src/Http/Router.php
spl_autoload_register(static function (string $class): void {
    $prefix = 'Homebox\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

require_once __DIR__ . '/Config.php';

header('X-Content-Type-Options: nosniff');
mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Seoul');
