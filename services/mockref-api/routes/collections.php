<?php
declare(strict_types=1);

/**
 * 컬렉션·저장 (S11, docs/08): 로그인 사용자의 개인 컬렉션. 팀 컬렉션은 S14 이후.
 *   GET    /api/collections                         내 컬렉션 목록(+항목 수, 썸네일 4)
 *   POST   /api/collections {name}                  새 컬렉션 (Free 는 plans.limits.collections 개까지)
 *   GET    /api/collections/{id}                    상세(항목 카드) — 공개 토큰이면 비로그인 열람: GET /api/collections/shared/{token}
 *   PATCH  /api/collections/{id} {name?,memo?,is_public?}  (is_public=true 면 share_token 발급)
 *   DELETE /api/collections/{id}
 *   POST   /api/collections/{id}/items {item_type,item_id,note?} / DELETE /api/collections/{id}/items/{type}/{item_id}
 *   POST   /api/saved/toggle {item_type,item_id}    카드 "저장" 버튼 — 기본 컬렉션("내 컬렉션", 없으면 생성)에 넣거나 뺀다 → {saved:bool, collection_id}
 *   GET    /api/saved?type=site|screen|section      내 저장 id 목록(카드 상태 표시용)
 * @var Homebox\Http\Router $router
 */

use Homebox\Auth\Session;
use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\Signer;

