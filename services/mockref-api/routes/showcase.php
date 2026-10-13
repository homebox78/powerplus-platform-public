<?php
declare(strict_types=1);

/**
 * 민간 레퍼런스 코너 (2026-10-03 사용자: "관공서 외 다양한 사이트들 모음 … 코너 하나 만들어서 수집",
 *   "사람들의 선호도를 판단하고 그걸 좋은 디자인으로 판단하는 기준", "관공서 디자인을 하는데 자양분이 되길 — 공부의 자료로").
 * 갤러리에서 받은 사실 정보(원본 주소·제목·분류·수상/추천·점수·표 수)와 출처 링크만 보여 준다. 갤러리 캡처·소개 글은 없다.
 *   GET /api/showcase?source=cssda|gdweb|webjangi&sort=pref|new&q=&cursor=   사이트 단위(같은 호스트는 한 줄), 선호 점수 순
 *   GET /api/showcase/debates?sort=votes|new|split&cursor=                    디자이너 A/B 투표
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Auth;
use Homebox\Http\Response;
// 2026-10-03 사용자: "민간코너는 관리자만 볼수있게, 여긴 AI 가 학습하는데 참고로" — 화면·API 는 관리자 전용, 근거는 MCP(선호 규칙)로만 나간다

const SHOWCASE_SOURCES = [
    'cssda' => ['name' => 'CSS Design Awards', 'desc' => '해외 웹 어워드 — 심사위원 점수(UI·UX·혁신)'],
    'gdweb' => ['name' => 'GDWEB', 'desc' => '국내 웹 디자인 어워드 선정작 — 조회 수'],
    'webjangi' => ['name' => '웹장이 PICK', 'desc' => '국내 웹 포트폴리오 추천작 — 좋아요·북마크'],
];

$router->get('/api/showcase', static function (): void {
    Auth::requireAdmin();
    $src = (string) ($_GET['source'] ?? '');
    $sort = ($_GET['sort'] ?? 'pref') === 'new' ? 'new' : 'pref';
    $q = trim((string) ($_GET['q'] ?? ''));
    $limit = 36; $offset = max(0, (int) ($_GET['cursor'] ?? 0));
    $where = ['1 = 1']; $args = [];
    if (isset(SHOWCASE_SOURCES[$src])) { $where[] = 'source = ?'; $args[] = $src; }
    if ($q !== '') { $where[] = '(title LIKE ? OR host LIKE ? OR category LIKE ?)'; array_push($args, "%$q%", "%$q%", "%$q%"); }
    $w = implode(' AND ', $where);
    // 사이트 단위: 같은 호스트의 항목을 묶고, 점수 = 최댓값 + 다른 갤러리에서도 고른 곳마다 +4(최대 99) — Points 와 같은 원장 방식이 아니라 db/scripts/showcase.mjs score 와 같은 식
    $order = $sort === 'new' ? 'last_on DESC, pref DESC' : 'pref DESC, last_on DESC';
    $rows = Db::rows("SELECT host, MAX(title) AS title, MAX(url) AS url,
                             LEAST(99, MAX(pref) + 4 * (COUNT(DISTINCT source) - 1)) AS pref,
                             GROUP_CONCAT(DISTINCT source ORDER BY source) AS sources,
                             MAX(COALESCE(awarded_on, DATE(collected_at))) AS last_on,
                             MAX(category) AS category, MAX(site_id) AS site_id
                        FROM showcase_entries WHERE $w AND pref IS NOT NULL
                       GROUP BY host ORDER BY $order LIMIT " . ($limit + 1) . " OFFSET $offset", $args);
    $more = count($rows) > $limit; $rows = array_slice($rows, 0, $limit);
    $hosts = array_column($rows, 'host');
    $detail = [];
    if ($hosts) {
        $in = implode(',', array_fill(0, count($hosts), '?'));
        foreach (Db::rows("SELECT host, source, title, prize, score, votes, likes, awarded_on, detail_url, pref FROM showcase_entries WHERE host IN ($in) ORDER BY pref DESC", $hosts) as $e) {
            $detail[$e['host']][] = [
                'source' => $e['source'], 'source_name' => SHOWCASE_SOURCES[$e['source']]['name'] ?? $e['source'],
                'prize' => $e['prize'], 'score' => $e['score'] === null ? null : (float) $e['score'],
                'votes' => $e['votes'] === null ? null : (int) $e['votes'], 'likes' => $e['likes'] === null ? null : (int) $e['likes'],
                'awarded_on' => $e['awarded_on'], 'detail_url' => $e['detail_url'], 'pref' => (float) $e['pref'],
            ];
        }
    }
    $total = (int) (Db::row("SELECT COUNT(DISTINCT host) AS n FROM showcase_entries WHERE $w AND pref IS NOT NULL", $args)['n'] ?? 0);
    $counts = [];
    foreach (Db::rows('SELECT source, COUNT(DISTINCT host) AS n FROM showcase_entries WHERE pref IS NOT NULL GROUP BY source') as $c) { $counts[$c['source']] = (int) $c['n']; }
    Response::json([
        'items' => array_map(static fn ($r) => [
            'host' => $r['host'], 'title' => $r['title'], 'url' => $r['url'], 'pref' => round((float) $r['pref'], 1),
            'category' => $r['category'], 'last_on' => $r['last_on'], 'site_id' => $r['site_id'] === null ? null : (int) $r['site_id'],
            'entries' => $detail[$r['host']] ?? [],
        ], $rows),
        'total' => $total, 'next_cursor' => $more ? $offset + $limit : null,
        'sources' => array_map(static fn ($k, $v) => ['id' => $k, 'name' => $v['name'], 'desc' => $v['desc'], 'count' => $counts[$k] ?? 0], array_keys(SHOWCASE_SOURCES), SHOWCASE_SOURCES),
    ], 200, ['Cache-Control' => 'public, max-age=300']);
});

$router->get('/api/showcase/debates', static function (): void {
    Auth::requireAdmin();
    $sort = (string) ($_GET['sort'] ?? 'votes');
    $order = match ($sort) {
        'new' => 'created_on DESC, id DESC',
        'split' => 'ABS(CAST(JSON_EXTRACT(options, "$[0].pct") AS DECIMAL(5,1)) - 50) DESC, vote_count DESC', // 한쪽으로 크게 기운 것(합의가 뚜렷한 것) 먼저
        default => 'vote_count DESC, id DESC',
    };
    $limit = 30; $offset = max(0, (int) ($_GET['cursor'] ?? 0));
    $rows = Db::rows("SELECT ext_id, title, options, vote_count, comment_count, source_url, created_on FROM design_debates ORDER BY $order LIMIT " . ($limit + 1) . " OFFSET $offset");
    $more = count($rows) > $limit; $rows = array_slice($rows, 0, $limit);
    $total = (int) (Db::row('SELECT COUNT(*) AS n FROM design_debates')['n'] ?? 0);
    Response::json([
        'items' => array_map(static fn ($r) => [
            'id' => $r['ext_id'], 'title' => $r['title'], 'options' => json_decode((string) $r['options'], true) ?: [],
            'votes' => (int) $r['vote_count'], 'comments' => (int) $r['comment_count'], 'source_url' => $r['source_url'], 'created_on' => $r['created_on'],
        ], $rows),
        'total' => $total, 'next_cursor' => $more ? $offset + $limit : null,
    ], 200, ['Cache-Control' => 'public, max-age=300']);
});
