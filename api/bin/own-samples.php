<?php
/**
 * 목업 샘플 파일을 powerAssets 소유 경로로 옮긴다(서버 CLI, 2026-10-11 사용자 "모든 에셋은 파워에셋에 귀속").
 * 옛 홈박스 샘플 폴더(legacy-homebox/homebox-public/samples — 서버에선 mockref 폴더로 가는 링크)에 기대던 core_files 를
 * assets/samples-hb/<파일> 로 복사하고 bucket·path 를 바꾼다. 원본은 지우지 않는다(정리는 확인 뒤 따로).
 *   미리보기: php8.4 api/bin/own-samples.php
 *   실행:     php8.4 api/bin/own-samples.php apply
 * 멱등 — 이미 옮긴 행은 다시 고르지 않는다.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Config;
use Pp\Core\Db;

$apply = ($argv[1] ?? '') === 'apply';
$root = rtrim((string) Config::get('storage.dir'), '/\\');
$rows = Db::rows("SELECT id, bucket, path FROM core_files WHERE bucket = 'legacy-homebox' AND path LIKE 'homebox-public/samples/%'");
$ok = 0; $miss = 0;
foreach ($rows as $r) {
    $src = $root . '/' . $r['bucket'] . '/' . $r['path'];
    $name = basename((string) $r['path']);
    $dst = $root . '/assets/samples-hb/' . $name;
    if (!is_file($src) && !is_file($dst)) {
        $miss++;
        fwrite(STDERR, "없음: {$r['path']}\n");
        continue;
    }
    if ($apply) {
        if (!is_dir(dirname($dst))) {
            mkdir(dirname($dst), 0775, true);
        }
        if (!is_file($dst) || filesize($dst) !== filesize($src)) {
            if (!copy($src, $dst)) {
                fwrite(STDERR, "복사 실패: $name\n");
                continue;
            }
        }
        Db::exec("UPDATE core_files SET bucket = 'assets', path = ? WHERE id = ?", ['samples-hb/' . $name, $r['id']]);
    }
    $ok++;
}
echo ($apply ? '옮김' : '옮길 것') . " $ok · 원본 없음 $miss\n";
