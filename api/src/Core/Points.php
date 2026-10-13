<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 포인트 적립 — core_point_rules(값·일 상한·연 상한) + core_point_ledger(UNIQUE user·reason·ref 로 중복 차단).
 * 출처: homebox-handoff api/src/Points.php 의 award() 패턴. 실패해도 본 작업을 막지 않는다(try 로 감싼다).
 */
final class Points
{
    public static function award(int $userId, string $reason, string $refType = '', string $refId = ''): bool
    {
        try {
            $rule = Db::row('SELECT delta, daily_cap, yearly_cap, enabled FROM core_point_rules WHERE reason = ?', [$reason]);
            if (!$rule || !(int) $rule['enabled']) {
                return false;
            }
            if ($rule['daily_cap'] !== null) {
                $n = (int) Db::val('SELECT COUNT(*) FROM core_point_ledger WHERE user_id = ? AND reason = ? AND created_at >= CURDATE()', [$userId, $reason]);
                if ($n >= (int) $rule['daily_cap']) {
                    return false;
                }
            }
            if ($rule['yearly_cap'] !== null) {
                $n = (int) Db::val('SELECT COUNT(*) FROM core_point_ledger WHERE user_id = ? AND reason = ? AND created_at >= DATE_FORMAT(NOW(), "%Y-01-01")', [$userId, $reason]);
                if ($n >= (int) $rule['yearly_cap']) {
                    return false;
                }
            }
            return Db::exec('INSERT IGNORE INTO core_point_ledger (user_id, delta, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)', [$userId, (int) $rule['delta'], $reason, $refType, $refId]) > 0;
        } catch (\Throwable) {
            return false;
        }
    }

    /** 차감(delta < 0 규칙). 잔액이 모자라면 false — 같은 ref 는 한 번만 빠진다. */
    public static function spend(int $userId, string $reason, string $refType = '', string $refId = ''): bool
    {
        $rule = Db::row('SELECT delta, enabled FROM core_point_rules WHERE reason = ?', [$reason]);
        if (!$rule || !(int) $rule['enabled'] || (int) $rule['delta'] >= 0) {
            return false;
        }
        if (Db::row('SELECT 1 AS x FROM core_point_ledger WHERE user_id = ? AND reason = ? AND ref_type = ? AND ref_id = ?', [$userId, $reason, $refType, $refId])) {
            return true;
        }
        if (self::balance($userId) + (int) $rule['delta'] < 0) {
            return false;
        }
        return Db::exec('INSERT IGNORE INTO core_point_ledger (user_id, delta, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)', [$userId, (int) $rule['delta'], $reason, $refType, $refId]) > 0;
    }

    public static function cost(string $reason): int
    {
        return abs((int) (Db::val('SELECT delta FROM core_point_rules WHERE reason = ?', [$reason]) ?? 0));
    }

    public static function balance(int $userId): int
    {
        return (int) Db::val('SELECT COALESCE(SUM(delta), 0) FROM core_point_ledger WHERE user_id = ?', [$userId]);
    }
}
