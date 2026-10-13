<?php
declare(strict_types=1);

/**
 * 설정 — 시크릿은 git 제외 config.php (api/config.php, config.example.php 참고). 하드코딩 금지.
 */
final class Config
{
    /** @var array<string, mixed>|null */
    private static ?array $data = null;

    /** @return array<string, mixed> */
    private static function load(): array
    {
        if (self::$data !== null) {
            return self::$data;
        }
        $file = __DIR__ . '/../config.php';
        if (!is_file($file)) {
            throw new RuntimeException('api/config.php 없음 — config.example.php를 복사해 값을 채우세요.');
        }
        /** @var array<string, mixed> $cfg */
        $cfg = require $file;
        return self::$data = $cfg;
    }

    /** 점 표기 조회: Config::get('db.dsn') */
    public static function get(string $key, mixed $default = null): mixed
    {
        $node = self::load();
        foreach (explode('.', $key) as $part) {
            if (!is_array($node) || !array_key_exists($part, $node)) {
                return $default;
            }
            $node = $node[$part];
        }
        return $node;
    }
}
