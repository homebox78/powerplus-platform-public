<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 의존성 0 raw SMTP(587 STARTTLS, AUTH LOGIN). GCP 25번 차단 환경 기준. 사내 릴레이로 바꿀 때 host/port/auth 만 변경.
 * 출처: homebox-handoff api/src/Mail.php
 */
final class Mail
{
    public static function send(string $to, string $subject, string $text, ?string $html = null): bool
    {
        $host = (string) Config::get('smtp.host', '');
        if ($host === '') {
            if (Config::debug()) {
                error_log("[pp-mail:dev] to={$to} subject={$subject}\n{$text}");
                return true;
            }
            return false;
        }
        $port = (int) Config::get('smtp.port', 587);
        $user = (string) Config::get('smtp.user', '');
        $pass = (string) Config::get('smtp.pass', '');
        $from = (string) Config::get('smtp.from', $user);
        $fromName = (string) Config::get('smtp.from_name', 'powerPlus');

        $fp = @stream_socket_client("tcp://{$host}:{$port}", $errno, $errstr, 15);
        if (!$fp) {
            error_log("[pp-mail] connect fail {$errno} {$errstr}");
            return false;
        }
        stream_set_timeout($fp, 15);
        $read = static function () use ($fp): string {
            $out = '';
            while (($line = fgets($fp, 1024)) !== false) {
                $out .= $line;
                if (strlen($line) < 4 || $line[3] !== '-') {
                    break;
                }
            }
            return $out;
        };
        $cmd = static function (string $c) use ($fp, $read): string {
            fwrite($fp, $c . "\r\n");
            return $read();
        };
        $ok = static fn (string $r, string $code): bool => str_starts_with($r, $code);

        try {
            $read();
            if (!$ok($cmd("EHLO powerplus"), '250')) throw new \RuntimeException('EHLO');
            if ($port !== 465) {
                if (!$ok($cmd('STARTTLS'), '220')) throw new \RuntimeException('STARTTLS');
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new \RuntimeException('TLS');
                if (!$ok($cmd("EHLO powerplus"), '250')) throw new \RuntimeException('EHLO2');
            }
            if ($user !== '') {
                if (!$ok($cmd('AUTH LOGIN'), '334')) throw new \RuntimeException('AUTH');
                if (!$ok($cmd(base64_encode($user)), '334')) throw new \RuntimeException('USER');
                if (!$ok($cmd(base64_encode($pass)), '235')) throw new \RuntimeException('PASS');
            }
            if (!$ok($cmd("MAIL FROM:<{$from}>"), '250')) throw new \RuntimeException('FROM');
            if (!$ok($cmd("RCPT TO:<{$to}>"), '250')) throw new \RuntimeException('RCPT');
            if (!$ok($cmd('DATA'), '354')) throw new \RuntimeException('DATA');

            $enc = static fn (string $s): string => '=?UTF-8?B?' . base64_encode($s) . '?=';
            $boundary = 'pp' . bin2hex(random_bytes(8));
            $headers = [
                "From: {$enc($fromName)} <{$from}>",
                "To: <{$to}>",
                "Subject: {$enc($subject)}",
                'MIME-Version: 1.0',
                'Date: ' . date(DATE_RFC2822),
            ];
            if ($html === null) {
                $headers[] = 'Content-Type: text/plain; charset=UTF-8';
                $headers[] = 'Content-Transfer-Encoding: base64';
                $body = chunk_split(base64_encode($text));
            } else {
                $headers[] = "Content-Type: multipart/alternative; boundary=\"{$boundary}\"";
                $body = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                    . chunk_split(base64_encode($text))
                    . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                    . chunk_split(base64_encode($html))
                    . "--{$boundary}--\r\n";
            }
            $msg = implode("\r\n", $headers) . "\r\n\r\n" . $body;
            $msg = preg_replace('/^\./m', '..', $msg) ?? $msg;
            fwrite($fp, $msg . "\r\n.\r\n");
            if (!$ok($read(), '250')) throw new \RuntimeException('END');
            $cmd('QUIT');
            return true;
        } catch (\RuntimeException $e) {
            error_log('[pp-mail] ' . $e->getMessage());
            return false;
        } finally {
            fclose($fp);
        }
    }
}
