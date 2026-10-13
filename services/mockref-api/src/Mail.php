<?php

declare(strict_types=1);

namespace Homebox;

use Config; // 전역 클래스 — 안 쓰면 Homebox\Config 로 오토로드되어 Config.php 를 두 번 읽는다

/**
 * 메일 발송 (의존성 0, SMTP 587 STARTTLS + AUTH LOGIN). 운영 VM 은 25번 포트가 막혀 있어 외부 SMTP(예: Gmail 앱 비밀번호)로 보낸다.
 * 설정: config.php 'mail' => ['host','port','user','pass','from','from_name'] — .env 의 SMTP_* 를 scripts/sync-config.mjs 가 넣는다.
 */
final class Mail
{
    public static function configured(): bool
    {
        return (string) Config::get('mail.host', '') !== '' && (string) Config::get('mail.user', '') !== '' && (string) Config::get('mail.pass', '') !== '';
    }

    /** 텍스트 메일 한 통. 실패하면 RuntimeException(사유는 로그로만 — 응답에 SMTP 내용을 싣지 않는다) */
    public static function send(string $to, string $subject, string $text): void
    {
        $host = (string) Config::get('mail.host');
        $port = (int) Config::get('mail.port', 587);
        $user = (string) Config::get('mail.user');
        $pass = (string) Config::get('mail.pass');
        $from = (string) Config::get('mail.from', $user);
        $fromName = (string) Config::get('mail.from_name', '홈박스');

        $fp = @stream_socket_client("tcp://$host:$port", $errno, $errstr, 15);
        if ($fp === false) {
            throw new \RuntimeException("SMTP 연결 실패: $errstr");
        }
        stream_set_timeout($fp, 15);
        $read = static function () use ($fp): string {
            $out = '';
            while (($line = fgets($fp, 1024)) !== false) {
                $out .= $line;
                if (strlen($line) < 4 || $line[3] === ' ') { // 여러 줄 응답은 "250-" 로 이어지고 "250 " 로 끝난다
                    break;
                }
            }
            return $out;
        };
        $cmd = static function (string $c, int $expect) use ($fp, $read): void {
            if ($c !== '') {
                fwrite($fp, $c . "\r\n");
            }
            $r = $read();
            if ((int) substr($r, 0, 3) !== $expect) {
                throw new \RuntimeException('SMTP 거부: ' . trim(explode("\n", $r)[0] ?? ''));
            }
        };
        try {
            $cmd('', 220);
            $cmd('EHLO homebox', 250);
            if ($port !== 465) {
                $cmd('STARTTLS', 220);
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('STARTTLS 실패');
                }
                $cmd('EHLO homebox', 250);
            }
            $cmd('AUTH LOGIN', 334);
            $cmd(base64_encode($user), 334);
            $cmd(base64_encode($pass), 235);
            $cmd("MAIL FROM:<$from>", 250);
            $cmd("RCPT TO:<$to>", 250);
            $cmd('DATA', 354);
            $enc = static fn (string $s): string => '=?UTF-8?B?' . base64_encode($s) . '?=';
            $body = str_replace(["\r\n", "\r"], "\n", $text);
            $body = preg_replace('/^\./m', '..', $body) ?? $body; // 점으로 시작하는 줄은 DATA 끝으로 오인되지 않게
            $msg = 'From: ' . $enc($fromName) . " <$from>\r\n"
                . "To: <$to>\r\n"
                . 'Subject: ' . $enc($subject) . "\r\n"
                . 'Date: ' . date('r') . "\r\n"
                . "MIME-Version: 1.0\r\n"
                . "Content-Type: text/plain; charset=UTF-8\r\n"
                . "Content-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($body), 76, "\r\n");
            fwrite($fp, $msg . "\r\n.\r\n");
            $cmd('', 250);
            fwrite($fp, "QUIT\r\n");
        } finally {
            fclose($fp);
        }
    }
}
