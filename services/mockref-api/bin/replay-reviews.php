<?php
declare(strict_types=1);
/**
 * 운영 section_reviews(관리자 섹션 편집 기록)를 로컬 sections 에 다시 적용한다 — deploy.sh --db 가 덤프 직전에 부른다.
 * 입력: 탭 구분 파일(id, screen_id, section_id, action, type, name, bbox_x, bbox_y, bbox_w, bbox_h), 오래된 순.
 * 전부 절대값이라 매번 전체를 다시 돌려도 결과가 같다. 로컬에 없는 화면은 건너뛴다.
 * 사용: php api/bin/replay-reviews.php reviews.tsv
 */
require __DIR__ . '/../src/bootstrap.php';

$file = $argv[1] ?? '';
if ($file === '' || !is_file($file)) { fwrite(STDERR, "파일이 없습니다: $file\n"); exit(1); }
$n = $skip = $err = 0;
foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $c = explode("\t", $line);
    if (count($c) < 10) { continue; }
    $v = static fn (string $s) => $s === 'NULL' || $s === '\N' ? null : $s;
    [$id, $screen, $section, $action, $type, $name, $x, $y, $w, $h] = array_map($v, $c);
    if (\Homebox\Db::row('SELECT id FROM screens WHERE id = ?', [(int) $screen]) === null) { $skip++; continue; }
    try {
        \Homebox\SectionReview::apply([
            'action' => (string) $action, 'screen_id' => (int) $screen, 'section_id' => $section !== null ? (int) $section : null,
            'type' => $type, 'name' => $name, 'x' => $x !== null ? (int) $x : null, 'y' => $y !== null ? (int) $y : null, 'w' => $w !== null ? (int) $w : null, 'h' => $h !== null ? (int) $h : null,
        ], null, false);
        $n++;
    } catch (\Throwable $e) { $err++; fwrite(STDERR, "#$id: " . $e->getMessage() . "\n"); }
}
echo "section_reviews 재적용 $n · 화면 없음 $skip · 오류 $err\n";