$requireUser = static function (): array {
    $u = Session::user();
    if ($u === null) {
        Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    return $u;
};
$own = static function (int $id, array $u): array {
    $c = Db::row("SELECT * FROM collections WHERE id = ? AND owner_type = 'user' AND owner_id = ?", [$id, $u['id']]);
    if ($c === null) {
        Response::error(404, 'NOT_FOUND', '컬렉션을 찾을 수 없습니다.');
    }
    return $c;
};
$body = static fn (): array => json_decode((string) file_get_contents('php://input'), true) ?: [];
$validType = static fn (string $t): bool => in_array($t, ['site', 'screen', 'section'], true);
$defaultCollection = static function (array $u): int {
    $c = Db::row("SELECT id FROM collections WHERE owner_type = 'user' AND owner_id = ? ORDER BY id LIMIT 1", [$u['id']]);
    if ($c !== null) {
        return (int) $c['id'];
    }
    Db::exec("INSERT INTO collections (owner_type, owner_id, created_by, name) VALUES ('user', ?, ?, '내 컬렉션')", [$u['id'], $u['id']]);
    return (int) Db::pdo()->lastInsertId();
};
/** 보는 사람의 플랜으로 그 화면이 열리는가 (보안 점검 2026-10-05 — 컬렉션·공유 링크로 잠긴 화면 원본을 받던 구멍) */
$screenOpen = static function (int $siteId, int $screenId): bool {
    static $memo = [];
    if (!array_key_exists($siteId, $memo)) {
        $memo[$siteId] = Plan::allowedScreens($siteId);
    }
    return Plan::canSee($memo[$siteId], $screenId);
};
/** 항목 카드 데이터 (유형별) */
$hydrate = static function (array $items) use ($screenOpen): array {
    $out = [];
    foreach ($items as $it) {
        $t = $it['item_type']; $id = (int) $it['item_id'];
        $card = null;
        if ($t === 'site') {
            $r = Db::row("SELECT s.id, s.slug, s.title, COALESCE(o.display_name, o.name) AS org_name, ot.name_ko AS org_type_ko, s.renewal_year, s.wa_certified, s.krds_score, d.primary_hex, d.tone,
                    (SELECT sc.thumb_asset_id FROM screens sc WHERE sc.site_id = s.id AND sc.status = 'published' AND sc.device = 'pc' AND sc.thumb_asset_id IS NOT NULL ORDER BY (sc.page_type_id = 'main') DESC, sc.sort, sc.id LIMIT 1) AS thumb_asset_id
                FROM sites s JOIN organizations o ON o.id = s.org_id JOIN org_types ot ON ot.id = o.org_type_id LEFT JOIN site_design d ON d.site_id = s.id WHERE s.id = ? AND s.status = 'published'", [$id]);
            if ($r) { $card = ['title' => $r['org_name'], 'subtitle' => $r['org_type_ko'] . ($r['renewal_year'] ? " · {$r['renewal_year']} 개편" : ''), 'meta' => 'KRDS ' . round((float) $r['krds_score']) . '%', 'image_url' => $r['thumb_asset_id'] ? Signer::url((int) $r['thumb_asset_id']) : null, 'page_url' => '/sites/' . $r['slug'], 'primary' => $r['primary_hex']]; }
        } elseif ($t === 'screen') {
            $r = Db::row("SELECT sc.id, sc.site_id, sc.title, pt.name_ko AS page_type_ko, sc.device, sc.thumb_asset_id, sc.public_asset_id, COALESCE(o.display_name, o.name) AS org_name FROM screens sc JOIN page_types pt ON pt.id = sc.page_type_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id WHERE sc.id = ? AND sc.status = 'published'", [$id]);
            if ($r) { $card = ['title' => $r['title'] ?? $r['page_type_ko'], 'subtitle' => $r['org_name'] . ' · ' . $r['page_type_ko'] . ' · ' . ($r['device'] === 'mobile' ? '모바일' : 'PC'), 'meta' => null, 'image_url' => $screenOpen((int) $r['site_id'], (int) $r['id']) ? Plan::kurl((int) $r['site_id'], $r['public_asset_id']) : null, 'locked' => !$screenOpen((int) $r['site_id'], (int) $r['id']), 'page_url' => '/screens/' . $r['id'], 'primary' => null]; }
        } else {
            $r = Db::row("SELECT x.id, x.variant, x.bbox_w, x.bbox_h, x.crop_asset_id, st.name_ko AS section_type_ko, sc.id AS screen_id, sc.site_id, pt.name_ko AS page_type_ko, COALESCE(o.display_name, o.name) AS org_name FROM sections x JOIN section_types st ON st.id = x.section_type_id JOIN screens sc ON sc.id = x.screen_id JOIN page_types pt ON pt.id = sc.page_type_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id WHERE x.id = ? AND sc.status = 'published'", [$id]);
            if ($r) { $card = ['title' => $r['section_type_ko'], 'subtitle' => $r['org_name'] . ' · ' . $r['page_type_ko'] . ($r['variant'] ? " · {$r['variant']}" : ''), 'meta' => "{$r['bbox_w']}×{$r['bbox_h']}", 'image_url' => $screenOpen((int) $r['site_id'], (int) $r['screen_id']) ? Plan::kurl((int) $r['site_id'], $r['crop_asset_id']) : null, 'locked' => !$screenOpen((int) $r['site_id'], (int) $r['screen_id']), 'page_url' => '/screens/' . $r['screen_id'] . '?section=' . $r['id'], 'primary' => null]; }
        }
        $out[] = ['id' => (int) $it['id'], 'item_type' => $t, 'item_id' => $id, 'note' => $it['note'], 'sort' => (int) $it['sort'], 'added_at' => $it['added_at'], 'card' => $card];
    }
    return $out;
};
$shape = static function (array $c, ?array $u = null) use ($screenOpen): array {
    $n = (int) Db::row('SELECT COUNT(*) AS n FROM collection_items WHERE collection_id = ?', [(int) $c['id']])['n'];
    $thumbs = [];
    foreach (Db::rows("SELECT item_type, item_id FROM collection_items WHERE collection_id = ? ORDER BY sort, id LIMIT 4", [(int) $c['id']]) as $it) {
        $aid = match ($it['item_type']) {
            'site' => Db::row("SELECT sc.thumb_asset_id AS a FROM screens sc WHERE sc.site_id = ? AND sc.status = 'published' AND sc.device = 'pc' AND sc.thumb_asset_id IS NOT NULL ORDER BY (sc.page_type_id = 'main') DESC, sc.sort LIMIT 1", [(int) $it['item_id']])['a'] ?? null,
            'screen' => (static function (int $sid) use ($screenOpen) { $r = Db::row('SELECT site_id, thumb_asset_id AS a FROM screens WHERE id = ?', [$sid]); return $r && $screenOpen((int) $r['site_id'], $sid) ? $r['a'] : null; })((int) $it['item_id']),
            default => (static function (int $xid) use ($screenOpen) { $r = Db::row('SELECT sc.site_id, sc.id AS screen_id, x.crop_asset_id AS a FROM sections x JOIN screens sc ON sc.id = x.screen_id WHERE x.id = ?', [$xid]); return $r && $screenOpen((int) $r['site_id'], (int) $r['screen_id']) && Plan::koglOpen((int) $r['site_id']) ? $r['a'] : null; })((int) $it['item_id']),
        };
        if ($aid) {
            $thumbs[] = Signer::url((int) $aid);
        }
    }
    return ['id' => (int) $c['id'], 'name' => $c['name'], 'memo' => $c['memo'], 'is_public' => (bool) $c['is_public'], 'share_token' => $c['is_public'] ? $c['share_token'] : null, 'items_n' => $n, 'thumbs' => $thumbs, 'created_at' => $c['created_at'], 'updated_at' => $c['updated_at'], 'mine' => $u !== null && (int) $c['owner_id'] === (int) $u['id']];
};

$router->get('/api/collections', static function () use ($requireUser, $shape): void {
    $u = $requireUser();
    $rows = Db::rows("SELECT * FROM collections WHERE owner_type = 'user' AND owner_id = ? ORDER BY id", [$u['id']]);
    $plan = Db::row("SELECT p.limits FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.owner_type = 'user' AND s.owner_id = ? AND s.status IN ('trial','active','past_due') ORDER BY s.id DESC LIMIT 1", [$u['id']]) ?? Db::row("SELECT limits FROM plans WHERE id = 'free'");
    $limits = is_string($plan['limits'] ?? null) ? (json_decode($plan['limits'], true) ?: []) : [];
    Response::json(['items' => array_map(static fn (array $c): array => $shape($c, $u), $rows), 'limit' => $u['role'] === 'admin' ? -1 : (int) ($limits['collections'] ?? 1)], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/collections', static function () use ($requireUser, $body): void {
    $u = $requireUser();
    $b = $body();
    $name = trim((string) ($b['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 80) {
        Response::error(422, 'INVALID_NAME', '컬렉션 이름은 1~80자입니다.');
    }
    $plan = Db::row("SELECT p.limits FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.owner_type = 'user' AND s.owner_id = ? AND s.status IN ('trial','active','past_due') ORDER BY s.id DESC LIMIT 1", [$u['id']]) ?? Db::row("SELECT limits FROM plans WHERE id = 'free'");
    $limits = is_string($plan['limits'] ?? null) ? (json_decode($plan['limits'], true) ?: []) : [];
    $max = $u['role'] === 'admin' ? -1 : (int) ($limits['collections'] ?? 1);
    $n = (int) Db::row("SELECT COUNT(*) AS n FROM collections WHERE owner_type = 'user' AND owner_id = ?", [$u['id']])['n'];
    if ($max >= 0 && $n >= $max) {
        Response::error(402, 'PLAN_LIMIT', "이 플랜은 컬렉션을 {$max}개까지 만들 수 있습니다.", ['upgrade_url' => '/pricing']);
    }
    Db::exec("INSERT INTO collections (owner_type, owner_id, created_by, name, memo) VALUES ('user', ?, ?, ?, ?)", [$u['id'], $u['id'], $name, isset($b['memo']) ? mb_substr((string) $b['memo'], 0, 2000) : null]);
    Response::json(['id' => (int) Db::pdo()->lastInsertId()], 201);
});

$router->get('/api/collections/shared/{token}', static function (array $p) use ($shape, $hydrate): void {
    $c = Db::row('SELECT * FROM collections WHERE share_token = ? AND is_public = 1', [(string) $p['token']]);
    if ($c === null) {
        Response::error(404, 'NOT_FOUND', '공유 링크가 없거나 비공개로 전환되었습니다.');
    }
    $items = Db::rows('SELECT * FROM collection_items WHERE collection_id = ? ORDER BY sort, id', [(int) $c['id']]);
    Response::json(['collection' => $shape($c, Session::user()), 'items' => $hydrate($items)], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/collections/{id}', static function (array $p) use ($requireUser, $own, $shape, $hydrate): void {
    $u = $requireUser();
    $c = $own((int) $p['id'], $u);
    $items = Db::rows('SELECT * FROM collection_items WHERE collection_id = ? ORDER BY sort, id', [(int) $c['id']]);
    Response::json(['collection' => $shape($c, $u), 'items' => $hydrate($items)], 200, ['Cache-Control' => 'no-store']);
});

$router->add('PATCH', '/api/collections/{id}', static function (array $p) use ($requireUser, $own, $body, $shape): void {
    $u = $requireUser();
    $c = $own((int) $p['id'], $u);
    $b = $body();
    if (isset($b['name'])) {
        $name = trim((string) $b['name']);
        if ($name === '' || mb_strlen($name) > 80) {
            Response::error(422, 'INVALID_NAME', '컬렉션 이름은 1~80자입니다.');
        }
        Db::exec('UPDATE collections SET name = ? WHERE id = ?', [$name, (int) $c['id']]);
    }
    if (array_key_exists('memo', $b)) {
        Db::exec('UPDATE collections SET memo = ? WHERE id = ?', [$b['memo'] === null ? null : mb_substr((string) $b['memo'], 0, 2000), (int) $c['id']]);
    }
    if (isset($b['is_public'])) {
        $pub = (bool) $b['is_public'];
        $token = $c['share_token'] ?: substr(strtr(base64_encode(random_bytes(16)), '+/', '-_'), 0, 22);
        Db::exec('UPDATE collections SET is_public = ?, share_token = ? WHERE id = ?', [$pub ? 1 : 0, $token, (int) $c['id']]);
    }
    Response::json(['collection' => $shape(Db::row('SELECT * FROM collections WHERE id = ?', [(int) $c['id']]), $u)]);
});

$router->add('DELETE', '/api/collections/{id}', static function (array $p) use ($requireUser, $own): void {
    $u = $requireUser();
    $c = $own((int) $p['id'], $u);
    Db::exec('DELETE FROM collections WHERE id = ?', [(int) $c['id']]);
    Response::json(['ok' => true]);
});

$router->post('/api/collections/{id}/items', static function (array $p) use ($requireUser, $own, $body, $validType): void {
    $u = $requireUser();
    $c = $own((int) $p['id'], $u);
    $b = $body();
    $t = (string) ($b['item_type'] ?? ''); $id = (int) ($b['item_id'] ?? 0);
    if (!$validType($t) || $id <= 0) {
        Response::error(422, 'INVALID_ITEM', 'item_type(site|screen|section)·item_id 가 필요합니다.');
    }
    Db::exec('INSERT IGNORE INTO collection_items (collection_id, item_type, item_id, note, sort, added_by) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(i.sort),0)+1 FROM collection_items i WHERE i.collection_id = ?), ?)', [(int) $c['id'], $t, $id, isset($b['note']) ? mb_substr((string) $b['note'], 0, 300) : null, (int) $c['id'], $u['id']]);
    Response::json(['ok' => true], 201);
});

$router->add('DELETE', '/api/collections/{id}/items/{type}/{item}', static function (array $p) use ($requireUser, $own): void {
    $u = $requireUser();
    $c = $own((int) $p['id'], $u);
    Db::exec('DELETE FROM collection_items WHERE collection_id = ? AND item_type = ? AND item_id = ?', [(int) $c['id'], (string) $p['type'], (int) $p['item']]);
    Response::json(['ok' => true]);
});

$router->post('/api/saved/toggle', static function () use ($requireUser, $body, $validType, $defaultCollection): void {
    $u = $requireUser();
    $b = $body();
    $t = (string) ($b['item_type'] ?? ''); $id = (int) ($b['item_id'] ?? 0);
    if (!$validType($t) || $id <= 0) {
        Response::error(422, 'INVALID_ITEM', 'item_type(site|screen|section)·item_id 가 필요합니다.');
    }
    $cid = isset($b['collection_id']) ? (int) $b['collection_id'] : $defaultCollection($u);
    if (isset($b['collection_id']) && Db::row("SELECT id FROM collections WHERE id = ? AND owner_type = 'user' AND owner_id = ?", [$cid, $u['id']]) === null) {
        Response::error(404, 'NOT_FOUND', '컬렉션을 찾을 수 없습니다.');
    }
    $exists = Db::row('SELECT id FROM collection_items WHERE collection_id = ? AND item_type = ? AND item_id = ?', [$cid, $t, $id]);
    if ($exists !== null) {
        Db::exec('DELETE FROM collection_items WHERE id = ?', [(int) $exists['id']]);
        Response::json(['saved' => false, 'collection_id' => $cid]);
    }
    Db::exec('INSERT INTO collection_items (collection_id, item_type, item_id, sort, added_by) VALUES (?, ?, ?, (SELECT COALESCE(MAX(i.sort),0)+1 FROM collection_items i WHERE i.collection_id = ?), ?)', [$cid, $t, $id, $cid, $u['id']]);
    Response::json(['saved' => true, 'collection_id' => $cid], 201);
});

$router->get('/api/saved', static function () use ($requireUser): void {
    $u = $requireUser();
    $rows = Db::rows("SELECT i.item_type, i.item_id FROM collection_items i JOIN collections c ON c.id = i.collection_id WHERE c.owner_type = 'user' AND c.owner_id = ?", [$u['id']]);
    $out = ['site' => [], 'screen' => [], 'section' => []];
    foreach ($rows as $r) {
        $out[$r['item_type']][] = (int) $r['item_id'];
    }
    Response::json($out, 200, ['Cache-Control' => 'no-store']);
});
