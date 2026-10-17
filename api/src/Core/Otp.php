<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 이메일 OTP 로그인(모든 사용자 공용 — 회사 도메인은 차단이 아니라 staff 분류).
 * 출처: powerPlus server/src/AuthService.php requestCode/verify (6자리·sha256·TTL 10분·60초 간격·5회 실패 무효). rejectReason(도메인 차단)은 이식하지 않음.
 */
final class Otp
{
    private const TTL_MIN = 10;
    private const RESEND_SEC = 60;
    private const MAX_TRIES = 5;

    public static function request(string $email): array
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw HttpError::invalid('이메일 형식이 아닙니다.');
        }
        $last = Db::row('SELECT created_at FROM core_otp_codes WHERE email = ? ORDER BY id DESC LIMIT 1', [$email]);
        if ($last && (time() - strtotime((string) $last['created_at'])) < self::RESEND_SEC) {
            throw new HttpError('TOO_SOON', '잠시 뒤 다시 요청하세요.', 429, self::RESEND_SEC . '초 간격');
        }
        // 메일 폭탄·발송 비용 막기(2026-10-17) — 이메일마다 60초 말고도 IP 한 곳에서 시간 10번·하루 30번, 사이트 전체 하루 상한
        $ip = RateLimit::ipKey();
        RateLimit::hit("otp.ip.h:{$ip}", 10, RateLimit::HOUR, '인증 코드 요청이 너무 잦습니다. 잠시 뒤 다시 요청하세요.');
        RateLimit::hit("otp.ip.d:{$ip}", 30, RateLimit::DAY, '오늘 이 곳에서 요청할 수 있는 인증 코드 수를 넘었습니다.');
        RateLimit::hit('otp.all.d', (int) Config::get('auth.otp_daily_cap', 1000), RateLimit::DAY, '지금은 인증 코드를 보낼 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
        $code = Ids::otp();
        Db::exec('DELETE FROM core_otp_codes WHERE email = ?', [$email]);
        Db::exec(
            'INSERT INTO core_otp_codes (email, code_hash, expires_at, ip_masked) VALUES (?,?,DATE_ADD(NOW(3), INTERVAL ? MINUTE),?)',
            [$email, hash('sha256', $code), self::TTL_MIN, Audit::ip()]
        );
        [$subj, $text, $html] = MailTemplate::render('otp', ['code' => $code, 'ttl' => self::TTL_MIN]);
        $sent = Mail::send($email, $subj, $text, $html);
        $out = ['sent' => $sent, 'ttl_min' => self::TTL_MIN, 'staff' => Users::isStaffEmail($email)];
        if (Config::debug() && (bool) Config::get('auth.debug_code', false)) {
            $out['dev_code'] = $code; // 로컬 전용
        }
        return $out;
    }

    /** 성공하면 사용자 행(없으면 생성). */
    public static function verify(string $email, string $code): array
    {
        $email = strtolower(trim($email));
        $code = preg_replace('/\D/', '', $code) ?? '';
        $row = Db::row('SELECT * FROM core_otp_codes WHERE email = ? ORDER BY id DESC LIMIT 1', [$email]);
        if (!$row || strtotime((string) $row['expires_at']) < time()) {
            throw HttpError::invalid('코드가 만료됐습니다. 다시 요청하세요.');
        }
        if ((int) $row['attempts'] >= self::MAX_TRIES) {
            throw HttpError::invalid('시도 횟수를 넘었습니다. 다시 요청하세요.');
        }
        if (!hash_equals((string) $row['code_hash'], hash('sha256', $code))) {
            Db::exec('UPDATE core_otp_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
            throw HttpError::invalid('코드가 맞지 않습니다.');
        }
        Db::exec('DELETE FROM core_otp_codes WHERE email = ?', [$email]);
        return Users::findOrCreateByLogin('email', $email, $email, true, null, null);
    }
}
