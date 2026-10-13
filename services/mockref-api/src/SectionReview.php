<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 관리자 섹션 편집 (사용자 지시 2026-09-26 "관리자는 섹션영역을 움직여서 조정할수있고 이름도 지정할수있게")
 *   · 편집하면 sections 행이 source='review' 가 된다 → 워커 재분해(segment·restructure)가 덮지 않는다.
 *   · 편집마다 section_reviews 에 기록한다 — 운영 편집이 deploy.sh --db(로컬 덤프로 전체 교체)에 사라지지 않게,
 *     배포 전에 운영 기록을 로컬로 가져와 같은 apply() 로 다시 적용한다(api/bin/replay-reviews.php).
 *   · 섹션 크롭(목록 썸네일)은 공개본에서 GD 로 다시 자른다. 쓰기 실패해도 편집은 저장한다(옛 크롭 유지).
 */
final class SectionReview
{
    public const MAX_NAME = 120;

    /** @param array{action:string,screen_id:int,section_id?:int|null,type?:?string,name?:?string,x?:?int,y?:?int,w?:?int,h?:?int} $op  @return int 섹션 id (삭제는 0) */
    public static function apply(array $op, ?int $userId = null, bool $record = true): int
    {
        $screenId = (int) $op['screen_id'];
        $sc = Db::row('SELECT sc.id, sc.viewport_w, sc.full_h, sc.public_asset_id, s.slug FROM screens sc JOIN sites s ON s.id = sc.site_id WHERE sc.id = ?', [$screenId]);
        if ($sc === null) { throw new \InvalidArgumentException('화면을 찾을 수 없습니다.'); }
        $action = (string) $op['action'];
        $sid = isset($op['section_id']) ? (int) $op['section_id'] : 0;
        $type = isset($op['type']) && $op['type'] !== '' ? (string) $op['type'] : null;
        if ($type !== null && Db::row('SELECT id FROM section_types WHERE id = ?', [$type]) === null) { throw new \InvalidArgumentException('알 수 없는 섹션 유형입니다.'); }
        $name = isset($op['name']) ? mb_substr(trim((string) $op['name']), 0, self::MAX_NAME) : null;
        $box = self::box($op, (int) $sc['viewport_w'], (int) $sc['full_h']);

        $cur = $sid > 0 ? Db::row('SELECT id, screen_id, section_type_id, variant, bbox_x, bbox_y, bbox_w, bbox_h FROM sections WHERE id = ?', [$sid]) : null;
        if ($cur !== null && (int) $cur['screen_id'] !== $screenId) { $cur = null; $sid = 0; } // 다른 화면 섹션 id(로컬 재분해로 번호가 겹친 경우) — 새로 만든다
        // 영역 일부만 보내면(y 만) 나머지는 현재 값으로
        if ($cur !== null && $box === null && array_filter(['x' => $op['x'] ?? null, 'y' => $op['y'] ?? null, 'w' => $op['w'] ?? null, 'h' => $op['h'] ?? null], static fn ($v) => $v !== null)) {
            foreach (['x', 'y', 'w', 'h'] as $k) { if (($op[$k] ?? null) === null) { $op[$k] = (int) $cur['bbox_' . $k]; } }
            $box = self::box($op, (int) $sc['viewport_w'], (int) $sc['full_h']);
        }
        // 재적용(replay)이 같은 섹션을 두 번 만들지 않게 — 같은 화면·같은 영역의 검수 섹션이 이미 있으면 그것을 고친다
        if ($cur === null && $box !== null) {
            $same = Db::row("SELECT id, screen_id, section_type_id, variant, bbox_x, bbox_y, bbox_w, bbox_h FROM sections WHERE screen_id = ? AND source = 'review' AND bbox_x = ? AND bbox_y = ? AND bbox_w = ? AND bbox_h = ? LIMIT 1", [$screenId, $box['x'], $box['y'], $box['w'], $box['h']]);
            if ($same !== null) { $cur = $same; $sid = (int) $same['id']; }
        }

        if ($action === 'delete') {
            if ($cur !== null) { Db::exec('DELETE FROM sections WHERE id = ?', [$sid]); }
            if ($record) { self::record($screenId, $sid ?: null, 'delete', null, null, null, $userId); }
            return 0;
        }
        if ($action !== 'update' && $action !== 'add') { throw new \InvalidArgumentException('action 은 update|add|delete 입니다.'); }

        // 섹션끼리 겹칠 수 없다 (사용자 규칙 2026-09-26). 플로팅 퀵메뉴는 본문 위에 떠 있어 예외, 2px 이내는 경계 오차로 본다
        $newType = $type ?? ($cur['section_type_id'] ?? 'unknown');
        if ($box !== null && $newType !== 'floating_quick' && $record) {
            $hit = self::overlapping($screenId, $sid ?: null, $box);
            if ($hit !== null) { throw new \InvalidArgumentException("다른 섹션({$hit})과 겹칩니다. 그 섹션을 먼저 줄이거나 옮기세요."); }
        }
        if ($cur !== null) {
            $b = $box ?? ['x' => (int) $cur['bbox_x'], 'y' => (int) $cur['bbox_y'], 'w' => (int) $cur['bbox_w'], 'h' => (int) $cur['bbox_h']];
            Db::exec(
                "UPDATE sections SET section_type_id = ?, variant = ?, bbox_x = ?, bbox_y = ?, bbox_w = ?, bbox_h = ?, source = 'review', confidence = 1 WHERE id = ?",
                [$type ?? $cur['section_type_id'], $name !== null ? ($name === '' ? null : $name) : $cur['variant'], $b['x'], $b['y'], $b['w'], $b['h'], $sid],
            );
            $id = $sid;
        } else {
            if ($box === null) { throw new \InvalidArgumentException('영역(x·y·w·h)이 필요합니다.'); }
            $b = $box;
            $idCol = $sid > 0 && Db::row('SELECT id FROM sections WHERE id = ?', [$sid]) === null ? 'id, ' : '';
            $params = [$b['x'], $b['y'], $b['w'], $b['h']];
            Db::exec(
                "INSERT INTO sections ({$idCol}screen_id, section_type_id, variant, bbox_x, bbox_y, bbox_w, bbox_h, confidence, source, sort)
                 VALUES (" . ($idCol ? '?, ' : '') . "?, ?, ?, ?, ?, ?, ?, 1, 'review', ?)",
                array_merge($idCol ? [$sid] : [], [$screenId, $type ?? 'unknown', $name ?: null], $params, [$b['y']]),
            );
            $id = $idCol ? $sid : (int) Db::pdo()->lastInsertId();
        }
        if ($record) { self::record($screenId, $id, $cur !== null ? 'update' : 'add', $type, $name, $box, $userId); }
        if ($box !== null || $cur === null) { self::crop($id, (int) $sc['public_asset_id'], (string) $sc['slug'], $screenId, $b); }
        return $id;
    }

