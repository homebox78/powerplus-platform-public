<?php
declare(strict_types=1);

/**
 * GET /api/files/{id}?exp=&sig=  — 공개 버킷 자산만 서명 검증 후 스트리밍. private 은 404 (원본 미노출, CLAUDE.md 개발 원칙 3)
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Signer;

$router->get('/api/files/{id}', static function (array $p): void {
    $id = (int) $p['id'];
    $exp = (int) ($_GET['exp'] ?? 0);
    $sig = (string) ($_GET['sig'] ?? '');
    if ($id <= 0 || !Signer::verify($id, $exp, $sig)) {
        Response::error(403, 'BAD_SIGNATURE', '서명이 유효하지 않거나 만료되었습니다.');
    }
    $a = Db::row('SELECT bucket, `key`, mime, bytes, visibility FROM assets WHERE id = ?', [$id]);
    if ($a === null || $a['visibility'] !== 'public') {
        Response::error(404, 'NOT_FOUND', '파일을 찾을 수 없습니다.');
    }
    $root = rtrim((string) Config::get('storage.dir', __DIR__ . '/../../storage'), '/\\');
    $path = $root . '/' . $a['bucket'] . '/' . $a['key'];
    if (!is_file($path)) {
        Response::error(404, 'NOT_FOUND', '파일이 없습니다.');
    }
    header('Content-Type: ' . $a['mime']);
    header('Content-Length: ' . (string) filesize($path));
    header('Cache-Control: private, max-age=' . max(0, $exp - time()));
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
});

// 모든 화면 다운로드 (Mobbin "Download all screens" PRO, 2026-09-24): 게시된 화면 공개본을 zip 하나로.
// Pro(design_data=full)·관리자만. 파일 이름 = 기기_순번_화면제목.webp, 공개본만(원본 미노출 원칙 유지).
$router->get('/api/sites/{slug}/screens.zip', static function (array $p): void {
    $slug = (string) $p['slug'];
    if (preg_match('/^[a-z0-9-]{1,100}$/', $slug) !== 1) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $plan = \Homebox\Plan::current();
    if (($plan['limits']['design_data'] ?? 'summary') !== 'full') {
        Response::error(402, 'UPGRADE_REQUIRED', '모든 화면 다운로드는 Pro 에서 이용할 수 있습니다.');
    }
    $site = Db::row("SELECT id, title FROM sites WHERE slug = ? AND status = 'published'", [$slug]);
    if ($site === null) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $rows = Db::rows("SELECT s.device, s.title, a.bucket, a.`key`, a.mime FROM screens s JOIN assets a ON a.id = s.public_asset_id
                     WHERE s.site_id = ? AND s.status = 'published' AND a.visibility = 'public' ORDER BY s.device, s.sort, s.id", [$site['id']]);
    if ($rows === []) {
        Response::error(404, 'NOT_FOUND', '다운로드할 화면이 없습니다.');
    }
    $root = rtrim((string) Config::get('storage.dir', __DIR__ . '/../../storage'), '/\\');
    $tmp = tempnam(sys_get_temp_dir(), 'hbzip');
    $zip = new ZipArchive();
    if ($tmp === false || $zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
        Response::error(500, 'ZIP_FAILED', '압축 파일을 만들지 못했습니다.');
    }
    $n = ['pc' => 0, 'mobile' => 0];
    foreach ($rows as $r) {
        $path = $root . '/' . $r['bucket'] . '/' . $r['key'];
        if (!is_file($path)) {
            continue;
        }
        $dev = $r['device'] === 'mobile' ? 'mobile' : 'pc';
        $n[$dev]++;
        $name = preg_replace('~[\\\\/:*?"<>|\s]+~u', '_', (string) ($r['title'] ?: 'screen')) ?? 'screen';
        $ext = pathinfo((string) $r['key'], PATHINFO_EXTENSION) ?: 'webp';
        $zip->addFile($path, sprintf('%s/%02d_%s.%s', $dev, $n[$dev], mb_substr($name, 0, 60), $ext));
        $zip->setCompressionName(sprintf('%s/%02d_%s.%s', $dev, $n[$dev], mb_substr($name, 0, 60), $ext), ZipArchive::CM_STORE);
    }
    $zip->close();
    $fname = $slug . '-screens.zip';
    header('Content-Type: application/zip');
    header('Content-Length: ' . (string) filesize($tmp));
    header('Content-Disposition: attachment; filename="' . $fname . '"; filename*=UTF-8\'\'' . rawurlencode($site['title'] . '-화면.zip'));
    header('Cache-Control: private, no-store');
    readfile($tmp);
    @unlink($tmp);
    exit;
});
