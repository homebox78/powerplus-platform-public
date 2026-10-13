<?php
/**
 * powerDeck 개선 체크리스트(관리자·큐레이터) — 출처: mock.php 의 개선 체크리스트 라우트를 deck_checklist 로.
 *   GET  /admin/deck/checklist?status=open|fixing|fixed|watch|wontfix|regressed|fed|all&area=&origin=&q=&sort=hits|recent
 *   GET  /admin/deck/checklist/lessons      지금 엔진에 넣는 규칙(되먹임 미리보기)
 *   GET  /admin/deck/checklist/{id}
 *   POST /admin/deck/checklist              {slug?, area, title, detail?, fix_note?}
 *   POST /admin/deck/checklist/{id}         {status?, fix_note?, fix_commit?, title?, detail?, area?}
 *   POST /admin/bulk/deck/checklist         {ids[], status}
 * 세션 로그인·큐레이터 이상, 쓰기는 Audit.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Deck\Checklist;

return static function (Router $r): void {
    $need = static function (Actor $a): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole('curator')) {
            throw HttpError::forbidden();
        }
    };
    $row = static function (int $id): array {
        $x = Db::row('SELECT * FROM deck_checklist WHERE id = ?', [$id]);
        if ($x === null) {
            throw HttpError::notFound('체크리스트 항목');
        }
        return $x;
    };
    $FED = "status IN ('open','fixing') AND area <> 'engine' AND (hits >= 2 OR regressed = 1)";

    $r->get('/admin/deck/checklist', static function (array $p, Actor $a) use ($need, $FED): void {
        $need($a);
        $where = ['1 = 1'];
        $args = [];
        $st = (string) ($_GET['status'] ?? 'open');
        if ($st === 'open') {
            $where[] = "status IN ('open','fixing')";
        } elseif ($st === 'regressed') {
            $where[] = 'regressed = 1';
        } elseif ($st === 'fed') {
            $where[] = $FED;
        } elseif (in_array($st, Checklist::STATUSES, true)) {
            $where[] = 'status = ?';
            $args[] = $st;
        }
        $area = (string) ($_GET['area'] ?? '');
        if (isset(Checklist::AREAS[$area])) {
            $where[] = 'area = ?';
            $args[] = $area;
        }
        $origin = (string) ($_GET['origin'] ?? '');
        if (in_array($origin, Checklist::ORIGINS, true)) {
            $where[] = 'origin = ?';
            $args[] = $origin;
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $lk = '%' . addcslashes($q, '%_\\') . '%';
            $where[] = '(title LIKE ? OR detail LIKE ? OR slug LIKE ? OR fix_note LIKE ?)';
            array_push($args, $lk, $lk, $lk, $lk);
        }
        $order = ($_GET['sort'] ?? 'hits') === 'recent' ? 'last_seen DESC' : 'regressed DESC, hits DESC, last_seen DESC';
        $w = implode(' AND ', $where);
        $rows = Db::rows("SELECT * FROM deck_checklist WHERE {$w} ORDER BY {$order} LIMIT 300", $args);
        $counts = [];
        foreach (Db::rows('SELECT status, COUNT(*) AS n, SUM(hits) AS h FROM deck_checklist GROUP BY status') as $c) {
            $counts[$c['status']] = ['n' => (int) $c['n'], 'hits' => (int) $c['h']];
        }
        $counts['regressed'] = ['n' => (int) Db::val('SELECT COUNT(*) FROM deck_checklist WHERE regressed = 1'), 'hits' => 0];
        $counts['fed'] = ['n' => (int) Db::val("SELECT COUNT(*) FROM deck_checklist WHERE {$FED}"), 'hits' => 0];
        $areas = [];
        foreach (Db::rows("SELECT area, COUNT(*) AS n FROM deck_checklist WHERE status IN ('open','fixing') GROUP BY area") as $c) {
            $areas[$c['area']] = (int) $c['n'];
        }
        Response::json(array_map(static fn ($x) => Checklist::pub($x, false), $rows), 200, ['meta' => [
            'counts' => $counts, 'open_by_area' => $areas,
            'areas' => array_map(static fn ($k, $v) => ['id' => $k, 'name' => $v], array_keys(Checklist::AREAS), Checklist::AREAS),
        ]]);
    });

    $r->get('/admin/deck/checklist/lessons', static function (array $p, Actor $a) use ($need): void {
        $need($a);
        Response::json(Checklist::lessons(12));
    });

    $r->get('/admin/deck/checklist/{id}', static function (array $p, Actor $a) use ($need, $row): void {
        $need($a);
        $x = Checklist::pub($row((int) $p['id']));
        foreach ($x['evidence'] as &$e) {
            if (is_array($e) && !empty($e['job'])) {
                $e['url'] = '/deck/jobs?id=' . rawurlencode((string) $e['job']);
            }
        }
        unset($e);
        Response::json($x);
    });

    $r->post('/admin/deck/checklist', static function (array $p, Actor $a) use ($need): void {
        $need($a);
        $b = Response::input();
        $title = trim((string) ($b['title'] ?? ''));
        if ($title === '') {
            throw HttpError::invalid('제목이 필요합니다.');
        }
        $slug = trim((string) ($b['slug'] ?? '')) ?: 'manual:' . mb_substr((string) preg_replace('/\s+/u', '-', $title), 0, 100);
        $res = Checklist::record($slug, (string) ($b['area'] ?? 'misc'), $title, isset($b['detail']) ? (string) $b['detail'] : null, 'manual', ['note' => '관리자 직접 추가']);
        if (!empty($b['fix_note'])) {
            Db::exec('UPDATE deck_checklist SET fix_note = ? WHERE id = ?', [mb_substr(trim((string) $b['fix_note']), 0, 1000), $res['id']]);
        }
        Audit::log($a, 'deck.checklist.record', 'deck_checklist:' . $res['id'], null, ['slug' => $slug, 'created' => $res['created']]);
        Response::json($res, $res['created'] ? 201 : 200);
    });

    $r->post('/admin/deck/checklist/{id}', static function (array $p, Actor $a) use ($need, $row): void {
        $need($a);
        $id = (int) $p['id'];
        $before = $row($id);
        $b = Response::input();
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
        foreach (['fix_note' => 1000, 'fix_commit' => 40, 'title' => 200, 'detail' => 4000] as $k => $max) {
            if (array_key_exists($k, $b)) {
                $v = trim((string) $b[$k]);
                if ($k === 'title' && $v === '') {
                    throw HttpError::invalid('제목은 비울 수 없습니다.');
                }
                $set[] = "{$k} = ?";
                $args[] = $v === '' ? null : mb_substr($v, 0, $max);
            }
        }
        if (isset($b['area']) && isset(Checklist::AREAS[(string) $b['area']])) {
            $set[] = 'area = ?';
            $args[] = (string) $b['area'];
        }
        if (!$set) {
            throw HttpError::invalid('바꿀 값이 없습니다.');
        }
        $args[] = $id;
        Db::exec('UPDATE deck_checklist SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
        $after = $row($id);
        $pick = static fn ($x) => array_intersect_key($x, array_flip(['status', 'fix_note', 'fix_commit', 'title', 'detail', 'area', 'regressed']));
        Audit::log($a, 'deck.checklist.update', 'deck_checklist:' . $id, $pick($before), $pick($after));
        Response::json(Checklist::pub($after));
    });

    $r->post('/admin/bulk/deck/checklist', static function (array $p, Actor $a) use ($need): void {
        $need($a);
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
        foreach (Db::rows("SELECT id, status, regressed FROM deck_checklist WHERE id IN ({$ph})", $list) as $x) {
            if ($x['status'] === $s) {
                $skipped++;
                continue;
            }
            Db::exec('UPDATE deck_checklist SET status = ?, ' . ($s === 'fixed' ? 'fixed_at = NOW(3), regressed = 0' : 'fixed_at = NULL') . ' WHERE id = ?', [$s, (int) $x['id']]);
            Audit::log($a, 'deck.checklist.update', 'deck_checklist:' . $x['id'], ['status' => $x['status']], ['status' => $s]);
            $count++;
        }
        Response::json(['action' => 'status', 'count' => $count, 'skipped' => $skipped]);
    });
};
