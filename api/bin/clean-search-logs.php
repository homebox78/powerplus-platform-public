<?php
/**
 * 검색 기록에서 이상한 검색어(이모지·기호만, 태그·스크립트, SQL 주입 꼴)를 지운다 — 서버 CLI 전용.
 * 기준은 Assets\Service::isJunkQuery 하나(새 검색은 같은 규칙으로 아예 기록하지 않는다).
 *   미리보기: php8.4 api/bin/clean-search-logs.php --dry
 *   실행:     php8.4 api/bin/clean-search-logs.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Assets\Service;
use Pp\Core\Db;

$dry = in_array('--dry', $argv, true);
$junk = [];
foreach (Db::rows('SELECT DISTINCT q FROM asset_search_logs') as $r) {
    if (Service::isJunkQuery((string) $r['q'])) {
        $junk[] = (string) $r['q'];
    }
}
$n = 0;
foreach ($junk as $q) {
    echo ($dry ? '[미리보기] ' : '') . $q . "\n";
    if (!$dry) {
        $n += Db::exec('DELETE FROM asset_search_logs WHERE q = ?', [$q]);
    }
}
echo ($dry ? '대상 검색어 ' : '지운 행 ') . ($dry ? count($junk) : $n) . "\n";
