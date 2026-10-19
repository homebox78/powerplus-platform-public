<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 그림 보고 고르기 — Jev 1.14 가 후보 그림을 직접 보고, 글로 준 문맥(사업 설명·슬라이드 문장·검색어)에 맞는 순서를 매긴다.
 * 2026-10-19 시험(api/bin/jev-compare.php): 후보 아이콘 6장 중 문맥에 맞는 것 10/10, 로고 그림↔이름 27/30. 한 번에 약 0.6초·$0.0005(그림 12장).
 * 쓰는 곳: powerMock 목업 사진 자리(MockSamples::rank) · powerDeck 장표 아이콘(Triage::assetPick) · powerMCP 검색 결과 다시 고르기(Service::rerank).
 * Jev 원칙 그대로 — 실패·상한·꺼짐이면 null, 부른 쪽은 원래 순서로.
 */
final class Pick
{
    /** 한 번에 보일 후보 수 상한(요청 크기·시간) */
    public const MAX = 16;

    /**
     * 그림 파일 → Jev 그림 조각. PNG·JPEG·WebP 를 읽어 긴 변 480 JPEG 로, 짧은 변이 280 보다 작으면 회색 여백을 붙인다
     * (Jev 는 한 변 256 이상·전체 78,400px 이상만 받는다 — 256×256 은 400).
     */
    public static function imagePart(string $path): ?array
    {
        if (!is_file($path)) {
            return null;
        }
        $raw = (string) @file_get_contents($path);
        $im = @imagecreatefromstring($raw);
        if (!$im) {
            return null;
        }
        $w = imagesx($im);
        $h = imagesy($im);
        $s = 480 / max($w, $h);
        $nw = max(1, (int) round($w * $s));
        $nh = max(1, (int) round($h * $s));
        $cw = max(280, $nw);
        $ch = max(280, $nh);
        $out = imagecreatetruecolor($cw, $ch);
        imagefill($out, 0, 0, imagecolorallocate($out, 154, 154, 154));   // 투명 그림(아이콘·로고)은 중간 회색 위 — 흰·검정 모두 보이게
        imagecopyresampled($out, $im, intdiv($cw - $nw, 2), intdiv($ch - $nh, 2), 0, 0, $nw, $nh, $w, $h);
        ob_start();
        imagejpeg($out, null, 82);
        $jpg = (string) ob_get_clean();
        return ['type' => 'image_url', 'image_url' => ['url' => 'data:image/jpeg;base64,' . base64_encode($jpg)]];
    }

    /**
     * 후보를 문맥에 맞는 순서로. [id => 그림 경로] — 그림을 못 읽은 후보는 원래 자리(뒤쪽)에 남는다.
     * @param array<string,string> $cands
     * @param array<string,string> $labels 후보마다 붙일 짧은 글(이름·종류) — 그림과 함께 보인다
     * @return array{order:list<string>, top:string, confidence:float}|null
     */
    public static function rank(string $task, string $context, array $cands, string $instructions, array $labels = [], ?string $ref = null): ?array
    {
        $cands = array_slice($cands, 0, self::MAX, true);
        if (count($cands) < 2) {
            return null;
        }
        $crit = [];
        $map = [];
        foreach ($cands as $id => $path) {
            $img = self::imagePart($path);
            if ($img === null) {
                continue;
            }
            $k = 'c' . count($crit);
            $crit[$k] = [($labels[$id] ?? '') !== '' ? mb_substr((string) $labels[$id], 0, 80) : "후보 {$k}", $img];
            $map[$k] = (string) $id;
        }
        if (count($crit) < 2) {
            return null;
        }
        $a = Jev::ask($task, Triage::scrub($context, 1500), ['pick' => ['type' => 'choice', 'instructions' => $instructions, 'criteria' => $crit]], $ref, 20);
        $p = $a['pick'] ?? null;
        if (!is_array($p) || !isset($map[(string) ($p['choice'] ?? '')])) {
            return null;
        }
        $prob = array_map('floatval', (array) ($p['probabilities'] ?? []));
        arsort($prob);
        $order = [];
        foreach (array_keys($prob) as $k) {
            if (isset($map[$k])) {
                $order[] = $map[$k];
            }
        }
        foreach ($cands as $id => $_) {   // 그림을 못 읽었거나 확률이 빠진 후보는 뒤에
            if (!in_array((string) $id, $order, true)) {
                $order[] = (string) $id;
            }
        }
        return ['order' => $order, 'top' => $map[(string) $p['choice']], 'confidence' => (float) ($p['confidence'] ?? 0)];
    }
}
