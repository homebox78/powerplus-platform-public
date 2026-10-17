<?php
declare(strict_types=1);

namespace Pp\Core;

use PDO;

/**
 * PDO 싱글턴. prepared statement 만, 식별자 결합 금지, 명명 파라미터 재사용 금지(EMULATE_PREPARES false).
 * 출처: homebox-handoff api/src/Db.php (cached 는 Cache 로 분리)
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            self::$pdo = new PDO(
                (string) Config::get('db.dsn'),
                (string) Config::get('db.user'),
                (string) Config::get('db.pass'),
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    // PHP 8.5 부터 PDO::MYSQL_ATTR_* 는 사라질 예정 — 새 상수가 있으면 그것을 쓴다(8.4 서버는 옛 상수)
                    (class_exists(\Pdo\Mysql::class) ? \Pdo\Mysql::ATTR_INIT_COMMAND : PDO::MYSQL_ATTR_INIT_COMMAND) => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '+09:00'",
                ]
            );
        }
        return self::$pdo;
    }

    /** @return array<int, array<string, mixed>> */
    public static function rows(string $sql, array $params = []): array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    public static function row(string $sql, array $params = []): ?array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    public static function val(string $sql, array $params = []): mixed
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function exec(string $sql, array $params = []): int
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }

    public static function lastId(): int
    {
        return (int) self::pdo()->lastInsertId();
    }

    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $r = $fn($pdo);
            $pdo->commit();
            return $r;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
