<?php
/**
 * 에셋 소프트 삭제(서버 CLI 전용, 2026-10-16 — 그림 보고 설명 다시 쓰다 찾은 중복·불량 정리).
 * 관리자 화면 DELETE /admin/assets/{id} 와 같은 처리: deleted_at 기록 → 세트 item_count 다시 세기 → 감사 기록(actor 없음).
 * 파일은 그대로라 관리자 화면 휴지통에서 복원된다.
 *   미리보기: php8.4 /var/www/platform/api/bin/asset-delete.php <public_id>... --reason "중복" --dry
 *   실행:     php8.4 /var/www/platform/api/bin/asset-delete.php <public_id>... --reason "중복"
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

$dry = false;
$reason = '';
$ids = [];
for ($i = 1; $i < count($argv); $i++) {
    if ($argv[$i] === '--dry') {
        $dry = true;
    } elseif ($argv[$i] === '--reason' && isset($argv[$i + 1])) {
        $reason = (string) $argv[++$i];
    } else {
        $ids[] = (string) $argv[$i];
    }
}
if (!$ids || $reason === '') {
    fwrite(STDERR, "public_id 와 --reason 이 필요합니다\n");
    exit(1);
}

foreach ($ids as $pid) {
    $x = Db::row('SELECT id, public_id, category, name, set_id, deleted_at FROM asset_items WHERE public_id = ?', [$pid]);
    if (!$x) {
        echo "  {$pid} 없음\n";
        continue;
    }
    if ($x['deleted_at'] !== null) {
        echo "  {$pid} 이미 삭제됨\n";
        continue;
    }
    echo ($dry ? '  [미리보기] ' : '  ') . "{$pid} {$x['category']} 「{$x['name']}」 삭제\n";
    if ($dry) {
        continue;
    }
    Db::exec('UPDATE asset_items SET deleted_at = NOW(3) WHERE id = ?', [$x['id']]);
    if ($x['set_id'] !== null) {
        Db::exec('UPDATE asset_sets s SET item_count = (SELECT COUNT(*) FROM asset_items i WHERE i.set_id = s.id AND i.deleted_at IS NULL) WHERE s.id = ?', [(int) $x['set_id']]);
    }
    Audit::log(null, 'asset.delete', 'asset:' . $x['public_id'], ['category' => $x['category'], 'name' => $x['name'], 'reason' => $reason], null);
}
