<?php
/**
 * powerAssets 라우트 — /api/v1/assets/…
 * 출처: powerPlus server/index.php 의 assets·categories·requests 라우트를 REST v1 규약으로. 판정은 Service(=Access) 한 곳.
 */
declare(strict_types=1);

use Pp\Assets\Service;
use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Response;
use Pp\Core\Router;

return static function (Router $r): void {
    $r->get('/assets/categories', function (array $p, Actor $a): void {
        Response::json(Service::categories($a));
    });

    $r->get('/assets/items', function (array $p, Actor $a): void {
        [$page, $limit, $offset] = Response::paging(36, 120);
        $q = trim((string) ($_GET['q'] ?? ''));
        $res = Service::list($a, [
            'category' => (string) ($_GET['category'] ?? ''),
            'q' => $q,
            'set' => (string) ($_GET['set'] ?? ''),
            'sort' => (string) ($_GET['sort'] ?? 'newest'),
            // 웹 목록은 목업 샘플을 빼고, MCP 키 호출만 canSample 로 판단한다(늘 true 라 키로도 막혔다 — 2026-10-10 MCP 시험)
            'addin' => $a->via !== 'key',
            'ids' => isset($_GET['ids']) ? array_slice(array_filter(explode(',', (string) $_GET['ids'])), 0, 200) : null,
            'tag' => (string) ($_GET['tag'] ?? ''),
            'slide_kind' => (string) ($_GET['slide_kind'] ?? ''),
            'slide_page' => (string) ($_GET['slide_page'] ?? ''),
        ], $limit, $offset);
        if ($q !== '' && $page === 1 && !Service::isJunkQuery($q)) {
            try {
                // day 는 NOT NULL(기본값 없음) — 빠지면 저장이 조용히 실패했다. 키 호출(powerMCP)은 mcp 채널.
                $channel = ($a->via === 'key' || ($_GET['channel'] ?? '') === 'mcp') ? 'mcp' : ((($_GET['channel'] ?? '') === 'addin') ? 'addin' : 'web');
                Db::exec('INSERT INTO asset_search_logs (q, results, user_id, channel, day) VALUES (?, ?, ?, ?, CURDATE())', [mb_substr($q, 0, 200), $res['total'], $a->id(), $channel]);
            } catch (\Throwable) {
            }
        }
        Response::list($res['rows'], $res['total'], $page, $limit, ['hidden' => $res['hidden'], 'plan' => $a->plan, 'corrected' => $res['corrected'], 'relaxed' => $res['relaxed'] ?? null, 'notes' => $res['notes'] ?? []]);
    });

    $r->get('/assets/sets', function (array $p, Actor $a): void {
        Response::json(Service::sets($a, (string) ($_GET['category'] ?? '') ?: null));
    });

    // 아래 셋은 powerMCP assets_similar·assets_list_topics·assets_suggest_keywords 용(파워플러스 옛 MCP 도구 이식)
    $r->get('/assets/topics', function (array $p, Actor $a): void {
        $cat = (string) ($_GET['category'] ?? '') ?: null;
        $q = trim((string) ($_GET['q'] ?? ''));
        // q(주제 낱말)를 주면 그 말이 붙은 에셋의 관련 주제 — 카테고리 인기 태그만으로는 '기후·환경' 같은 주제 탐색이 안 됐다(2026-10-12 MCP 시험 topics-not-themed)
        $out = ['topics' => $q !== '' ? array_map(static fn(array $r): array => ['tag' => $r['keyword'], 'count' => $r['count']], Service::related($a, $q, $cat, 30)) : Service::topics($a, $cat), 'sets' => Service::sets($a, $cat, 20)];
        if ($q !== '') {
            $out['theme'] = $q;
        }
        Response::json($out);
    });

    $r->get('/assets/suggest', function (array $p, Actor $a): void {
        Response::json(Service::suggest($a, (string) ($_GET['q'] ?? ''), (int) ($_GET['limit'] ?? 15)));
    });

    // 목업 샘플 라이브러리(사용자 2026-10-11) — 레퍼런스 엔진(powerMCP mock_ 도구)이 5분마다 읽는다. 샘플 파일은 공개(목업 <img src>).
    $r->get('/assets/mock-samples', function (array $p, Actor $a): void {
        $items = \Pp\Assets\MockSamples::all();
        Response::json(['count' => count($items), 'items' => $items]);
    });
    $r->get('/assets/samples/{id}/{kind}', function (array $p, Actor $a): void {
        \Pp\Assets\MockSamples::sendFile((string) $p['id'], (string) $p['kind']);
    });

    $r->get('/assets/items/{id}/similar', function (array $p, Actor $a): void {
        Response::json(Service::similar($a, (string) $p['id'], (int) ($_GET['limit'] ?? 12)));
    });

    $r->get('/assets/items/{id}', function (array $p, Actor $a): void {
        Response::json(Service::find($a, (string) $p['id']));
    });

    $r->get('/assets/items/{id}/file/{kind}', function (array $p, Actor $a): void {
        Service::sendFile($a, (string) $p['id'], (string) $p['kind']);
    });

    // 사용 기록(웹에서 원본 내려받기·장표 삽입 등) — 통계와 인기 정렬의 원천
    // 문맥에 맞는 에셋 고르기(Jev) — 장표 초안 다듬기 엔진·powerMCP. 로그인(또는 키·엔진) 필요 — 판단 비용이 든다
    $r->post('/assets/pick', function (array $p, Actor $a): void {
        // 장표 엔진(워커 키)은 회원이 아니라 라우터의 'auth' 로는 막힌다 — 여기서 회원·키·엔진을 모두 받는다(2026-10-12)
        if ($a->user === null && $a->kind !== 'worker') {
            throw HttpError::unauthorized();
        }
        Response::json(Service::pick($a, Response::input()));
    });

    $r->post('/assets/items/{id}/use', function (array $p, Actor $a): void {
        $item = Db::row('SELECT id, visibility, owner_user_id, org_id FROM asset_items WHERE public_id = ? AND deleted_at IS NULL', [$p['id']]);
        if (!$item) {
            throw HttpError::notFound('에셋');
        }
        \Pp\Core\Access::assert($a, $item);
        $in = Response::input();
        $channel = in_array($in['channel'] ?? '', ['addin', 'mcp', 'deck', 'web'], true) ? $in['channel'] : 'web';
        Db::exec('INSERT INTO asset_uses (item_id, user_id, api_key_id, channel) VALUES (?, ?, ?, ?)', [$item['id'], $a->id(), $a->key['id'] ?? null, $channel]);
        Response::noContent();
    }, ['auth' => true]);

    // ---- 애드인 설치 파일 (사용자 2026-10-06 "powerAssets 에는 애드인 설치법부터 다운로드까지")
    // 파일 본체는 저장소에 두지 않는다(72MB). 설정 assets.setup 이 가리키는 곳으로 302 — 기본은 옛 powerPlus 릴리스.
    $r->get('/assets/setup', function (array $p, Actor $a): void {
        // 설치 단계·로그인/사용 안내는 당분간 가린다(사용자 2026-10-07) — features.assets_setup_visible(기본 false), superadmin 은 항상 본다.
        $visible = (bool) \Pp\Core\Config::get('features.assets_setup_visible', false) || $a->hasRole('superadmin');
        Response::json(Service::setupInfo() + ['assets_setup_visible' => $visible]);
    });
    $r->get('/assets/setup/download', function (array $p, Actor $a): void {
        $s = Service::setupInfo();
        header('Location: ' . $s['url'], true, 302);
        exit;
    });

    // ---- 콘텐츠 요청 (powerPlus content_requests 이식)
    $r->get('/assets/requests', function (array $p, Actor $a): void {
        $rows = Db::rows('SELECT public_id AS id, title, kind, detail, status, created_at FROM asset_requests WHERE user_id = ? ORDER BY id DESC LIMIT 100', [$a->id()]);
        Response::json($rows);
    }, ['auth' => true]);

    $r->post('/assets/requests', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $in = Response::input();
        $title = trim((string) ($in['title'] ?? ''));
        if (mb_strlen($title) < 2 || mb_strlen($title) > 200) {
            throw HttpError::invalid('무엇이 필요한지 2~200자로 적어 주세요.');
        }
        $kind = (string) ($in['kind'] ?? '');
        if ($kind !== '' && !in_array($kind, Service::CATEGORIES, true)) {
            throw HttpError::invalid('종류가 올바르지 않습니다.');
        }
        $recent = (int) Db::val('SELECT COUNT(*) FROM asset_requests WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 DAY', [$u['id']]);
        if ($recent >= 20) {
            throw HttpError::tooMany('하루 요청 한도(20건)에 닿았습니다.');
        }
        if ($kind === '') {
            $kind = (string) (\Pp\Core\Triage::requestKind($title, (string) ($in['detail'] ?? '') ?: null) ?? '');
        }
        $pid = Ids::publicId();
        Db::exec('INSERT INTO asset_requests (public_id, user_id, title, kind, detail) VALUES (?, ?, ?, ?, ?)', [$pid, $u['id'], $title, $kind ?: null, mb_substr(trim((string) ($in['detail'] ?? '')), 0, 2000) ?: null]);
        Audit::log($a, 'asset.request', 'asset_requests:' . $pid);
        Response::json(['id' => $pid, 'title' => $title, 'kind' => $kind ?: null, 'status' => 'new'], 201);
    }, ['auth' => true]);
};