    /** 겹치는 다른 섹션 이름(없으면 null) — 2px 이내 겹침은 무시 */
    public static function overlapping(int $screenId, ?int $selfId, array $b): ?string
    {
        foreach (Db::rows("SELECT x.id, x.variant, st.name_ko, x.bbox_x, x.bbox_y, x.bbox_w, x.bbox_h FROM sections x JOIN section_types st ON st.id = x.section_type_id WHERE x.screen_id = ? AND x.section_type_id NOT IN ('floating_quick','skip_nav')", [$screenId]) as $o) {
            if ($selfId !== null && (int) $o['id'] === $selfId) { continue; }
            $ox = min($b['x'] + $b['w'], (int) $o['bbox_x'] + (int) $o['bbox_w']) - max($b['x'], (int) $o['bbox_x']);
            $oy = min($b['y'] + $b['h'], (int) $o['bbox_y'] + (int) $o['bbox_h']) - max($b['y'], (int) $o['bbox_y']);
            if ($ox > 2 && $oy > 2) { return (string) ($o['variant'] ?: $o['name_ko']); }
        }
        return null;
    }

    /** @return array{x:int,y:int,w:int,h:int}|null  화면 안으로 자른 영역 */
    private static function box(array $op, int $vw, int $fh): ?array
    {
        if (!isset($op['x'], $op['y'], $op['w'], $op['h'])) { return null; }
        $x = max(0, min($vw - 20, (int) $op['x']));
        $y = max(0, min($fh - 20, (int) $op['y']));
        $w = max(20, min($vw - $x, (int) $op['w']));
        $h = max(20, min($fh - $y, (int) $op['h']));
        return ['x' => $x, 'y' => $y, 'w' => $w, 'h' => $h];
    }

