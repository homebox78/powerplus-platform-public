<?php
/**
 * 중복 에셋 합치기(서버 CLI 전용, 2026-10-16 — 사용자 "자산 전체" 중복 정리).
 * 쌍마다 지울 쪽(drop)의 태그(키워드·kind·use·target·style)를 남길 쪽(keep)에 없는 것만 옮겨 붙이고, drop 을 소프트 삭제한다.
 * 그냥 지우면 drop 에만 있던 검색 키워드가 사라진다 — 사진 중복은 옛 등록본에 키워드 50개, 홈박스 이관본에 목업용 kind·use 가 따로 있었다.
 * 삭제 처리는 asset-delete.php·관리자 DELETE 와 같다(deleted_at → 세트 item_count → 감사 기록). 파일은 그대로라 휴지통에서 복원된다.
 * 입력 JSON: {"reason": "...", "pairs": [{"keep": <public_id>, "drop": <public_id>, "auto": true?}]}
 *   auto 면 kind·use·target 태그가 더 많은 쪽을 남긴다(목업이 쓰는 사진 쪽).
 *   미리보기: php8.4 /var/www/platform/api/bin/asset-merge.php pairs.json --dry
 *   실행:     php8.4 /var/www/platform/api/bin/asset-merge.php pairs.json
 * 웹에서는 실행되지 않는다(CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Audit;
use Pp\Core\Db;

$file = $argv[1] ?? '';
$dry = in_array('--dry', $argv, true);
if ($file === '' || !is_file($file)) {
    fwrite(STDERR, "JSON 파일 경로가 필요합니다\n");
    exit(1);
}
$data = json_decode((string) file_get_contents($file), true);
$reason = trim((string) ($data['reason'] ?? ''));
$pairs = is_array($data['pairs'] ?? null) ? $data['pairs'] : [];
if ($reason === '' || !$pairs) {
    fwrite(STDERR, "reason 과 pairs 가 필요합니다\n");
    exit(1);
}

$item = static fn(string $pid): ?array => Db::row('SELECT id, public_id, category, name, set_id, deleted_at FROM asset_items WHERE public_id = ?', [$pid]);
$merged = 0;
$tagsMoved = 0;
$skipped = 0;
// auto: 목업 샘플·용도 태그(kind·use·target)가 붙은 쪽을 남긴다 — 그쪽이 시안·MCP 에 이미 쓰이고 있다. 같으면 keep 그대로.
$usage = static fn(int $id): int => (int) Db::val("SELECT COUNT(*) FROM asset_tags WHERE item_id = ? AND axis IN ('kind','use','target')", [$id]);
foreach ($pairs as $p) {
    $keep = $item((string) ($p['keep'] ?? ''));
    $drop = $item((string) ($p['drop'] ?? ''));
    if (!empty($p['auto']) && $keep && $drop && $usage((int) $drop['id']) > $usage((int) $keep['id'])) {
        [$keep, $drop] = [$drop, $keep];
    }
    if (!$keep || !$drop || $keep['deleted_at'] !== null || $drop['deleted_at'] !== null || $keep['id'] === $drop['id']) {
        $skipped++;   // 없거나 이미 지워졌거나 같은 에셋
        continue;
    }
    $add = (int) Db::val(
        'SELECT COUNT(*) FROM asset_tags d WHERE d.item_id = ? AND NOT EXISTS (SELECT 1 FROM asset_tags k WHERE k.item_id = ? AND k.tag = d.tag AND k.axis = d.axis)',
        [$drop['id'], $keep['id']]
    );
    if (!$dry) {
        Db::exec('INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) SELECT ?, tag, lang, axis FROM asset_tags WHERE item_id = ?', [$keep['id'], $drop['id']]);
        Db::exec('UPDATE asset_items SET deleted_at = NOW(3) WHERE id = ?', [$drop['id']]);
        foreach (array_unique(array_filter([$drop['set_id'], $keep['set_id']])) as $sid) {
            Db::exec('UPDATE asset_sets s SET item_count = (SELECT COUNT(*) FROM asset_items i WHERE i.set_id = s.id AND i.deleted_at IS NULL) WHERE s.id = ?', [(int) $sid]);
        }
        Audit::log(null, 'asset.delete', 'asset:' . $drop['public_id'], ['category' => $drop['category'], 'name' => $drop['name'], 'reason' => $reason, 'merged_into' => $keep['public_id'], 'tags_moved' => $add], null);
    }
    $merged++;
    $tagsMoved += $add;
}

echo ($dry ? '[미리보기] ' : '') . '쌍 ' . count($pairs) . "개 · 합침 {$merged} · 옮긴 태그 {$tagsMoved} · 건너뜀 {$skipped}\n";
