<?php
/**
 * 정책 문서 버전 — 이용약관·개인정보처리방침·저작권·이메일 무단수집 거부·수집 로봇 안내(core_policy_versions, 0027).
 * 공개: GET /policies/{doc} — 발행된 판 전부(최신 시행일 순) + 현재 판 id. 로그인 없이.
 * 관리자: GET·POST /admin/policies, PATCH·DELETE /admin/policies/{id} — admin 이상 세션, 모든 쓰기는 Audit.
 * 첫 판(1.0)은 화면 코드에 있다. DB 에 같은 문서 1.0 이 생기면 화면은 DB 것을 쓴다.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Response;
use Pp\Core\Router;

const POLICY_DOCS = ['terms', 'privacy', 'copyright', 'email', 'bot'];

return static function (Router $r): void {
    $need = static function (Actor $a): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole('admin')) {
            throw HttpError::forbidden();
        }
    };
    $out = static fn (array $x, bool $withSpec = true): array => [
        'id' => $x['public_id'], 'doc' => $x['doc'], 'version' => $x['version'], 'effective_on' => $x['effective_on'],
        'summary' => $x['summary'], 'published' => (bool) $x['published'], 'updated_at' => $x['updated_at'],
    ] + ($withSpec ? ['spec' => json_decode((string) $x['spec'], true) ?: new stdClass()] : []);
    $row = static function (string $pid): array {
        $x = Db::row('SELECT * FROM core_policy_versions WHERE public_id = ? AND deleted_at IS NULL', [$pid]);
        if (!$x) {
            throw HttpError::notFound('문서 판');
        }
        return $x;
    };

    /** 본문 검사 — 화면 DocSpec 모양만 받는다(문자열 길이 상한, 표는 머리·줄 수가 맞아야). */
    $cleanSpec = static function (mixed $s): array {
        if (!is_array($s)) {
            throw HttpError::invalid('본문이 비어 있습니다.');
        }
        $str = static fn (mixed $v, int $max): string => mb_substr(trim((string) $v), 0, $max);
        $title = $str($s['title'] ?? '', 100);
        if (mb_strlen($title) < 2) {
            throw HttpError::invalid('문서 제목을 써 주세요.');
        }
        $blocks = [];
        $ids = [];
        foreach ((array) ($s['blocks'] ?? []) as $i => $b) {
            if (!is_array($b)) {
                continue;
            }
            $bt = $str($b['title'] ?? '', 200);
            if ($bt === '') {
                throw HttpError::invalid(($i + 1) . '번째 항목의 제목이 비어 있습니다.');
            }
            $id = preg_replace('/[^a-z0-9-]/', '', strtolower((string) ($b['id'] ?? ''))) ?: 's' . ($i + 1);
            while (isset($ids[$id])) {
                $id .= '-' . ($i + 1);
            }
            $ids[$id] = true;
            $blk = ['id' => $id, 'title' => $bt];
            $paras = array_values(array_filter(array_map(static fn ($p) => $str($p, 2000), (array) ($b['paras'] ?? [])), static fn ($p) => $p !== ''));
            $items = array_values(array_filter(array_map(static fn ($p) => $str($p, 2000), (array) ($b['items'] ?? [])), static fn ($p) => $p !== ''));
            if ($paras) {
                $blk['paras'] = $paras;
            }
            if ($items) {
                $blk['items'] = $items;
            }
            if (isset($b['table']) && is_array($b['table'])) {
                $head = array_map(static fn ($c) => $str($c, 200), (array) ($b['table']['head'] ?? []));
                $rows = [];
                foreach ((array) ($b['table']['rows'] ?? []) as $rw) {
                    $cells = array_map(static fn ($c) => $str($c, 1000), (array) $rw);
                    if (count($cells) !== count($head)) {
                        throw HttpError::invalid("'{$bt}' 표의 칸 수가 머리와 다릅니다.");
                    }
                    $rows[] = $cells;
                }
                if ($head && $rows) {
                    $blk['table'] = ['head' => $head, 'rows' => $rows] + (!empty($b['table']['center']) ? ['center' => true] : []);
                }
            }
            $blocks[] = $blk;
        }
        if (!$blocks || count($blocks) > 80) {
            throw HttpError::invalid('항목을 1~80개로 써 주세요.');
        }
        $spec = ['title' => $title, 'blocks' => $blocks];
        if (($lead = $str($s['lead'] ?? '', 1000)) !== '') {
            $spec['lead'] = $lead;
        }
        if (($draft = $str($s['draft'] ?? '', 500)) !== '') {
            $spec['draft'] = $draft;
        }
        return $spec;
    };

    $validate = static function (array $b, bool $partial, ?array $cur = null) use ($cleanSpec): array {
        $o = [];
        if (!$partial || array_key_exists('doc', $b)) {
            $d = (string) ($b['doc'] ?? '');
            if (!in_array($d, POLICY_DOCS, true)) {
                throw HttpError::invalid('문서를 골라 주세요.');
            }
            $o['doc'] = $d;
        }
        if (!$partial || array_key_exists('version', $b)) {
            $v = trim((string) ($b['version'] ?? ''));
            if (!preg_match('/^[0-9][0-9.]{0,19}$/', $v)) {
                throw HttpError::invalid('버전은 숫자와 점으로 써 주세요(예: 1.1).');
            }
            $o['version'] = $v;
        }
        if (!$partial || array_key_exists('effective_on', $b)) {
            $d = (string) ($b['effective_on'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !strtotime($d)) {
                throw HttpError::invalid('시행일을 YYYY-MM-DD 로 써 주세요.');
            }
            $o['effective_on'] = $d;
        }
        if (!$partial || array_key_exists('summary', $b)) {
            $o['summary'] = mb_substr(trim((string) ($b['summary'] ?? '')), 0, 500);
        }
        if (!$partial || array_key_exists('spec', $b)) {
            $o['spec'] = json_encode($cleanSpec($b['spec'] ?? null), JSON_UNESCAPED_UNICODE);
        }
        if (array_key_exists('published', $b)) {
            $o['published'] = (bool) $b['published'] ? 1 : 0;
        }
        $doc = $o['doc'] ?? $cur['doc'] ?? '';
        $ver = $o['version'] ?? $cur['version'] ?? '';
        if ($doc !== '' && $ver !== '') {
            $dup = Db::row('SELECT id FROM core_policy_versions WHERE doc = ? AND version = ? AND deleted_at IS NULL AND id <> ?', [$doc, $ver, (int) ($cur['id'] ?? 0)]);
            if ($dup) {
                throw HttpError::invalid("이 문서에 버전 {$ver} 이 이미 있습니다.");
            }
        }
        return $o;
    };

    // 공개 — 발행된 판(시행 예정 포함). 화면이 코드의 1.0 과 합쳐 셀렉터를 만든다.
    $r->get('/policies/{doc}', function (array $p) use ($out): void {
        $doc = (string) $p['doc'];
        if (!in_array($doc, POLICY_DOCS, true)) {
            throw HttpError::notFound('문서');
        }
        $rows = Db::rows('SELECT * FROM core_policy_versions WHERE doc = ? AND published = 1 AND deleted_at IS NULL ORDER BY effective_on DESC, id DESC', [$doc]);
        Response::json(['doc' => $doc, 'today' => date('Y-m-d'), 'versions' => array_map($out, $rows)], 200, [], true);
    });

    $r->get('/admin/policies', function (array $p, Actor $a) use ($need, $out): void {
        $need($a);
        $doc = (string) ($_GET['doc'] ?? '');
        $where = 'deleted_at IS NULL';
        $args = [];
        if (in_array($doc, POLICY_DOCS, true)) {
            $where .= ' AND doc = ?';
            $args[] = $doc;
        }
        $rows = Db::rows("SELECT * FROM core_policy_versions WHERE $where ORDER BY doc, effective_on DESC, id DESC", $args);
        $counts = [];
        foreach (Db::rows('SELECT doc, COUNT(*) AS n FROM core_policy_versions WHERE deleted_at IS NULL GROUP BY doc') as $c) {
            $counts[$c['doc']] = (int) $c['n'];
        }
        Response::list(array_map($out, $rows), count($rows), 1, max(1, count($rows)), ['counts' => $counts]);
    });

    $r->post('/admin/policies', function (array $p, Actor $a) use ($need, $validate, $row, $out): void {
        $need($a);
        $v = $validate(Response::input(), false);
        $pid = Ids::publicId();
        Db::exec('INSERT INTO core_policy_versions (public_id, doc, version, effective_on, summary, spec, published, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$pid, $v['doc'], $v['version'], $v['effective_on'], $v['summary'], $v['spec'], $v['published'] ?? 1, (int) $a->user['id']]);
        Audit::log($a, 'policy.create', 'core_policy_versions:' . $pid, null, ['doc' => $v['doc'], 'version' => $v['version'], 'effective_on' => $v['effective_on']]);
        Response::json($out($row($pid)), 201);
    });

    $r->patch('/admin/policies/{id}', function (array $p, Actor $a) use ($need, $validate, $row, $out): void {
        $need($a);
        $cur = $row((string) $p['id']);
        $v = $validate(Response::input(), true, $cur);
        if (!$v) {
            throw HttpError::invalid('바꿀 값이 없습니다.');
        }
        $set = [];
        $args = [];
        $before = [];
        foreach ($v as $k => $val) {
            $set[] = "$k = ?";
            $args[] = $val;
            $before[$k] = $k === 'spec' ? '(본문)' : $cur[$k];
        }
        $args[] = (int) $cur['id'];
        Db::exec('UPDATE core_policy_versions SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
        Audit::log($a, 'policy.update', 'core_policy_versions:' . $cur['public_id'], $before, array_map(static fn ($x) => is_string($x) && mb_strlen($x) > 200 ? '(본문)' : $x, $v));
        Response::json($out($row((string) $p['id'])));
    });

    $r->delete('/admin/policies/{id}', function (array $p, Actor $a) use ($need, $row): void {
        $need($a);
        $cur = $row((string) $p['id']);
        Db::exec('UPDATE core_policy_versions SET deleted_at = NOW(3) WHERE id = ?', [(int) $cur['id']]);
        Audit::log($a, 'policy.delete', 'core_policy_versions:' . $cur['public_id'], ['doc' => $cur['doc'], 'version' => $cur['version']], null);
        Response::noContent();
    });
};
