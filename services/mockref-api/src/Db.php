<?php
declare(strict_types=1);

namespace Homebox;

use Config;
use PDO;

/**
 * PDO 싱글턴. 항상 prepared statement — SQL 문자열 결합 금지.
 * 식별자에 예약어(order, rank, key, cursor 등)를 쓰면 백틱 필수 (MISTAKES 2026-07-07).
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
                ],
            );
        }
        return self::$pdo;
    }

    /** @param array<string|int, mixed> $params @return array<int, array<string, mixed>> */
    public static function rows(string $sql, array $params = []): array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    /** @param array<string|int, mixed> $params @return array<string, mixed>|null */
    public static function row(string $sql, array $params = []): ?array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    /**
     * 무거운 집계 결과 캐시 (2026-09-26 "메뉴 클릭 시 불러오는 중…이 한참" — 운영 섹션 탐색 17초).
     * 전 기관 섹션·KRDS 집계는 데이터가 바뀔 때(배포 --db·수집 게시)만 달라진다 → 데이터 판(게시 기관 수·최종 수정·마지막 섹션 번호)을
     * 열쇠에 넣어, 데이터가 바뀌면 저절로 새로 계산한다. 플랜별 잠금·서명 주소는 캐시 밖에서 매 요청 계산할 것.
     */
    public static function cached(string $key, callable $fn, int $ttl = 86400): mixed
    {
        static $ver = null;
        if ($ver === null) {
            $v = self::row("SELECT (SELECT COUNT(*) FROM sites WHERE status = 'published') AS n, (SELECT MAX(updated_at) FROM sites) AS u, (SELECT MAX(id) FROM sections) AS s");
            $ver = md5(json_encode($v));
        }
        $dir = sys_get_temp_dir() . '/homebox-cache';
        $file = $dir . '/' . md5($key . '|' . $ver) . '.json';
        if (is_file($file) && filemtime($file) > time() - $ttl) {
            $data = json_decode((string) file_get_contents($file), true);
            if (is_array($data) && array_key_exists('v', $data)) {
                return $data['v'];
            }
        }
        $value = $fn();
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $tmp = $file . '.' . getmypid();
        if (@file_put_contents($tmp, json_encode(['v' => $value], JSON_UNESCAPED_UNICODE)) !== false) {
            @rename($tmp, $file);
        }
        return $value;
    }

    /** @param array<string|int, mixed> $params */
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

    /**
     * 트랜잭션 — 안에서 예외가 나면 되돌리고 다시 던진다(2026-10-18 결제 기록이 반쯤 남던 것, 전수조사 B).
     * 이미 트랜잭션 안이면 그대로 이어 쓴다(바깥이 커밋·되돌림).
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) {
            return $fn();
        }
        $pdo->beginTransaction();
        try {
            $r = $fn();
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
