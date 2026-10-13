<?php
declare(strict_types=1);

/**
 * 관리자 (docs/08 "관리자") — Phase 2 범위: 수집 발행, 큐 상태. 인증은 X-Admin-Token (Phase 4 에서 role=admin 세션으로).
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Auth;
use Homebox\Http\Response;

// POST /api/admin/sites/{id}/crawl  {kind?: 'discover'|'index', pages?: []}
$router->post('/api/admin/sites/{id}/crawl', static function (array $p): void {
    Auth::requireAdmin();
    $id = (int) $p['id'];
    $site = Db::row('SELECT id, slug, status FROM sites WHERE id = ?', [$id]);
    if ($site === null) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $kind = (string) ($body['kind'] ?? 'discover');
    if (!in_array($kind, ['discover', 'index'], true)) {
        Response::error(422, 'INVALID_KIND', 'kind 는 discover|index 중 하나입니다.');
    }
    $dupe = Db::row("SELECT id FROM crawl_jobs WHERE site_id = ? AND kind = ? AND status IN ('queued','running') LIMIT 1", [$id, $kind]);
    if ($dupe !== null) {
        Response::json(['job_id' => (int) $dupe['id'], 'duplicate' => true]);
    }
    Db::exec("INSERT INTO crawl_jobs (site_id, kind, payload, status) VALUES (?, ?, '{}', 'queued')", [$id, $kind]);
    $jobId = (int) Db::pdo()->lastInsertId();
    if ($kind === 'discover') {
        Db::exec("UPDATE sites SET status = 'queued' WHERE id = ? AND status IN ('draft','queued')", [$id]);
    }
    Response::json(['job_id' => $jobId, 'duplicate' => false], 201);
});

// GET /api/admin/jobs?site_id=&status=&limit=
$router->get('/api/admin/jobs', static function (): void {
    Auth::requireAdmin();
    $where = ['1=1'];
    $params = [];
    if (($sid = (int) ($_GET['site_id'] ?? 0)) > 0) { $where[] = 'j.site_id = ?'; $params[] = $sid; }
    if (($st = (string) ($_GET['status'] ?? '')) !== '' && in_array($st, ['queued', 'running', 'done', 'failed'], true)) { $where[] = 'j.status = ?'; $params[] = $st; }
    $limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
    $jobs = Db::rows(
        'SELECT j.id, j.site_id, s.slug, j.kind, j.status, j.attempts, LEFT(j.error, 300) AS error, j.payload, j.queued_at, j.started_at, j.finished_at
         FROM crawl_jobs j JOIN sites s ON s.id = j.site_id WHERE ' . implode(' AND ', $where) . " ORDER BY j.id DESC LIMIT $limit",
        $params,
    );
    foreach ($jobs as &$j) {
        $j['id'] = (int) $j['id']; $j['site_id'] = (int) $j['site_id']; $j['attempts'] = (int) $j['attempts'];
        $j['payload'] = is_string($j['payload']) ? json_decode($j['payload'], true) : $j['payload'];
    }
    unset($j);
    $summary = Db::rows('SELECT status, COUNT(*) AS n FROM crawl_jobs GROUP BY status');
    Response::json(['summary' => array_column($summary, 'n', 'status'), 'items' => $jobs]);
});

// GET /api/admin/sites/{id}/screens — 검수 대기 화면 목록(썸네일 서명 URL 포함)
$router->get('/api/admin/sites/{id}/screens', static function (array $p): void {
    Auth::requireAdmin();
    $id = (int) $p['id'];
    $rows = Db::rows(
        'SELECT sc.id, sc.page_type_id, sc.device, sc.title, sc.url, sc.status, sc.full_h, sc.thumb_asset_id, sc.public_asset_id,
                (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id) AS sections,
                (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id AND x.section_type_id = "unknown") AS unknown_n,
                (SELECT COUNT(*) FROM masks m WHERE m.screen_id = sc.id) AS masks
         FROM screens sc WHERE sc.site_id = ? ORDER BY sc.sort, sc.id', [$id]);
    foreach ($rows as &$r) {
        foreach (['id', 'full_h', 'sections', 'unknown_n', 'masks'] as $k) { $r[$k] = (int) $r[$k]; }
        $r['thumb_url'] = $r['thumb_asset_id'] ? \Homebox\Signer::url((int) $r['thumb_asset_id']) : null;
        $r['public_url'] = $r['public_asset_id'] ? \Homebox\Signer::url((int) $r['public_asset_id']) : null;
        unset($r['thumb_asset_id'], $r['public_asset_id']);
    }
    unset($r);
    Response::json(['items' => $rows]);
});

// ── 섹션 편집 (사용자 지시 2026-09-26 "관리자는 섹션영역을 움직여서 조정할수있고 이름도 지정할수있게") ──
// 편집한 섹션은 source='review' — 워커 재분해가 덮지 않는다. 기록은 section_reviews(배포 --db 전에 로컬로 재적용).
$sectionEdit = static function (string $action, int $screenId, ?int $sectionId): void {
    Auth::requireAdmin();
    $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $u = \Homebox\Auth\Session::user();
    try {
        $id = \Homebox\SectionReview::apply([
            'action' => $action, 'screen_id' => $screenId, 'section_id' => $sectionId,
            'type' => $body['type'] ?? null, 'name' => $body['name'] ?? null,
            'x' => $body['x'] ?? null, 'y' => $body['y'] ?? null, 'w' => $body['w'] ?? null, 'h' => $body['h'] ?? null,
        ], $u !== null ? (int) $u['id'] : null);
    } catch (\InvalidArgumentException $e) {
        Response::error(422, 'INVALID_SECTION', $e->getMessage());
    }
    if ($action === 'delete') { Response::json(['ok' => true]); }
    $x = Db::row('SELECT x.id, x.section_type_id, st.name_ko AS section_type_ko, x.variant, x.bbox_x, x.bbox_y, x.bbox_w, x.bbox_h, x.source FROM sections x JOIN section_types st ON st.id = x.section_type_id WHERE x.id = ?', [$id]);
    Response::json(['section' => [
        'id' => (int) $x['id'], 'section_type_id' => $x['section_type_id'], 'section_type_ko' => $x['section_type_ko'], 'variant' => $x['variant'], 'source' => $x['source'],
        'bbox' => ['x' => (int) $x['bbox_x'], 'y' => (int) $x['bbox_y'], 'w' => (int) $x['bbox_w'], 'h' => (int) $x['bbox_h']],
    ]], $action === 'add' ? 201 : 200);
};
$sectionScreen = static function (int $sectionId): int {
    $r = Db::row('SELECT screen_id FROM sections WHERE id = ?', [$sectionId]);
    if ($r === null) { Response::error(404, 'NOT_FOUND', '섹션을 찾을 수 없습니다.'); }
    return (int) $r['screen_id'];
};

// PATCH /api/admin/sections/{id}  {x?,y?,w?,h?,type?,name?}
$router->patch('/api/admin/sections/{id}', static function (array $p) use ($sectionEdit, $sectionScreen): void {
    Auth::requireAdmin();
    $sectionEdit('update', $sectionScreen((int) $p['id']), (int) $p['id']);
});
// POST /api/admin/screens/{id}/sections  {x,y,w,h,type?,name?}
$router->post('/api/admin/screens/{id}/sections', static function (array $p) use ($sectionEdit): void {
    $sectionEdit('add', (int) $p['id'], null);
});
// DELETE /api/admin/sections/{id}
$router->delete('/api/admin/sections/{id}', static function (array $p) use ($sectionEdit, $sectionScreen): void {
    Auth::requireAdmin();
    $sectionEdit('delete', $sectionScreen((int) $p['id']), (int) $p['id']);
});
