<?php
declare(strict_types=1);

/**
 * 사용자 평가 (S14 일부, 2026-09-24): 사이트당 사용자 1건, 디자인·접근성·UX 각 1~5.
 *   GET  /api/sites/{slug}/rating            {avg, count, breakdown{design,a11y,ux}, mine{design,a11y,ux,comment}|null}
 *   POST /api/sites/{slug}/rating {design,a11y,ux,comment?}  업서트 → sites.rating_avg/count/breakdown 재계산
 * 평균은 세 항목 평균의 평균. MCP search_sites 기본 정렬(rating)과 종합평가 "사용자 평가" 축이 이 값을 쓴다.
 * @var Homebox\Http\Router $router
 */

use Homebox\Auth\Session;
use Homebox\Db;
use Homebox\Http\Response;

$siteBySlug = static function (string $slug): array {
    if (preg_match('/^[a-z0-9-]{1,100}$/', $slug) !== 1) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $s = Db::row("SELECT id, rating_avg, rating_count, rating_breakdown FROM sites WHERE slug = ? AND status = 'published'", [$slug]);
    if ($s === null) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    return $s;
};
$recalc = static function (int $siteId): array {
    $a = Db::row('SELECT COUNT(*) AS n, AVG(design) AS d, AVG(a11y) AS a, AVG(ux) AS u FROM ratings WHERE site_id = ?', [$siteId]);
    $n = (int) ($a['n'] ?? 0);
    $bd = $n > 0 ? ['design' => round((float) $a['d'], 2), 'a11y' => round((float) $a['a'], 2), 'ux' => round((float) $a['u'], 2)] : null;
    $avg = $bd ? round(($bd['design'] + $bd['a11y'] + $bd['ux']) / 3, 2) : null;
    Db::exec('UPDATE sites SET rating_avg = ?, rating_count = ?, rating_breakdown = ? WHERE id = ?', [$avg, $n, $bd ? json_encode($bd) : null, $siteId]);
    return ['avg' => $avg, 'count' => $n, 'breakdown' => $bd];
};

$router->get('/api/sites/{slug}/rating', static function (array $p) use ($siteBySlug): void {
    $s = $siteBySlug((string) $p['slug']);
    $u = Session::user();
    $mine = $u ? Db::row('SELECT design, a11y, ux, comment FROM ratings WHERE site_id = ? AND user_id = ?', [$s['id'], $u['id']]) : null;
    Response::json([
        'avg' => $s['rating_avg'] === null ? null : (float) $s['rating_avg'], 'count' => (int) $s['rating_count'],
        'breakdown' => !empty($s['rating_breakdown']) ? json_decode((string) $s['rating_breakdown'], true) : null,
        'mine' => $mine ? ['design' => (int) $mine['design'], 'a11y' => (int) $mine['a11y'], 'ux' => (int) $mine['ux'], 'comment' => $mine['comment']] : null,
        // 후기(평점 요약 모달, 2026-09-24): 코멘트 있는 최근 20건. 이름은 첫 글자만 보이게(개인정보)
        'reviews' => array_map(static function (array $r): array {
            $name = trim((string) ($r['name'] ?? '')) ?: '회원';
            return ['name' => mb_substr($name, 0, 1) . str_repeat('*', max(1, min(3, mb_strlen($name) - 1))), 'score' => round(((int) $r['design'] + (int) $r['a11y'] + (int) $r['ux']) / 3, 1), 'comment' => (string) $r['comment'], 'date' => substr((string) $r['updated_at'], 0, 10)];
        }, Db::rows("SELECT u.name, r.design, r.a11y, r.ux, r.comment, r.updated_at FROM ratings r JOIN users u ON u.id = r.user_id WHERE r.site_id = ? AND r.comment IS NOT NULL AND r.comment <> '' ORDER BY r.updated_at DESC LIMIT 20", [$s['id']])),
    ], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/sites/{slug}/rating', static function (array $p) use ($siteBySlug, $recalc): void {
    $u = Session::user();
    if ($u === null) {
        Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    $s = $siteBySlug((string) $p['slug']);
    $b = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $v = [];
    foreach (['design', 'a11y', 'ux'] as $k) {
        $n = (int) ($b[$k] ?? 0);
        if ($n < 1 || $n > 5) {
            Response::error(422, 'INVALID_RATING', 'design·a11y·ux 는 1~5 사이여야 합니다.');
        }
        $v[$k] = $n;
    }
    $comment = trim((string) ($b['comment'] ?? ''));
    $comment = $comment === '' ? null : mb_substr($comment, 0, 500);
    Db::exec(
        'INSERT INTO ratings (site_id, user_id, design, a11y, ux, comment) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE design = VALUES(design), a11y = VALUES(a11y), ux = VALUES(ux), comment = VALUES(comment)',
        [$s['id'], $u['id'], $v['design'], $v['a11y'], $v['ux'], $comment],
    );
    $agg = $recalc((int) $s['id']);
    Response::json($agg + ['mine' => $v + ['comment' => $comment]], 200, ['Cache-Control' => 'no-store']);
});
