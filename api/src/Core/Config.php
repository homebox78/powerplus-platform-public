<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * api/config.php(git 제외) 읽기. 점 표기 'db.dsn'. 환경변수(대문자·점→_)가 있으면 우선.
 * 출처: homebox-handoff api/src/Config.php + powerPlus Config::get 의 환경변수 우선 규칙
 */
final class Config
{
    private static ?array $cfg = null;

    public static function all(): array
    {
        if (self::$cfg === null) {
            $f = __DIR__ . '/../../config.php';
            if (!is_file($f)) {
                throw new \RuntimeException('api/config.php 가 없습니다. config.example.php 를 복사하세요.');
            }
            self::$cfg = require $f;
        }
        return self::$cfg;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $env = getenv(strtoupper(str_replace('.', '_', $key)));
        if ($env !== false && $env !== '') {
            return $env;
        }
        $cur = self::all();
        foreach (explode('.', $key) as $k) {
            if (!is_array($cur) || !array_key_exists($k, $cur)) {
                return $default;
            }
            $cur = $cur[$k];
        }
        return $cur;
    }

    public static function debug(): bool
    {
        return (bool) self::get('app.debug', false);
    }
}
