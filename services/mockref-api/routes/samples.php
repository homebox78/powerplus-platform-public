<?php
declare(strict_types=1);

/**
 * 샘플 이미지 라이브러리 (2026-09-25) — 목업의 사진·배너 자리에 넣는 홈박스 자체 제작 이미지.
 *  GET /api/samples?kind=&section_type=&tags=&limit=&seed=   목록(검색)
 *  GET /api/samples/file/{file}                               옛 주소 → powerAssets 파일로 301 (원본은 powerAssets)
 * @var Homebox\Http\Router $router
 */

use Homebox\Http\Response;
use Homebox\Samples;

$router->get('/api/samples', static function (): void {
    $split = static fn (string $k): array => array_values(array_filter(array_map('trim', explode(',', (string) ($_GET[$k] ?? ''))), 'strlen'));
    $kinds = $split('kind');
    $st = trim((string) ($_GET['section_type'] ?? ''));
    if ($kinds === [] && $st !== '') {
        $kinds = Samples::FOR_SECTION[$st] ?? [];
    }
    // org_name·org_type 을 주면 그 가상 기관 기준으로 거른다(대학 요청에 시청 문구 배너가 섞이지 않게, 2026-10-12)
    if (trim((string) ($_GET['org_name'] ?? '')) !== '' || trim((string) ($_GET['org_type'] ?? '')) !== '') {
        Samples::context(Homebox\SampleContent::persona((string) ($_GET['org_type'] ?? ''), (string) ($_GET['org_name'] ?? ''))['org']);
    }
    $items = Samples::find($kinds, $split('tags'), max(1, min(40, (int) ($_GET['limit'] ?? 12))), (int) ($_GET['seed'] ?? 0));
    $counts = [];
    foreach (Samples::all() as $it) { $counts[$it['kind']] = ($counts[$it['kind']] ?? 0) + 1; }
    Response::json([
        'count' => count($items), 'library' => $counts,
        'items' => array_map([Samples::class, 'view'], $items),
        'usage' => '홈박스가 만든 가상 인물·풍경이다(실존 인물·기관 아님). 목업·시안에 자유롭게 쓰되 실서비스 게시 전에는 실제 사진으로 교체한다. 글자를 얹을 쪽은 text_safe.side, scrim=true 면 그 쪽에 어두운 그라데이션을 깐다.',
    ], 200, ['Cache-Control' => 'public, max-age=300']);
});

$router->get('/api/samples/file/{file}', static function (array $p): void {
    // 옛 주소(이미 게시된 시안이 쓴다) → powerAssets 파일로 넘긴다. 파일 사본은 더 이상 두지 않는다(2026-10-11).
    $file = basename((string) $p['file']);
    if (!preg_match('/^([a-z0-9-]+?)(\.thumb)?\.webp$/', $file, $m)) {
        Response::error(404, 'NOT_FOUND', '파일이 없습니다.');
    }
    foreach (Samples::all() as $it) {
        if (($it['id'] ?? '') === $m[1]) {
            header('Location: ' . Samples::url((string) (($m[2] ?? '') !== '' ? $it['thumb'] : $it['file'])), true, 301);
            header('Cache-Control: public, max-age=604800');
            header('Access-Control-Allow-Origin: *');
            exit;
        }
    }
    Response::error(404, 'NOT_FOUND', '파일이 없습니다.');
});
