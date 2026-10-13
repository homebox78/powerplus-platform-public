<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 알림 — core_notifications(kind·title·body·link). 출처: homebox-handoff api/src/Notify.php.
 * 자기 자신에게는 보내지 않고, 실패해도 본 작업을 막지 않는다.
 *
 * 알림 받는 방법(사용자 2026-10-07 "기다리지 않아도 알 수 있게"):
 *  - 사이트 알림(우측 상단 종·토스트)은 항상 쌓는다.
 *  - 메일은 종류(MAIL_CATEGORIES)별로 사용자가 끄고 켠다(core_users.notify_mail, 없으면 DEFAULTS).
 *    오래 걸리는 작업(장표 기획·시안·완성·실패)과 요청 처리 결과는 기본으로 메일, 커뮤니티 반응·공지는 기본 끔.
 */
final class Notify
{
    /** 메일로 받을 수 있는 종류 — 화면(마이페이지 설정 › 알림)과 같은 목록 */
    public const MAIL_CATEGORIES = [
        'work' => ['label' => '작업 완료', 'desc' => '장표 기획·시안·완성·실패가 나올 때처럼 오래 걸리는 작업이 끝났을 때', 'default' => true],
        'request' => ['label' => '요청 처리 결과', 'desc' => '자료 요청·문의·삭제요청에 답이 왔을 때', 'default' => true],
        'comment' => ['label' => '댓글·좋아요', 'desc' => '내 글·시안에 댓글이나 좋아요가 달렸을 때', 'default' => false],
        'notice' => ['label' => '공지', 'desc' => '새 공지가 올라왔을 때', 'default' => false],
    ];

    public static function send(int $userId, string $kind, string $title, ?string $link = null, ?int $actorId = null, ?string $body = null): void
    {
        if ($actorId !== null && $actorId === $userId) {
            return;
        }
        try {
            Db::exec('INSERT INTO core_notifications (user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)', [$userId, $kind, mb_substr($title, 0, 200), $body === null ? null : mb_substr($body, 0, 500), $link]);
        } catch (\Throwable) {
        }
    }

    /** 전체 회원(탈퇴 제외)에게 — 공지 */
    public static function broadcast(string $kind, string $title, ?string $link = null, ?int $actorId = null): void
    {
        try {
            Db::exec('INSERT INTO core_notifications (user_id, kind, title, link) SELECT id, ?, ?, ? FROM core_users WHERE deleted_at IS NULL AND id <> ?', [$kind, mb_substr($title, 0, 200), $link, $actorId ?? 0]);
        } catch (\Throwable) {
        }
    }

    /** 이 사용자의 메일 수신 설정(종류 → bool). 저장값이 없거나 모르는 종류면 기본값 */
    public static function mailPrefs(?string $json): array
    {
        $saved = json_decode((string) $json, true);
        $out = [];
        foreach (self::MAIL_CATEGORIES as $k => $c) {
            $out[$k] = is_array($saved) && array_key_exists($k, $saved) ? (bool) $saved[$k] : $c['default'];
        }
        return $out;
    }

    /** 응답을 먼저 보낸 뒤 메일을 보낸다(SMTP 가 1~2초 걸려 화면이 기다리지 않게) */
    public static function later(callable $fn): void
    {
        static $queue = null;
        if ($queue === null) {
            $queue = new \ArrayObject();
            register_shutdown_function(static function () use ($queue): void {
                if (function_exists('fastcgi_finish_request')) {
                    @fastcgi_finish_request();
                }
                ignore_user_abort(true);
                foreach ($queue as $f) {
                    try { $f(); } catch (\Throwable) {}
                }
            });
        }
        $queue[] = $fn;
    }

    /** 그 종류 메일을 켠 회원 전부에게(공지 등) — 응답 뒤에, 한 번에 500명까지 */
    public static function mailAll(string $category, string $mailType, array $vars, ?int $exceptUserId = null): void
    {
        $default = (bool) (self::MAIL_CATEGORIES[$category]['default'] ?? false);
        self::later(static function () use ($category, $mailType, $vars, $exceptUserId, $default): void {
            $rows = Db::rows('SELECT id, email, notify_mail FROM core_users WHERE deleted_at IS NULL AND id <> ? ORDER BY id LIMIT 500', [$exceptUserId ?? 0]);
            foreach ($rows as $u) {
                $on = self::mailPrefs($u['notify_mail'] ?? null)[$category] ?? $default;
                if ($on) {
                    MailTemplate::deliver($mailType, (string) $u['email'], $vars);
                }
            }
        });
    }

    /**
     * 메일 알림 — 그 종류를 켜 둔 사용자에게만 MailTemplate 로 보낸다. 실패해도 조용히.
     * (사이트 알림은 send 로 따로 쌓는다 — 메일을 꺼도 종 알림은 남는다)
     */
    public static function mail(int $userId, string $category, string $mailType, array $vars): bool
    {
        try {
            $u = Db::row('SELECT email, notify_mail, deleted_at FROM core_users WHERE id = ?', [$userId]);
            if (!$u || $u['deleted_at'] !== null) {
                return false;
            }
            if (!(self::mailPrefs($u['notify_mail'] ?? null)[$category] ?? false)) {
                return false;
            }
            return MailTemplate::deliver($mailType, (string) $u['email'], $vars);
        } catch (\Throwable $e) {
            error_log('[pp-notify] mail ' . $mailType . ': ' . $e->getMessage());
            return false;
        }
    }
}
