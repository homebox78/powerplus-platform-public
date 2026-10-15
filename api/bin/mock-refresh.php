<?php
/**
 * 보관된 시안에 박힌 기본 CSS·동작 스크립트를 지금 판으로 바꾼다(서버 CLI 전용).
 *   php8.4 api/bin/mock-refresh.php [--dry]
 * 시안은 판정 때 <style data-hb-base></style>·<script data-hb-behavior></script> 자리를 그때 파일로 채워 보관한다 —
 * 기본 CSS 를 고쳐도(2026-10-15 넘김 단추 아이콘 중심·펼침판 높이) 이미 만든 시안에는 안 들어갔다.
 * 사용자 "지금 만들어진 모든 목업 시안들에 다 수정 반영" → 보관본(mock_mockups)·갤러리 사본(mock_gallery) 모두.
 * 판정 점수·통과는 건드리지 않는다(공통 부품 갱신일 뿐 시안 배치는 그대로).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;

$dry = in_array('--dry', $argv, true);
$css = (string) file_get_contents(dirname(__DIR__) . '/data/hb-base.css');
$js = (string) file_get_contents(dirname(__DIR__) . '/data/hb-behavior.js');
if ($css === '' || $js === '') {
    fwrite(STDERR, "기본 CSS·동작 스크립트 파일을 읽지 못했습니다.\n");
    exit(1);
}

$fix = static function (string $html) use ($css, $js): string {
    $html = (string) preg_replace_callback('/<style\b[^>]*\bdata-hb-base\b[^>]*>.*?<\/style>/is', static fn () => "<style data-hb-base=\"1\">\n" . $css . "\n</style>", $html);
    return (string) preg_replace_callback('/<script\b[^>]*\bdata-hb-behavior\b[^>]*>.*?<\/script>/is', static fn () => "<script data-hb-behavior=\"1\">\n" . $js . "\n</script>", $html);
};

$tally = ['mockups' => 0, 'gallery' => 0, 'same' => 0];
foreach ([['mock_mockups', 'mockups'], ['mock_gallery', 'gallery']] as [$table, $k]) {
    $last = 0;
    while (true) {
        $rows = Db::rows("SELECT id, html FROM {$table} WHERE id > ? ORDER BY id LIMIT 50", [$last]);
        if (!$rows) {
            break;
        }
        foreach ($rows as $r) {
            $last = (int) $r['id'];
            $old = (string) $r['html'];
            $new = $fix($old);
            if ($new === $old) {
                $tally['same']++;
                continue;
            }
            if (!$dry) {
                Db::exec("UPDATE {$table} SET html = ?" . ($table === 'mock_mockups' ? ', bytes = ?' : '') . ' WHERE id = ?',
                    $table === 'mock_mockups' ? [$new, strlen($new), $last] : [$new, $last]);
            }
            $tally[$k]++;
        }
    }
}
echo ($dry ? '[DRY] ' : '') . "갱신: 시안 {$tally['mockups']} · 갤러리 {$tally['gallery']} · 그대로 {$tally['same']}\n";
