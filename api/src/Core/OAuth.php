<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 소셜 로그인 3종(google·naver·kakao). 콜백 /api/v1/auth/{provider}/callback.
 * 출처: homebox-handoff api/src/Auth/OAuth.php (엔드포인트·프로필 파싱, state 검증, 검증된 이메일만 연결)
 */
final class OAuth
{
    private const P = [
        'google' => [
            'auth' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'token' => 'https://oauth2.googleapis.com/token',
            'me' => 'https://www.googleapis.com/oauth2/v3/userinfo',
            'scope' => 'openid email profile',
        ],
        'naver' => [
            'auth' => 'https://nid.naver.com/oauth2.0/authorize',
            'token' => 'https://nid.naver.com/oauth2.0/token',
            'me' => 'https://openapi.naver.com/v1/nid/me',
            'scope' => '',
        ],
        'kakao' => [
            'auth' => 'https://kauth.kakao.com/oauth/authorize',
            'token' => 'https://kauth.kakao.com/oauth/token',
            'me' => 'https://kapi.kakao.com/v2/user/me',
            'scope' => '', // 동의 항목은 콘솔 설정만(account_email 은 비즈 앱 전용 — KOE205)
        ],
    ];

    public static function providers(): array
    {
        return array_keys(self::P);
    }

    public static function startUrl(string $provider, string $next = '/'): string
    {
        $p = self::P[$provider] ?? throw HttpError::notFound('로그인 제공자');
        $state = Ids::token(24);
        Session::put('oauth_state', $state);
        Session::put('oauth_next', self::safeNext($next));
        $q = [
            'client_id' => (string) Config::get("oauth.{$provider}.id"),
            'redirect_uri' => self::redirectUri($provider),
            'response_type' => 'code',
            'state' => $state,
        ];
        if ($p['scope'] !== '') {
            $q['scope'] = $p['scope'];
        }
        if ($provider === 'google') {
            $q['prompt'] = 'select_account';
        }
        return $p['auth'] . '?' . http_build_query($q);
    }

    /** 콜백 처리 → 사용자 행. 실패는 HttpError. */
    public static function callback(string $provider, array $query): array
    {
        $p = self::P[$provider] ?? throw HttpError::notFound('로그인 제공자');
        $state = (string) Session::take('oauth_state');
        if ($state === '' || !hash_equals($state, (string) ($query['state'] ?? ''))) {
            throw HttpError::invalid('로그인 상태가 맞지 않습니다. 다시 시도하세요.');
        }
        $code = (string) ($query['code'] ?? '');
        if ($code === '') {
            throw HttpError::invalid('로그인이 취소됐습니다.');
        }
        $tok = self::post($p['token'], [
            'grant_type' => 'authorization_code',
            'client_id' => (string) Config::get("oauth.{$provider}.id"),
            'client_secret' => (string) Config::get("oauth.{$provider}.secret"),
            'redirect_uri' => self::redirectUri($provider),
            'code' => $code,
        ]);
        $access = (string) ($tok['access_token'] ?? '');
        if ($access === '') {
            error_log("[pp-auth] {$provider} token fail: " . json_encode($tok));
            throw HttpError::invalid('소셜 로그인 인증에 실패했습니다.');
        }
        $me = self::get($p['me'], $access);
        [$uid, $email, $verified, $name, $avatar] = self::profile($provider, $me);
        if ($uid === '') {
            throw HttpError::invalid('프로필을 읽지 못했습니다.');
        }
        return Users::findOrCreateByLogin($provider, $uid, $email, $verified, $name, $avatar);
    }

    public static function nextAfterLogin(): string
    {
        return self::safeNext((string) (Session::take('oauth_next') ?? '/'));
    }

    private static function profile(string $provider, array $me): array
    {
        return match ($provider) {
            'google' => [
                (string) ($me['sub'] ?? ''),
                $me['email'] ?? null,
                (bool) ($me['email_verified'] ?? false),
                $me['name'] ?? null,
                $me['picture'] ?? null,
            ],
            'naver' => [
                (string) ($me['response']['id'] ?? ''),
                $me['response']['email'] ?? null,
                false, // 네이버 이메일은 연락처 이메일이라 검증으로 보지 않는다(G29)
                $me['response']['name'] ?? $me['response']['nickname'] ?? null,
                $me['response']['profile_image'] ?? null,
            ],
            'kakao' => [
                (string) ($me['id'] ?? ''),
                $me['kakao_account']['email'] ?? null,
                (bool) (($me['kakao_account']['is_email_verified'] ?? false) && ($me['kakao_account']['is_email_valid'] ?? false)),
                $me['kakao_account']['profile']['nickname'] ?? null,
                $me['kakao_account']['profile']['profile_image_url'] ?? null,
            ],
            default => ['', null, false, null, null],
        };
    }

    private static function redirectUri(string $provider): string
    {
        $base = rtrim((string) Config::get('app.url'), '/');
        return "{$base}/api/v1/auth/{$provider}/callback";
    }

    private static function safeNext(string $next): string
    {
        return (str_starts_with($next, '/') && !str_starts_with($next, '//')) ? $next : '/';
    }

    private static function post(string $url, array $form): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($form),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $r = curl_exec($ch);
        if ($r === false) {
            error_log('[pp-auth] curl ' . curl_error($ch));
            return [];
        }
        return json_decode((string) $r, true) ?: [];
    }

    private static function get(string $url, string $bearer): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ["Authorization: Bearer {$bearer}", 'Accept: application/json'],
        ]);
        $r = curl_exec($ch);
        return $r === false ? [] : (json_decode((string) $r, true) ?: []);
    }
}
