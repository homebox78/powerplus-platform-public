<?php
declare(strict_types=1);

/**
 * 디자인 개선 체크리스트 (관리자 전용, 2026-10-03)
 *   GET   /api/admin/checklist?status=open|fixing|fixed|watch|wontfix|all&area=&origin=&q=&sort=hits|recent
 *   POST  /api/admin/checklist            {slug?, area, title, detail?, origin?, evidence?}  — 시험 스크립트는 X-Admin-Token
 *   POST  /api/admin/checklist/{id}       {status?, fix_note?, fix_commit?, title?, detail?, area?}
 * @var Homebox\Http\Router $router
 */

use Homebox\Checklist;
use Homebox\Db;
use Homebox\Http\Auth;
use Homebox\Http\Response;

$router->get('/api/admin/checklist', static function (): void {
    Auth::requireAdmin();
    $where = ['1 = 1']; $args = [];
    $st = (string) ($_GET['status'] ?? 'open');
    if ($st === 'open') { $where[] = "status IN ('open','fixing')"; }
    elseif (in_array($st, Checklist::STATUSES, true)) { $where[] = 'status = ?'; $args[] = $st; }
    $area = (string) ($_GET['area'] ?? '');
    if (isset(Checklist::AREAS[$area])) { $where[] = 'area = ?'; $args[] = $area; }
    $origin = (string) ($_GET['origin'] ?? '');
    if (in_array($origin, ['judge', 'test', 'pref', 'manual'], true)) { $where[] = 'origin = ?'; $args[] = $origin; }
    $q = trim((string) ($_GET['q'] ?? ''));
    if ($q !== '') { $where[] = '(title LIKE ? OR detail LIKE ? OR slug LIKE ?)'; array_push($args, "%$q%", "%$q%", "%$q%"); }
    $order = ($_GET['sort'] ?? 'hits') === 'recent' ? 'last_seen DESC' : 'regressed DESC, hits DESC, last_seen DESC';
    $w = implode(' AND ', $where);
    $rows = Db::rows("SELECT id, slug, area, title, detail, origin, status, hits, regressed, evidence, fix_note, fix_commit, first_seen, last_seen, fixed_at FROM design_checklist WHERE $w ORDER BY $order LIMIT 300", $args);
    $counts = [];
    foreach (Db::rows('SELECT status, COUNT(*) AS n, SUM(hits) AS h FROM design_checklist GROUP BY status') as $c) { $counts[$c['status']] = ['n' => (int) $c['n'], 'hits' => (int) $c['h']]; }
    $areas = [];
    foreach (Db::rows("SELECT area, COUNT(*) AS n FROM design_checklist WHERE status IN ('open','fixing') GROUP BY area") as $c) { $areas[$c['area']] = (int) $c['n']; }
    Response::json([
        'items' => array_map(static fn ($r) => [
            'id' => (int) $r['id'], 'slug' => $r['slug'], 'area' => $r['area'], 'area_name' => Checklist::AREAS[$r['area']] ?? $r['area'],
            'title' => $r['title'], 'detail' => $r['detail'], 'origin' => $r['origin'], 'status' => $r['status'], 'hits' => (int) $r['hits'],
            'regressed' => (bool) $r['regressed'], 'evidence' => json_decode((string) $r['evidence'], true) ?: [],
            'fix_note' => $r['fix_note'], 'fix_commit' => $r['fix_commit'], 'first_seen' => $r['first_seen'], 'last_seen' => $r['last_seen'], 'fixed_at' => $r['fixed_at'],
        ], $rows),
        'counts' => $counts, 'open_by_area' => $areas,
        'areas' => array_map(static fn ($k, $v) => ['id' => $k, 'name' => $v], array_keys(Checklist::AREAS), Checklist::AREAS),
    ], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/admin/checklist', static function (): void {
    Auth::requireAdmin();
    $b = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $title = trim((string) ($b['title'] ?? ''));
    if ($title === '') { Response::error(400, 'BAD_INPUT', '제목이 필요합니다.'); }
    $slug = trim((string) ($b['slug'] ?? '')) ?: 'manual:' . mb_substr((string) preg_replace('/\s+/u', '-', $title), 0, 100);
    $r = Checklist::record($slug, (string) ($b['area'] ?? 'mockup'), $title, isset($b['detail']) ? (string) $b['detail'] : null,
        (string) ($b['origin'] ?? 'manual'), is_array($b['evidence'] ?? null) ? $b['evidence'] : []);
    Response::json($r, $r['created'] ? 201 : 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/admin/checklist/{id}', static function (array $p): void {
    Auth::requireAdmin();
    $id = (int) ($p['id'] ?? 0);
    $b = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $set = []; $args = [];
    if (isset($b['status'])) {
        $s = (string) $b['status'];
        if (!in_array($s, Checklist::STATUSES, true)) { Response::error(400, 'BAD_STATUS', '상태 값이 올바르지 않습니다.'); }
        $set[] = 'status = ?'; $args[] = $s;
        $set[] = $s === 'fixed' ? 'fixed_at = NOW(3), regressed = 0' : 'fixed_at = NULL';
    }
    foreach (['fix_note' => 1000, 'fix_commit' => 40, 'title' => 200, 'detail' => 4000] as $k => $max) {
        if (array_key_exists($k, $b)) { $set[] = "$k = ?"; $v = trim((string) $b[$k]); $args[] = $v === '' ? null : mb_substr($v, 0, $max); }
    }
    if (isset($b['area']) && isset(Checklist::AREAS[(string) $b['area']])) { $set[] = 'area = ?'; $args[] = (string) $b['area']; }
    if (!$set) { Response::error(400, 'BAD_INPUT', '바꿀 값이 없습니다.'); }
    $args[] = $id;
    $n = Db::exec('UPDATE design_checklist SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
    Response::json(['ok' => true, 'changed' => $n], 200, ['Cache-Control' => 'no-store']);
});