    private static function record(int $screenId, ?int $sid, string $action, ?string $type, ?string $name, ?array $b, ?int $userId): void
    {
        Db::exec(
            'INSERT INTO section_reviews (screen_id, section_id, action, type, name, bbox_x, bbox_y, bbox_w, bbox_h, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$screenId, $sid, $action, $type, $name, $b['x'] ?? null, $b['y'] ?? null, $b['w'] ?? null, $b['h'] ?? null, $userId],
        );
    }

    /** 공개본에서 섹션 크롭을 다시 만든다 — 워커 thumb 와 같은 규격(폭 1200 이하 WebP), 같은 키 */
    private static function crop(int $sectionId, int $publicAssetId, string $slug, int $screenId, array $b): void
    {
        try {
            $a = Db::row('SELECT bucket, `key` FROM assets WHERE id = ?', [$publicAssetId]);
            if ($a === null || !function_exists('imagecreatefromwebp')) { return; }
            $root = rtrim((string) \Config::get('storage.dir', __DIR__ . '/../../storage'), '/\\');
            $src = $root . '/' . $a['bucket'] . '/' . $a['key'];
            if (!is_file($src)) { return; }
            @ini_set('memory_limit', '1024M');
            $im = @imagecreatefromwebp($src);
            if ($im === false) { return; }
            $W = imagesx($im); $H = imagesy($im);
            $x = max(0, min($W - 1, $b['x'])); $y = max(0, min($H - 1, $b['y']));
            $w = max(1, min($W - $x, $b['w'])); $h = max(1, min($H - $y, $b['h'], 4000));
            $ow = min(1200, $w); $oh = max(1, (int) round($h * $ow / $w));
            $out = imagecreatetruecolor($ow, $oh);
            imagecopyresampled($out, $im, 0, 0, $x, $y, $ow, $oh, $w, $h);
            unset($im);
            $key = "sites/{$slug}/screens/{$screenId}/sections/{$sectionId}.webp";
            $dst = $root . '/homebox-public/' . $key;
            if (!is_dir(dirname($dst)) && !@mkdir(dirname($dst), 0775, true)) { unset($out); return; }
            $ok = @imagewebp($out, $dst, 82);
            unset($out);
            if (!$ok) { return; }
            Db::exec(
                "INSERT INTO assets (bucket, `key`, mime, width, height, bytes, visibility) VALUES ('homebox-public', ?, 'image/webp', ?, ?, ?, 'public')
                 ON DUPLICATE KEY UPDATE width = VALUES(width), height = VALUES(height), bytes = VALUES(bytes)",
                [$key, $ow, $oh, (int) filesize($dst)],
            );
            $aid = Db::row("SELECT id FROM assets WHERE bucket = 'homebox-public' AND `key` = ?", [$key]);
            if ($aid !== null) { Db::exec('UPDATE sections SET crop_asset_id = ? WHERE id = ?', [(int) $aid['id'], $sectionId]); }
        } catch (\Throwable $e) {
            error_log('SectionReview crop ' . $sectionId . ': ' . $e->getMessage()); // 크롭 실패가 편집을 막지 않는다
        }
    }
}
