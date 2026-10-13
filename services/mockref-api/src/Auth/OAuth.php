<?php
declare(strict_types=1);

namespace Homebox\Auth;

use Config;
use RuntimeException;

/**
 * OAuth 2.0 (Authorization Code) — 네이버·카카오·구글. 라이브러리 없이 curl (CLAUDE.md: PHP 세션 + OAuth).
 * 콜백 규약: `/api/auth/{provider}/callback` — 각 콘솔에 로컬(http://localhost:5173/…)·운영(https://hom2box.com/homebox/…)·루트 승격(https://hom2box.com/…) 3개 등록 (2026-09-24 사용자 발급)
 * 키는 config.php `oauth.{provider}.id|secret` (.env 와 동일 값, git 제외).
 */
final class OAuth
{
    public const PROVIDERS = ['google', 'naver', 'kakao'];

    /** @return array{authorize:string, token:string, userinfo:string, scope:string} */
    private static function endpoints(string $p): array
    {
        return match ($p) {
            'google' => ['authorize' => 'https://accounts.google.com/o/oauth2/v2/auth', 'token' => 'https://oauth2.googleapis.com/token', 'userinfo' => 'https://openidconnect.googleapis.com/v1/userinfo', 'scope' => 'openid email profile'],
            'naver' => ['authorize' => 'https://nid.naver.com/oauth2.0/authorize', 'token' => 'https://nid.naver.com/oauth2.0/token', 'userinfo' => 'https://openapi.naver.com/v1/nid/me', 'scope' => ''],
        // 카카오는 scope 를 비워 콘솔 [동의항목]에서 켠 것만 요청한다 — account_email 은 비즈 앱 전용이라 지정하면 KOE205 (2026-09-24)
            'kakao' => ['authorize' => 'https://kauth.kakao.com/oauth/authorize', 'token' => 'https://kauth.kakao.com/oauth/token', 'userinfo' => 'https://kapi.kakao.com/v2/user/me', 'scope' => ''],
            default => throw new RuntimeException("unknown provider $p"),
        };
    }

    public static function configured(string $p): bool
    {
        return (string) Config::get("oauth.$p.id", '') !== '';
    }

    /** 현재 요청의 스킴·호스트 + app.base 로 콜백 URL 을 만든다 (로컬 Vite 프록시 → http://localhost:5173/api/…, 운영 → https://hom2box.com/homebox/api/…) */
    public static function redirectUri(string $p): string
    {
        $https = (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $fromProxy = in_array((string) ($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
        $host = (string) (($fromProxy ? ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? null) : null) ?? Config::get('app.host') ?? $_SERVER['HTTP_HOST'] ?? 'localhost');
        $base = rtrim((string) Config::get('app.base', '/'), '/');
        return ($https ? 'https' : 'http') . "://$host$base/api/auth/$p/callback";
    }

    public static function authorizeUrl(string $p, string $state): string
    {
        $e = self::endpoints($p);
        $q = ['client_id' => (string) Config::get("oauth.$p.id"), 'redirect_uri' => self::redirectUri($p), 'response_type' => 'code', 'state' => $state];
        if ($e['scope'] !== '') {
            $q['scope'] = $e['scope'];
        }
        if ($p === 'google') {
            $q['access_type'] = 'online';
            $q['prompt'] = 'select_account';
        }
        return $e['authorize'] . '?' . http_build_query($q);
    }

    /** code → access_token → 프로필. @return array{uid:string, email:?string, name:?string, avatar:?string} */
    public static function exchange(string $p, string $code, string $state): array
    {
        $e = self::endpoints($p);
        $body = ['grant_type' => 'authorization_code', 'client_id' => (string) Config::get("oauth.$p.id"), 'client_secret' => (string) Config::get("oauth.$p.secret", ''), 'redirect_uri' => self::redirectUri($p), 'code' => $code];
        if ($p === 'naver') {
            $body['state'] = $state;
        }
        $tok = self::http('POST', $e['token'], $body, ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json']);
        $access = (string) ($tok['access_token'] ?? '');
        if ($access === '') {
            throw new RuntimeException("$p token 교환 실패: " . json_encode($tok, JSON_UNESCAPED_UNICODE));
        }
        $me = self::http('GET', $e['userinfo'], null, ["Authorization: Bearer $access", 'Accept: application/json']);
        // verified = 공급자가 이메일 소유를 확인해 준 값인가 (보안 점검 2026-10-05).
        // 검증 안 된 이메일로 기존 계정에 붙이면 남의 이메일을 적어 둔 소셜 계정으로 그 계정에 들어갈 수 있다.
        // 네이버 email 은 연락처 이메일이라 검증 표시가 없다 → 항상 false.
        $ka = $me['kakao_account'] ?? [];
        return match ($p) {
            'google' => ['uid' => (string) ($me['sub'] ?? ''), 'email' => $me['email'] ?? null, 'verified' => ($me['email_verified'] ?? false) === true, 'name' => $me['name'] ?? null, 'avatar' => $me['picture'] ?? null],
            'naver' => ['uid' => (string) ($me['response']['id'] ?? ''), 'email' => $me['response']['email'] ?? null, 'verified' => false, 'name' => $me['response']['name'] ?? ($me['response']['nickname'] ?? null), 'avatar' => $me['response']['profile_image'] ?? null],
            'kakao' => ['uid' => (string) ($me['id'] ?? ''), 'email' => $ka['email'] ?? null, 'verified' => ($ka['is_email_verified'] ?? false) === true && ($ka['is_email_valid'] ?? false) === true, 'name' => $ka['profile']['nickname'] ?? null, 'avatar' => $ka['profile']['profile_image_url'] ?? null],
        };
    }

    /** @param array<string, string>|null $form @return array<string, mixed> */
    private static function http(string $method, string $url, ?array $form, array $headers): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => $headers, CURLOPT_USERAGENT => 'homebox/1.0']);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($form ?? []));
        }
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        if (!is_string($res)) {
            throw new RuntimeException("$url 요청 실패: $err");
        }
        $json = json_decode($res, true);
        if (!is_array($json)) {
            throw new RuntimeException("$url 응답 파싱 실패 ($status)");
        }
        if ($status >= 400) {
            throw new RuntimeException("$url $status: " . json_encode($json, JSON_UNESCAPED_UNICODE));
        }
        return $json;
    }
}
