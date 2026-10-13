<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 가입 동의(기획 §17.1·§17.3): 만 14세 이상 확인 + 이용약관·개인정보 수집·이용·국외 이전(필수) + 마케팅 수신(선택).
 * - 새 가입자와, 아직 동의하지 않은 기존 사용자 모두 다음 로그인 때 한 번 묻는다(웹 게이트 + 서버 차단).
 * - 약관·개인정보 판(core_policy_versions, 시행 중인 판)이 바뀌면 version() 이 바뀐다 → 다음 로그인 때 필수 동의를 다시 받는다(428).
 * - 세션 로그인만 막는다. API 키(MCP)·워커는 키를 발급받을 때 이미 동의한 사용자라 막지 않는다.
 */
final class Consents
{
    /**
     * 처음 동의 기록에 쓰던 고정 판 이름. 약관·개인정보 판이 둘 다 1.0(화면 코드의 첫 판)인 동안은
     * 이 이름으로 남은 동의를 현재 판 동의로 인정한다 — 판 연결을 넣는 순간 모두가 막히지 않게(LEGAL-012).
     */
    public const LEGACY_VERSION = '2026-10-07';
    /** @deprecated 판 이름은 version() 으로. 옛 호출부(시험 계정 스크립트 등)를 위해 남긴다. */
    public const VERSION = self::LEGACY_VERSION;
    public const BASE_VERSION = '1.0';
    public const REQUIRED = ['age14', 'terms', 'privacy', 'overseas'];

    /** @var array<int, array> */
    private static array $cache = [];
    private static ?string $version = null;

    /** 문서(terms·privacy)의 지금 시행 중인 판 — 발행됐고 시행일이 지난 것 중 가장 최근. DB 에 없으면 첫 판 1.0. */
    public static function currentDocVersion(string $doc): string
    {
        $rows = Db::rows(
            'SELECT version FROM core_policy_versions WHERE doc = ? AND published = 1 AND deleted_at IS NULL AND effective_on <= CURDATE()
             ORDER BY effective_on DESC, id DESC',
            [$doc]
        );
        return $rows ? (string) $rows[0]['version'] : self::BASE_VERSION;
    }

    /** 동의 기록에 쓰는 판 이름 = 약관 판 + 개인정보 판(예: t1.1|p1.0). 둘 중 하나가 바뀌면 다시 동의 받는다. */
    public static function version(): string
    {
        if (self::$version === null) {
            $t = self::currentDocVersion('terms');
            $p = self::currentDocVersion('privacy');
            self::$version = mb_substr("t{$t}|p{$p}", 0, 20);
        }
        return self::$version;
    }

    /** @return string[] 지금 판으로 인정하는 기록 이름들 */
    private static function acceptedVersions(): array
    {
        $v = self::version();
        return $v === 't' . self::BASE_VERSION . '|p' . self::BASE_VERSION ? [$v, self::LEGACY_VERSION] : [$v];
    }

    /** @return array{required: bool, version: string, missing: string[], agreed_at: ?string} */
    public static function status(int $userId): array
    {
        if (isset(self::$cache[$userId])) {
            return self::$cache[$userId];
        }
        $acc = self::acceptedVersions();
        $rows = Db::rows(
            'SELECT kind, agreed_at FROM core_consents WHERE user_id = ? AND agreed = 1 AND version IN (' . implode(',', array_fill(0, count($acc), '?')) . ')',
            array_merge([$userId], $acc)
        );
        $have = [];
        $at = null;
        foreach ($rows as $r) {
            $have[(string) $r['kind']] = true;
            if (in_array($r['kind'], self::REQUIRED, true) && ($at === null || $r['agreed_at'] > $at)) {
                $at = (string) $r['agreed_at'];
            }
        }
        $missing = array_values(array_filter(self::REQUIRED, static fn ($k) => empty($have[$k])));
        return self::$cache[$userId] = ['required' => $missing !== [], 'version' => self::version(), 'missing' => $missing, 'agreed_at' => $missing === [] ? $at : null];
    }

    /** 세션 사용자가 필수 동의를 아직 안 했는가 */
    public static function blocks(Actor $a): bool
    {
        return $a->user !== null && $a->via === 'session' && self::status((int) $a->user['id'])['required'];
    }

    /** 동의 전에도 열려 있어야 하는 경로(내 정보·동의·로그아웃·탈퇴) */
    public static function allowed(string $method, string $path): bool
    {
        return ($method === 'GET' && $path === '/me')
            || ($method === 'POST' && $path === '/me/consents')
            || ($method === 'DELETE' && $path === '/me')
            || ($method === 'POST' && ($path === '/auth/logout' || $path === '/auth/logout-all'));
    }

    /** @param array<string, mixed> $in */
    public static function record(Actor $a, array $in): array
    {
        $u = Auth::requireUser($a);
        foreach (self::REQUIRED as $k) {
            if (empty($in[$k])) {
                throw HttpError::invalid('필수 항목에 모두 동의해야 합니다.', '만 14세 이상 확인·이용약관·개인정보 수집·이용·국외 이전');
            }
        }
        $marketing = !empty($in['marketing']);
        $ip = Audit::ip();
        Db::tx(static function () use ($u, $marketing, $ip, $a): void {
            foreach (self::REQUIRED as $k) {
                Db::exec(
                    'INSERT INTO core_consents (user_id, kind, version, agreed, ip) VALUES (?,?,?,1,?) ON DUPLICATE KEY UPDATE agreed = 1, agreed_at = NOW(3), ip = VALUES(ip)',
                    [$u['id'], $k, self::version(), $ip]
                );
            }
            Db::exec(
                'INSERT INTO core_consents (user_id, kind, version, agreed, ip) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE agreed = VALUES(agreed), agreed_at = NOW(3), ip = VALUES(ip)',
                [$u['id'], 'marketing', self::version(), $marketing ? 1 : 0, $ip]
            );
            Db::exec('UPDATE core_users SET marketing_opt_in = ?, marketing_opt_at = NOW(3) WHERE id = ?', [$marketing ? 1 : 0, $u['id']]);
            Audit::log($a, 'user.consent', 'core_users:' . $u['id'], null, ['version' => self::version(), 'marketing' => $marketing]);
        });
        unset(self::$cache[(int) $u['id']]);
        return self::status((int) $u['id']);
    }
}
