<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 알림 (2026-09-26 사용자 지시 "우측 상단 알림 기능").
 * 헤더 종 아이콘이 GET /api/notifications/unread 로 개수를, 누르면 GET /api/notifications 로 목록을 가져간다.
 * 알림을 만드는 곳: 커뮤니티 댓글·좋아요·공지, 수행사 제보 수락·반려.
 * 실패해도 본 작업을 막지 않는다(알림은 부가 기능) — 예외는 삼키고 로그만.
 */
final class Notify
{
    public const KINDS = ['comment', 'like', 'notice', 'request', 'billing', 'system'];

    /** 한 사람에게. 자기 행동(actor = 받는 사람)은 알리지 않는다. */
    public static function send(int $userId, string $kind, string $title, ?string $body = null, ?string $link = null, ?int $actorId = null): void
    {
        if ($actorId !== null && $actorId === $userId) {
            return;
        }
        try {
            Db::exec(
                'INSERT INTO notifications (user_id, kind, title, body, link, actor_id) VALUES (?, ?, ?, ?, ?, ?)',
                [$userId, $kind, mb_substr($title, 0, 200), $body === null ? null : mb_substr($body, 0, 500), $link, $actorId],
            );
        } catch (\Throwable $e) {
            error_log('[notify] ' . $e->getMessage());
        }
    }

    /** 전체 회원에게(공지). 작성자 제외. */
    public static function broadcast(string $kind, string $title, ?string $body, ?string $link, int $actorId): void
    {
        try {
            Db::exec(
                'INSERT INTO notifications (user_id, kind, title, body, link, actor_id)
                 SELECT id, ?, ?, ?, ?, ? FROM users WHERE deleted_at IS NULL AND id <> ?',
                [$kind, mb_substr($title, 0, 200), $body === null ? null : mb_substr($body, 0, 500), $link, $actorId, $actorId],
            );
        } catch (\Throwable $e) {
            error_log('[notify] ' . $e->getMessage());
        }
    }
}
