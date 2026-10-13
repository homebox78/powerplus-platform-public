<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 포인트 (2026-10-03 사용자: "제작하고 공유하면 포인트 축적, 축적된 포인트를 다른 게시물을 보는데 사용 — 커뮤니티 참여 유도").
 * 원장(point_ledger)에 쌓고 잔액은 합계. (user, reason, ref) 가 같으면 한 번만 쌓인다 — 같은 일로 두 번 받지 않는다.
 * 적립·차감 규칙은 여기 한 곳(RULES)에만 둔다. 화면의 안내 표도 이 값을 그대로 받는다(GET /api/points).
 */
final class Points
{
    /** 갤러리 기준 점수: 이 점수 이하 시안은 폐기, 넘으면 학습 자료로 보관 */
    public const GALLERY_CUT = 80;
    /** 다른 사람 시안을 열어 보는 값 */
    public const UNLOCK_COST = 30;

    /** reason => [포인트, 이름, 설명, 하루 상한(null = 없음)] */
    public const RULES = [
        'welcome'        => [100, '가입 환영',            '처음 갤러리·포인트를 열면 한 번',                null],
        'daily'          => [5,   '출석',                 '하루 한 번 갤러리에 들르면',                     1],
        'gallery_made'   => [20,  '시안 보관',            'MCP 판정 ' . self::GALLERY_CUT . '점을 넘은 시안이 학습 자료로 보관될 때', null],
        'gallery_share'  => [50,  '시안 공유',            '보관한 시안을 갤러리에 공유할 때',               null],
        'gallery_like'   => [2,   '좋아요 받음',          '내가 공유한 시안에 좋아요가 눌릴 때',            null],
        'gallery_royalty'=> [10,  '열람 받음',            '다른 사람이 내 시안을 포인트로 열어 볼 때',      null],
        'community_post' => [10,  '커뮤니티 글',          '커뮤니티에 글을 쓸 때(공지 제외)',               3],
        'community_reply'=> [3,   '커뮤니티 댓글',        '다른 사람 글에 댓글을 달 때',                    10],
        'gallery_unlock' => [-self::UNLOCK_COST, '시안 열람', '다른 사람이 공유한 시안을 열어 볼 때(한 번 열면 계속 볼 수 있다)', null],
    ];

    public static function balance(int $userId): int
    {
        return (int) (Db::row('SELECT COALESCE(SUM(delta), 0) AS n FROM point_ledger WHERE user_id = ?', [$userId])['n'] ?? 0);
    }

    /** 적립. 이미 받은 (reason, ref) 이거나 하루 상한을 넘으면 false. 실패해도 본 작업을 막지 않는다. */
    public static function award(int $userId, string $reason, string $ref = ''): bool
    {
        $rule = self::RULES[$reason] ?? null;
        if ($rule === null || $userId <= 0) {
            return false;
        }
        try {
            if ($rule[3] !== null) {
                $today = (int) (Db::row('SELECT COUNT(*) AS n FROM point_ledger WHERE user_id = ? AND reason = ? AND created_at >= CURDATE()', [$userId, $reason])['n'] ?? 0);
                if ($today >= $rule[3]) {
                    return false;
                }
            }
            $n = Db::exec('INSERT IGNORE INTO point_ledger (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [$userId, $rule[0], $reason, mb_substr($ref, 0, 80)]);
            return $n > 0;
        } catch (\Throwable $e) {
            error_log('[points] ' . $e->getMessage());
            return false;
        }
    }

    /** 가입 환영·출석 — 갤러리·포인트 화면을 열 때 부른다 */
    public static function touch(int $userId): void
    {
        self::award($userId, 'welcome');
        self::award($userId, 'daily', date('Y-m-d'));
    }

    /** 차감. 잔액이 모자라면 false(차감 안 함). 같은 (reason, ref) 로 이미 냈으면 true(다시 내지 않음). */
    public static function spend(int $userId, string $reason, string $ref): bool
    {
        $rule = self::RULES[$reason] ?? null;
        if ($rule === null || $rule[0] >= 0) {
            return false;
        }
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            // 같은 사람의 동시 요청을 줄 세운다
            Db::row('SELECT id FROM users WHERE id = ? FOR UPDATE', [$userId]);
            if (Db::row('SELECT 1 AS x FROM point_ledger WHERE user_id = ? AND reason = ? AND ref = ?', [$userId, $reason, $ref]) !== null) {
                $pdo->commit();
                return true;
            }
            if (self::balance($userId) + $rule[0] < 0) {
                $pdo->rollBack();
                return false;
            }
            Db::exec('INSERT INTO point_ledger (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [$userId, $rule[0], $reason, $ref]);
            $pdo->commit();
            return true;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /** 화면 안내용 규칙 목록 */
    public static function rules(): array
    {
        $out = [];
        foreach (self::RULES as $k => [$pt, $name, $desc, $cap]) {
            $out[] = ['reason' => $k, 'points' => $pt, 'name' => $name, 'desc' => $desc, 'daily_cap' => $cap];
        }
        return $out;
    }

    /** 공유한 시안 수로 정하는 만든 사람 등급(참여 유도 — 갤러리 카드에 표시) */
    public static function badge(int $shared): ?array
    {
        if ($shared >= 15) { return ['id' => 'master', 'name' => '명장']; }
        if ($shared >= 5) { return ['id' => 'artisan', 'name' => '장인']; }
        if ($shared >= 1) { return ['id' => 'sprout', 'name' => '새싹']; }
        return null;
    }
}
