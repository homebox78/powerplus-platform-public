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
