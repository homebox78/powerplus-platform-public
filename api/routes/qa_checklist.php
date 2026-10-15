<?php
/**
 * 솔루션별 개선 체크리스트(powerAssets·powerGuide·powerMCP) + 통합 검수 — 관리자·큐레이터.
 * 출처: api/routes/site_checklist.php 를 module 경로로 일반화. deck·mock·site 는 각자 라우트가 그대로 있고, 통합 층(overview·items)만 여섯 표를 함께 읽고 상태를 바꾼다.
 *
 *   GET  /admin/qa/{module}/checklist?status&area&origin&q&sort     module = assets|guide|mcp
 *   GET  /admin/qa/{module}/checklist/{id}
 *   POST /admin/qa/{module}/checklist                {slug?, area, title, detail?, fix_note?}
 *   POST /admin/qa/{module}/checklist/{id}           {status?, fix_note?, fix_commit?, title?, detail?, area?}
 *   POST /admin/bulk/qa/{module}/checklist           {ids[], status}
 *   GET  /admin/qa/overview                          여섯 체크리스트의 상태 숫자 · 관리 화면 · 자가 개선 고리
 *   GET  /admin/qa/items?source&status&q&sort        여섯 체크리스트를 한 목록으로(검수 순서: 다시 걸림 → 횟수 → 최근)
 *   POST /admin/qa/items/{source}/{id}               {status?, fix_note?, fix_commit?} — 어느 체크리스트든 같은 절차로
 * 세션 로그인·큐레이터 이상, 쓰기는 Audit.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Qa\Checklist;

return static function (Router $r): void {
    $need = static function (Actor $a): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole('curator')) {
            throw HttpError::forbidden();
        }
    };
    $mod = static function (array $p): string {
        $m = (string) ($p['module'] ?? '');
        if (!isset(Checklist::MODULES[$m])) {
            throw HttpError::notFound('체크리스트');
        }
        return $m;
    };
    $row = static function (string $m, int $id): array {
        $x = Db::row('SELECT * FROM qa_checklist WHERE id = ? AND module = ?', [$id, $m]);
        if ($x === null) {
            throw HttpError::notFound('체크리스트 항목');
        }
        return $x;
    };
    /** 상태·메모 바꾸기 — 여섯 표 공통 */
    $update = static function (Actor $a, string $source, int $id, array $b, bool $full) use ($row): array {
        $src = Checklist::SOURCES[$source] ?? throw HttpError::notFound('체크리스트');
        $and = $src['where'] !== '' ? ' AND ' . $src['where'] : '';
        $before = Db::row("SELECT * FROM {$src['table']} WHERE id = ?{$and}", [$id]) ?? throw HttpError::notFound('체크리스트 항목');
        $set = [];
        $args = [];
        if (isset($b['status'])) {
            $s = (string) $b['status'];
            if (!in_array($s, Checklist::STATUSES, true)) {
                throw HttpError::invalid('상태 값이 올바르지 않습니다.');
            }
            $set[] = 'status = ?';
            $args[] = $s;
            $set[] = $s === 'fixed' ? 'fixed_at = NOW(3), regressed = 0' : 'fixed_at = NULL';
        }
        $fields = $full ? ['fix_note' => 1000, 'fix_commit' => 40, 'title' => 200, 'detail' => 4000] : ['fix_note' => 1000, 'fix_commit' => 40];
        foreach ($fields as $k => $max) {
            if (array_key_exists($k, $b)) {
                $v = trim((string) $b[$k]);
                if ($k === 'title' && $v === '') {
                    throw HttpError::invalid('제목은 비울 수 없습니다.');
                }
                $set[] = "{$k} = ?";
                $args[] = $v === '' ? null : mb_substr($v, 0, $max);
            }
        }
        if ($full && isset($b['area']) && isset(Checklist::areas($source)[(string) $b['area']])) {
            $set[] = 'area = ?';
            $args[] = (string) $b['area'];
        }
        if (!$set) {
            throw HttpError::invalid('바꿀 값이 없습니다.');
        }
        $args[] = $id;
        Db::exec("UPDATE {$src['table']} SET " . implode(', ', $set) . " WHERE id = ?{$and}", $args);
        $after = Db::row("SELECT * FROM {$src['table']} WHERE id = ?", [$id]);
        $pick = static fn ($x) => array_intersect_key($x, array_flip(['status', 'fix_note', 'fix_commit', 'title', 'detail', 'area', 'regressed']));
        Audit::log($a, 'qa.checklist.update', $src['table'] . ':' . $id, $pick($before), $pick($after));
        return Checklist::pub($after, $source);
    };
    /** 목록 조건 — status·q 는 여섯 표 공통 열 */
    $filters = static function (string $st, string $q): array {
        $where = [];
        $args = [];
        if ($st === 'open' || $st === '') {
            $where[] = "status IN ('open','fixing')";
        } elseif ($st === 'regressed') {
            $where[] = "regressed = 1 AND status IN ('open','fixing')";
        } elseif (in_array($st, Checklist::STATUSES, true)) {
            $where[] = 'status = ?';
            $args[] = $st;
        }
        if ($q !== '') {
            $lk = '%' . addcslashes($q, '%_\\') . '%';
            $where[] = '(title LIKE ? OR detail LIKE ? OR slug LIKE ? OR fix_note LIKE ?)';
            array_push($args, $lk, $lk, $lk, $lk);
        }
        return [$where, $args];
    };

    // ── 솔루션별(assets·guide·mcp) ──
    $r->get('/admin/qa/{module}/checklist', static function (array $p, Actor $a) use ($need, $mod, $filters): void {
        $need($a);
        $m = $mod($p);
        [$where, $args] = $filters((string) ($_GET['status'] ?? 'open'), trim((string) ($_GET['q'] ?? '')));
        if (($_GET['status'] ?? '') === 'all') {
            $where = array_values(array_filter($where, static fn ($w) => !str_starts_with($w, 'status')));
        }
        array_unshift($where, 'module = ?');
        array_unshift($args, $m);
        $area = (string) ($_GET['area'] ?? '');
        if (isset(Checklist::areas($m)[$area])) {
            $where[] = 'area = ?';
            $args[] = $area;
        }
        $origin = (string) ($_GET['origin'] ?? '');
        if (in_array($origin, Checklist::ORIGINS, true)) {
            $where[] = 'origin = ?';
            $args[] = $origin;
        }
        $order = ($_GET['sort'] ?? 'hits') === 'recent' ? 'last_seen DESC' : 'regressed DESC, hits DESC, last_seen DESC';
        $rows = Db::rows('SELECT * FROM qa_checklist WHERE ' . implode(' AND ', $where) . " ORDER BY {$order} LIMIT 500", $args);
        $counts = [];
        foreach (Db::rows('SELECT status, COUNT(*) AS n, SUM(hits) AS h FROM qa_checklist WHERE module = ? GROUP BY status', [$m]) as $c) {
            $counts[$c['status']] = ['n' => (int) $c['n'], 'hits' => (int) $c['h']];
        }
        $counts['regressed'] = ['n' => (int) Db::val("SELECT COUNT(*) FROM qa_checklist WHERE module = ? AND regressed = 1 AND status IN ('open','fixing')", [$m]), 'hits' => 0];
        $areas = [];
        foreach (Db::rows("SELECT area, COUNT(*) AS n FROM qa_checklist WHERE module = ? AND status IN ('open','fixing') GROUP BY area", [$m]) as $c) {
            $areas[$c['area']] = (int) $c['n'];
        }
        Response::json(array_map(static fn ($x) => Checklist::pub($x, $m, false), $rows), 200, ['meta' => [
            'module' => $m, 'name' => Checklist::MODULES[$m]['name'], 'loop' => Checklist::SOURCES[$m]['loop'],
            'counts' => $counts, 'open_by_area' => $areas,
            'areas' => array_map(static fn ($k, $v) => ['id' => $k, 'name' => $v], array_keys(Checklist::areas($m)), Checklist::areas($m)),
        ]]);
    });

    $r->get('/admin/qa/{module}/checklist/{id}', static function (array $p, Actor $a) use ($need, $mod, $row): void {
        $need($a);
        $m = $mod($p);
        Response::json(Checklist::pub($row($m, (int) $p['id']), $m));
    });

    $r->post('/admin/qa/{module}/checklist', static function (array $p, Actor $a) use ($need, $mod): void {
        $need($a);
        $m = $mod($p);
        $b = Response::input();
        $title = trim((string) ($b['title'] ?? ''));
        if ($title === '') {
            throw HttpError::invalid('제목이 필요합니다.');
        }
        $slug = trim((string) ($b['slug'] ?? '')) ?: 'manual:' . mb_substr((string) preg_replace('/\s+/u', '-', $title), 0, 100);
        $res = Checklist::record($m, $slug, (string) ($b['area'] ?? 'misc'), $title, isset($b['detail']) ? (string) $b['detail'] : null, 'manual', ['note' => '관리자 직접 추가']);
        if (!empty($b['fix_note'])) {
            Db::exec('UPDATE qa_checklist SET fix_note = ? WHERE id = ?', [mb_substr(trim((string) $b['fix_note']), 0, 1000), $res['id']]);
        }
        Audit::log($a, 'qa.checklist.record', 'qa_checklist:' . $res['id'], null, ['module' => $m, 'slug' => $slug, 'created' => $res['created']]);
        Response::json($res, $res['created'] ? 201 : 200);
    });

    $r->post('/admin/qa/{module}/checklist/{id}', static function (array $p, Actor $a) use ($need, $mod, $update): void {
        $need($a);
        Response::json($update($a, $mod($p), (int) $p['id'], Response::input(), true));
    });

    $r->post('/admin/bulk/qa/{module}/checklist', static function (array $p, Actor $a) use ($need, $mod): void {
        $need($a);
        $m = $mod($p);
        $b = Response::input();
        $s = (string) ($b['status'] ?? '');
        if (!in_array($s, Checklist::STATUSES, true)) {
            throw HttpError::invalid('상태 값이 올바르지 않습니다.');
        }
        $list = array_values(array_unique(array_filter(array_map('intval', (array) ($b['ids'] ?? [])), static fn ($n) => $n > 0)));
        if (!$list || count($list) > 500) {
            throw HttpError::invalid('고른 항목이 없거나 너무 많습니다.');
        }
        $ph = implode(',', array_fill(0, count($list), '?'));
        $count = 0;
        $skipped = 0;
        foreach (Db::rows("SELECT id, status FROM qa_checklist WHERE module = ? AND id IN ({$ph})", array_merge([$m], $list)) as $x) {
            if ($x['status'] === $s) {
                $skipped++;
                continue;
            }
            Db::exec('UPDATE qa_checklist SET status = ?, ' . ($s === 'fixed' ? 'fixed_at = NOW(3), regressed = 0' : 'fixed_at = NULL') . ' WHERE id = ?', [$s, (int) $x['id']]);
            Audit::log($a, 'qa.checklist.update', 'qa_checklist:' . $x['id'], ['status' => $x['status']], ['status' => $s]);
            $count++;
        }
        Response::json(['action' => 'status', 'count' => $count, 'skipped' => $skipped]);
    });

    // ── 통합 검수 ──
    $r->get('/admin/qa/overview', static function (array $p, Actor $a) use ($need): void {
        $need($a);
        $out = [];
        foreach (Checklist::SOURCES as $k => $s) {
            $out[] = ['source' => $k, 'name' => $s['name'], 'page' => $s['page'], 'loop' => $s['loop']] + Checklist::counts($k);
        }
        Response::json($out);
    });

    $r->get('/admin/qa/items', static function (array $p, Actor $a) use ($need, $filters): void {
        $need($a);
        $only = (string) ($_GET['source'] ?? '');
        $st = (string) ($_GET['status'] ?? 'open');
        [$where, $args] = $filters($st === 'all' ? 'all' : $st, trim((string) ($_GET['q'] ?? '')));
        $recent = ($_GET['sort'] ?? '') === 'recent';
        $all = [];
        foreach (Checklist::SOURCES as $k => $s) {
            if ($only !== '' && $only !== $k) {
                continue;
            }
            $w = $where;
            if ($s['where'] !== '') {
                $w[] = $s['where'];
            }
            $sql = "SELECT * FROM {$s['table']}" . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY regressed DESC, hits DESC, last_seen DESC LIMIT 300';
            foreach (Db::rows($sql, $args) as $x) {
                $all[] = Checklist::pub($x, $k, false);
            }
        }
        // 검수 순서: 다시 걸림 → 수정 중 → 걸린 횟수 → 최근. 최근 정렬이면 마지막 발견 순
        usort($all, static fn ($x, $y) => $recent
            ? strcmp((string) $y['last_seen'], (string) $x['last_seen'])
            : [$y['regressed'], $y['status'] === 'fixing', $y['hits'], (string) $y['last_seen']] <=> [$x['regressed'], $x['status'] === 'fixing', $x['hits'], (string) $x['last_seen']]);
        $total = count($all);
        [$page, $limit, $off] = Response::paging(50, 200);
        Response::list(array_slice($all, $off, $limit), $total, $page, $limit);
    });

    $r->post('/admin/qa/items/{source}/{id}', static function (array $p, Actor $a) use ($need, $update): void {
        $need($a);
        Response::json($update($a, (string) $p['source'], (int) $p['id'], Response::input(), false));
    });
};
