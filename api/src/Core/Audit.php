<?php
declare(strict_types=1);

namespace Pp\Core;

/** 관리자·권한 변경 이력(core_audit). 모든 쓰기 API 가 부른다(기획 §9.3). 실패해도 본 작업을 막지 않는다. */
final class Audit
{
    /** @param string $target "표:id" 형식 */
    public static function log(?Actor $actor, string $action, string $target, ?array $before = null, ?array $after = null): void
    {
        [$type, $id] = array_pad(explode(':', $target, 2), 2, '');
        try {
            Db::exec(
                'INSERT INTO core_audit (actor_user_id, actor_key_id, action, target_type, target_id, before_json, after_json, ip_masked) VALUES (?,?,?,?,?,?,?,?)',
                [
                    $actor?->id(),
                    $actor?->key['id'] ?? null,
                    $action,
                    $type,
                    $id,
                    $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE),
                    $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE),
                    self::ip(),
                ]
            );
        } catch (\Throwable $e) {
            error_log('[pp-audit] ' . $e->getMessage());
        }
    }

    /** IP 는 마지막 옥텟 익명화(개인정보 최소화, 기획 §17.2-⑨). */
    public static function ip(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return preg_replace('/\.\d+$/', '.0', $ip) ?? $ip;
        }
        return $ip;
    }
}
