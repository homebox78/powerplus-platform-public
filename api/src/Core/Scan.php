<?php
/**
 * 업로드 바이러스 검사 대기열(SEC-011).
 *  - 업로드 경로(장표 원본·맥락 자료·로고·프로필 사진·관리자 에셋)가 queue() 한 줄로 파일을 등록한다.
 *  - 실제 검사는 api/bin/scan-queue.php 크론이 clamscan 을 배치로 돈다(요청 안에서 검사하면 수십 초가 걸려 안 한다).
 *  - 설정 security.scan.enabled 가 꺼져 있으면 queue() 는 아무 일도 하지 않는다 — 로컬·ClamAV 없는 서버에서 조용히 통과.
 * 왜 대기열인가: 서버 RAM 이 4GB 라 clamd 를 상주시키지 않고, 한 번 띄운 clamscan 에 파일 여러 개를 한꺼번에 넘긴다.
 */
declare(strict_types=1);

namespace Pp\Core;

final class Scan
{
    public const KINDS = ['deck_source', 'deck_doc', 'brand', 'avatar', 'asset'];

    public static function enabled(): bool
    {
        return (bool) Config::get('security.scan.enabled', false);
    }

    /** 검사 대기열에 넣는다. 실패해도 업로드는 막지 않는다(기록만). */
    public static function queue(string $path, string $kind, ?string $refId = null, ?int $userId = null): void
    {
        if (!self::enabled() || !in_array($kind, self::KINDS, true)) return;
        try {
            Db::exec('INSERT INTO core_scan_queue (path, kind, ref_id, user_id) VALUES (?,?,?,?)',
                [mb_substr($path, 0, 1024), $kind, $refId !== null ? mb_substr($refId, 0, 64) : null, $userId]);
        } catch (\Throwable $e) {
            error_log('[scan] queue 실패: ' . $e->getMessage());
        }
    }

    /** clamscan 출력에서 감염 줄(`경로: 이름 FOUND`)만 뽑는다 — path => 바이러스 이름 */
    public static function found(array $out): array
    {
        $infected = [];
        foreach ($out as $line) {
            if (preg_match('/^(.*): (.+) FOUND$/', (string) $line, $m)) $infected[$m[1]] = $m[2];
        }
        return $infected;
    }

    /**
     * 파일 묶음을 검사해 나눈다 — clean / infected(path=>이름) / errors(path=>사유) / global(전체 실패 사유 또는 null).
     * $run(array $paths): [int $code, string[] $out]. clamscan 종료 코드: 0 깨끗 · 1 감염 · 2 이상 오류.
     *
     * 2026-10-18 전수조사 B: 예전엔 묶음 하나가 코드 2 면(파일 하나를 못 읽어도 2) FOUND 줄까지 통째로 버리고 전부 pending 으로 남겨,
     * 감염 파일이 격리되지 않고 10분마다 같은 묶음이 또 실패해 뒤 업로드 검사가 영영 멈췄다.
     * 이제: 코드 2 면 FOUND 는 그대로 쓰고, 나머지를 한 장씩 다시 검사해 오류 난 파일만 errors 로 뺀다.
     * 한 장씩도 전부 오류면(설치 안 됨·DB 없음) global 로 알려 대기열을 그대로 둔다(다음 회차에 다시).
     */
    public static function classify(callable $run, array $paths): array
    {
        $paths = array_values(array_unique(array_map('strval', $paths)));
        $res = ['clean' => [], 'infected' => [], 'errors' => [], 'global' => null];
        if (!$paths) return $res;
        [$code, $out] = $run($paths);
        $out = array_map('strval', (array) $out);
        $res['infected'] = self::found($out);
        if ($code === 0 || $code === 1) {
            foreach ($paths as $p) if (!isset($res['infected'][$p])) $res['clean'][] = $p;
            return $res;
        }
        // 묶음 오류 — 감염으로 이미 나온 것은 두고 나머지를 한 장씩
        $rest = array_values(array_filter($paths, static fn(string $p): bool => !isset($res['infected'][$p])));
        $lastMsg = mb_substr(implode(' | ', $out), 0, 250);
        foreach ($rest as $p) {
            [$c, $o] = $run([$p]);
            $o = array_map('strval', (array) $o);
            if ($c === 0) { $res['clean'][] = $p; continue; }
            if ($c === 1 && ($f = self::found($o))) { $res['infected'] += $f; continue; }
            $res['errors'][$p] = $lastMsg = mb_substr(implode(' | ', $o) ?: "code $c", 0, 250);
        }
        if ($rest && count($res['errors']) === count($rest) && !$res['clean'] && !$res['infected']) {
            $res['global'] = $lastMsg !== '' ? $lastMsg : "code $code";
            $res['errors'] = [];
        }
        return $res;
    }

    /** 이 파일(참조)에 감염 판정이 있나 — 화면에서 경고를 띄울 때 */
    public static function infected(string $kind, string $refId): bool
    {
        try {
            return (int) Db::val("SELECT COUNT(*) FROM core_scan_queue WHERE kind = ? AND ref_id = ? AND status = 'infected'", [$kind, $refId]) > 0;
        } catch (\Throwable) {
            return false;
        }
    }
}
