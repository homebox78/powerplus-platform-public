<?php
/**
 * 저장(북마크)·컬렉션 라우트 — /api/v1/saved/… · /api/v1/collections/… · /api/v1/c/{token}
 * 출처: homebox-handoff api/routes/collections.php (기본 컬렉션 토글·컬렉션 CRUD·공유 토큰)를 REST v1 규약과 모듈 교차 대상으로.
 *
 * 대상(item_type): asset(asset_items.public_id) · gallery(mock_gallery.id — 공유 시안) · post(comm_posts.public_id).
 * 기획 G30: 저장·컬렉션·공유 링크는 원본을 내보내는 출구다 → 항목을 꺼낼 때마다 보는 사람으로 Access::can 을 다시 판정하고,
 *   못 보면 제목을 일반 문구로 바꾸고 이미지 URL 을 뺀다(locked). 저장할 때도 볼 수 없는 대상은 받지 않는다.
 *
 *   GET    /saved?type=&full=1             내 저장 id 목록(카드 상태 표시용). full=1 이면 최근 저장 항목 카드까지
 *   POST   /saved/toggle {type,id}          있으면 내 모든 컬렉션에서 빼고, 없으면 기본 컬렉션('내 저장')에 넣는다 → {saved, collection_id}
 *   GET    /collections · POST /collections {name,memo?}
 *   GET|PATCH|DELETE /collections/{id}      PATCH {name?,memo?}
 *   POST   /collections/{id}/items {type,id} · DELETE /collections/{id}/items/{type}/{ref}
 *   POST   /collections/{id}/share {on?}    공유 링크 켜기·끄기 → {share_token}
 *   GET    /c/{token}                       공유 컬렉션(로그인 없이 읽기 전용)
 */
declare(strict_types=1);

use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Points;
use Pp\Core\Response;
use Pp\Core\Router;

const SAVED_TYPES = ['asset', 'gallery', 'post'];
const SAVED_TYPE_KO = ['asset' => '에셋', 'gallery' => '시안', 'post' => '글'];
const SAVED_ASSET_KO = ['icon' => '아이콘', 'photo' => '사진', 'illust' => '일러스트', 'diagram' => '다이어그램', 'logo' => '로고', 'ppt' => '장표', 'mockup_sample' => '목업 샘플'];
const SAVED_COLLECTION_MAX = 50; // 사람당 컬렉션 상한(관리자 무제한). 플랜별 값이 생기면 core_plans.limits.collections 로.

return static function (Router $r): void {
    /** 대상 하나를 보는 사람 기준 카드로. 없으면 null, 못 보면 locked. ['res'] 는 판정에 쓴 행(내부용). */
    $resolve = static function (string $type, string $ref, Actor $a): ?array {
        if ($type === 'asset') {
            $row = Db::row('SELECT public_id, category, name, alt, visibility, owner_user_id, org_id FROM asset_items WHERE public_id = ? AND deleted_at IS NULL', [$ref]);
            if (!$row) {
                return null;
            }
            $cat = SAVED_ASSET_KO[$row['category']] ?? $row['category'];
            if (!Access::can($a, $row)) {
                return ['title' => "잠긴 {$cat}", 'subtitle' => $cat . ' · 현재 플랜 밖', 'image_url' => null, 'page_url' => '/assets/browse', 'locked' => true, 'kind' => $row['category']];
            }
            return [
                'title' => $row['name'] ?: ($row['alt'] ?: $cat), 'subtitle' => $cat,
                'image_url' => "/api/v1/assets/items/{$row['public_id']}/file/thumb",
                'page_url' => '/assets/browse?category=' . $row['category'] . '&item=' . $row['public_id'], 'locked' => false, 'kind' => $row['category'],
            ];
        }
        if ($type === 'gallery') {
            if (!ctype_digit($ref)) {
                return null;
            }
            $g = Db::row('SELECT g.id, g.title, g.score, g.status, g.owner_user_id, g.device, g.updated_at, u.name AS owner_name FROM mock_gallery g LEFT JOIN core_users u ON u.id = g.owner_user_id WHERE g.id = ?', [(int) $ref]);
            if (!$g) {
                return null;
            }
            // 갤러리는 visibility 열이 없다 — 공유 중이면 public, 아니면 만든 사람만(mock.php $gCanSee 와 같은 규칙)
            $res = ['visibility' => $g['status'] === 'shared' ? 'public' : 'private', 'owner_user_id' => $g['owner_user_id']];
            if (!Access::can($a, $res)) {
                return ['title' => '볼 수 없는 시안', 'subtitle' => '공유가 내려간 시안', 'image_url' => null, 'page_url' => '/mock/mockups?tab=gallery', 'locked' => true, 'kind' => 'gallery'];
            }
            $mine = $a->id() !== null && (int) $g['owner_user_id'] === $a->id();
            $unlocked = $mine || $a->isAdmin() || ($a->id() !== null && Db::row('SELECT 1 AS x FROM mock_gallery_unlocks WHERE gallery_id = ? AND user_id = ?', [(int) $g['id'], $a->id()]) !== null);
            return [
                'title' => (string) $g['title'] ?: '제목 없는 시안',
                'subtitle' => (trim((string) ($g['owner_name'] ?? '')) ?: '회원') . ' · ' . (int) $g['score'] . '점 · ' . ($g['device'] === 'mobile' ? '모바일' : 'PC'),
                'image_url' => '/api/v1/mock/gallery/' . (int) $g['id'] . '/thumb?v=' . strtotime((string) $g['updated_at']),
                'page_url' => '/mock/mockups?gallery=' . (int) $g['id'], 'locked' => !$unlocked, 'lock_label' => $unlocked ? null : '포인트로 열기', 'kind' => 'gallery',
            ];
        }
        $p = Db::row('SELECT public_id, title, body, category, visibility, owner_user_id, org_id FROM comm_posts WHERE public_id = ? AND deleted_at IS NULL', [$ref]);
        if (!$p) {
            return null;
        }
        if (!Access::can($a, $p)) {
            return ['title' => '볼 수 없는 글', 'subtitle' => '임직원 전용 게시판', 'image_url' => null, 'page_url' => '/community', 'locked' => true, 'kind' => 'post'];
        }
        return [
            'title' => (string) $p['title'], 'subtitle' => mb_substr(preg_replace('/\s+/u', ' ', (string) $p['body']) ?? '', 0, 80),
            'image_url' => null, 'page_url' => '/community/' . $p['public_id'], 'locked' => false, 'kind' => 'post',
        ];
    };
    /** $owner = 컬렉션 주인이 보는 중(항목 빼기에 ref 가 필요). 공유 링크로 보는 남에게는 잠긴 항목의 식별자도 내주지 않는다. */
    $hydrate = static function (array $items, Actor $a, bool $owner = true) use ($resolve): array {
        return array_map(static function (array $it) use ($resolve, $a, $owner): array {
            $card = $resolve($it['item_type'], $it['item_public_id'], $a);
            $hide = !$owner && ($card === null || ($card['locked'] && $card['kind'] !== 'gallery'));
            return [
                'type' => $it['item_type'], 'ref' => $hide ? null : $it['item_public_id'], 'type_ko' => SAVED_TYPE_KO[$it['item_type']] ?? $it['item_type'],
                'note' => $it['note'], 'added_at' => $it['added_at'], 'card' => $card,
            ];
        }, $items);
    };
    $shape = static function (array $c, Actor $a, bool $withThumbs = true) use ($resolve): array {
        $n = (int) Db::val('SELECT COUNT(*) FROM core_collection_items WHERE collection_id = ?', [(int) $c['id']]);
        $thumbs = [];
        if ($withThumbs) {
            foreach (Db::rows('SELECT item_type, item_public_id FROM core_collection_items WHERE collection_id = ? ORDER BY sort DESC, id DESC LIMIT 12', [(int) $c['id']]) as $it) {
                $card = $resolve($it['item_type'], $it['item_public_id'], $a);
                // 갤러리 썸네일은 공유 중이면 누구나 보는 그림(열람만 포인트) — 잠긴 에셋·글만 뺀다
                if ($card && $card['image_url'] && (!$card['locked'] || $card['kind'] === 'gallery')) {
                    $thumbs[] = $card['image_url'];
                }
                if (count($thumbs) >= 4) {
                    break;
                }
            }
        }
        $mine = $a->id() !== null && (int) $c['owner_user_id'] === $a->id();
        $shared = $c['visibility'] === 'public' && $c['share_token'];
        return [
            'id' => $c['public_id'], 'name' => $c['name'], 'memo' => $c['memo'], 'is_default' => (bool) $c['is_default'],
            'shared' => (bool) $shared, 'share_token' => $mine && $shared ? $c['share_token'] : null,
            'items_n' => $n, 'thumbs' => $thumbs, 'created_at' => $c['created_at'], 'updated_at' => $c['updated_at'], 'mine' => $mine,
        ];
    };
    $own = static function (string $pid, Actor $a): array {
        $u = Auth::requireUser($a);
        $c = Db::row('SELECT * FROM core_collections WHERE public_id = ? AND owner_user_id = ?', [$pid, $u['id']]);
        if (!$c) {
            throw HttpError::notFound('컬렉션');
        }
        return $c;
    };
    $defaultCollection = static function (array $u, ?int $orgId): int {
        $c = Db::row('SELECT id FROM core_collections WHERE owner_user_id = ? ORDER BY is_default DESC, id LIMIT 1', [$u['id']]);
        if ($c) {
            return (int) $c['id'];
        }
        Db::exec("INSERT INTO core_collections (public_id, owner_user_id, org_id, name, is_default) VALUES (?, ?, ?, '내 저장', 1)", [Ids::publicId(), $u['id'], $orgId]);
        return Db::lastId();
    };
    $target = static function (array $b, Actor $a) use ($resolve): array {
        $type = (string) ($b['type'] ?? '');
        $ref = trim((string) ($b['id'] ?? ''));
        if (!in_array($type, SAVED_TYPES, true) || $ref === '' || strlen($ref) > 32) {
            throw HttpError::invalid('type(asset|gallery|post)·id 가 필요합니다.');
        }
        $card = $resolve($type, $ref, $a);
        // 없는 것·볼 수 없는 것은 저장하지 않는다(존재 여부를 떠보는 출구가 되지 않게 둘 다 404)
        if ($card === null || ($card['locked'] && $type !== 'gallery')) {
            throw HttpError::notFound(SAVED_TYPE_KO[$type]);
        }
        if ($type === 'gallery' && $card['title'] === '볼 수 없는 시안') {
            throw HttpError::notFound('시안');
        }
        return [$type, $ref];
    };
    $nextSort = static fn (int $cid): int => (int) Db::val('SELECT COALESCE(MAX(sort), 0) + 1 FROM core_collection_items WHERE collection_id = ?', [$cid]);

    // ---------------------------------------------------------------- 저장 버튼
    $r->get('/saved', function (array $p, Actor $a) use ($hydrate): void {
        $u = Auth::requireUser($a);
        $type = (string) ($_GET['type'] ?? '');
        $where = 'c.owner_user_id = ?';
        $args = [$u['id']];
        if (in_array($type, SAVED_TYPES, true)) {
            $where .= ' AND i.item_type = ?';
            $args[] = $type;
        }
        $ids = ['asset' => [], 'gallery' => [], 'post' => []];
        foreach (Db::rows("SELECT DISTINCT i.item_type, i.item_public_id FROM core_collection_items i JOIN core_collections c ON c.id = i.collection_id WHERE {$where}", $args) as $row) {
            $ids[$row['item_type']][] = $row['item_public_id'];
        }
        $out = ['ids' => $ids];
        if (($_GET['full'] ?? '') === '1') {
            $items = Db::rows("SELECT i.* FROM core_collection_items i JOIN core_collections c ON c.id = i.collection_id WHERE {$where} ORDER BY i.added_at DESC, i.id DESC LIMIT 120", $args);
            $out['items'] = $hydrate($items, $a);
        }
        Response::json($out);
    }, ['auth' => true]);

    $r->post('/saved/toggle', function (array $p, Actor $a) use ($target, $defaultCollection, $nextSort): void {
        $u = Auth::requireUser($a);
        [$type, $ref] = $target(Response::input(), $a);
        $had = Db::rows('SELECT i.id FROM core_collection_items i JOIN core_collections c ON c.id = i.collection_id WHERE c.owner_user_id = ? AND i.item_type = ? AND i.item_public_id = ?', [$u['id'], $type, $ref]);
        $cid = $defaultCollection($u, $a->orgId);
        $cpid = (string) Db::val('SELECT public_id FROM core_collections WHERE id = ?', [$cid]);
        if ($had) {
            Db::exec('DELETE FROM core_collection_items WHERE id IN (' . implode(',', array_map(static fn ($x) => (int) $x['id'], $had)) . ')');
            Response::json(['saved' => false, 'collection_id' => $cpid]);
        }
        Db::exec('INSERT INTO core_collection_items (collection_id, item_type, item_public_id, sort) VALUES (?, ?, ?, ?)', [$cid, $type, $ref, $nextSort($cid)]);
        Response::json(['saved' => true, 'collection_id' => $cpid], 201);
    }, ['auth' => true]);

    // ---------------------------------------------------------------- 컬렉션
    $r->get('/collections', function (array $p, Actor $a) use ($shape): void {
        $u = Auth::requireUser($a);
        $rows = Db::rows('SELECT * FROM core_collections WHERE owner_user_id = ? ORDER BY is_default DESC, updated_at DESC, id DESC', [$u['id']]);
        Response::json(['items' => array_map(static fn (array $c): array => $shape($c, $a), $rows), 'limit' => $a->isAdmin() ? -1 : SAVED_COLLECTION_MAX]);
    }, ['auth' => true]);

    $r->post('/collections', function (array $p, Actor $a) use ($shape): void {
        $u = Auth::requireUser($a);
        $b = Response::input();
        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 80) {
            throw HttpError::invalid('컬렉션 이름은 1~80자로 써 주세요.');
        }
        $n = (int) Db::val('SELECT COUNT(*) FROM core_collections WHERE owner_user_id = ?', [$u['id']]);
        if (!$a->isAdmin() && $n >= SAVED_COLLECTION_MAX) {
            throw HttpError::tooMany('컬렉션은 ' . SAVED_COLLECTION_MAX . '개까지 만들 수 있습니다.');
        }
        $pid = Ids::publicId();
        Db::exec('INSERT INTO core_collections (public_id, owner_user_id, org_id, name, memo, is_default) VALUES (?, ?, ?, ?, ?, ?)',
            [$pid, $u['id'], $a->orgId, $name, isset($b['memo']) ? mb_substr((string) $b['memo'], 0, 2000) : null, $n === 0 ? 1 : 0]);
        Response::json($shape(Db::row('SELECT * FROM core_collections WHERE public_id = ?', [$pid]), $a, false), 201);
    }, ['auth' => true]);

    $r->get('/collections/{id}', function (array $p, Actor $a) use ($own, $shape, $hydrate): void {
        $c = $own((string) $p['id'], $a);
        $items = Db::rows('SELECT * FROM core_collection_items WHERE collection_id = ? ORDER BY sort DESC, id DESC', [(int) $c['id']]);
        Response::json(['collection' => $shape($c, $a, false), 'items' => $hydrate($items, $a)]);
    }, ['auth' => true]);

    $r->patch('/collections/{id}', function (array $p, Actor $a) use ($own, $shape): void {
        $c = $own((string) $p['id'], $a);
        $b = Response::input();
        if (array_key_exists('name', $b)) {
            $name = trim((string) $b['name']);
            if ($name === '' || mb_strlen($name) > 80) {
                throw HttpError::invalid('컬렉션 이름은 1~80자로 써 주세요.');
            }
            Db::exec('UPDATE core_collections SET name = ? WHERE id = ?', [$name, (int) $c['id']]);
        }
        if (array_key_exists('memo', $b)) {
            Db::exec('UPDATE core_collections SET memo = ? WHERE id = ?', [$b['memo'] === null ? null : mb_substr((string) $b['memo'], 0, 2000), (int) $c['id']]);
        }
        Response::json($shape(Db::row('SELECT * FROM core_collections WHERE id = ?', [(int) $c['id']]), $a, false));
    }, ['auth' => true]);

    $r->delete('/collections/{id}', function (array $p, Actor $a) use ($own): void {
        $c = $own((string) $p['id'], $a);
        Db::exec('DELETE FROM core_collections WHERE id = ?', [(int) $c['id']]);
        Audit::log($a, 'collection.delete', 'core_collections:' . $c['public_id']);
        Response::noContent();
    }, ['auth' => true]);

    $r->post('/collections/{id}/items', function (array $p, Actor $a) use ($own, $target, $nextSort): void {
        $c = $own((string) $p['id'], $a);
        $b = Response::input();
        [$type, $ref] = $target($b, $a);
        Db::exec('INSERT IGNORE INTO core_collection_items (collection_id, item_type, item_public_id, note, sort) VALUES (?, ?, ?, ?, ?)',
            [(int) $c['id'], $type, $ref, isset($b['note']) ? mb_substr((string) $b['note'], 0, 300) : null, $nextSort((int) $c['id'])]);
        Db::exec('UPDATE core_collections SET updated_at = NOW(3) WHERE id = ?', [(int) $c['id']]);
        Response::json(['ok' => true], 201);
    }, ['auth' => true]);

    $r->delete('/collections/{id}/items/{type}/{ref}', function (array $p, Actor $a) use ($own): void {
        $c = $own((string) $p['id'], $a);
        Db::exec('DELETE FROM core_collection_items WHERE collection_id = ? AND item_type = ? AND item_public_id = ?', [(int) $c['id'], (string) $p['type'], (string) $p['ref']]);
        Response::noContent();
    }, ['auth' => true]);

    $r->post('/collections/{id}/share', function (array $p, Actor $a) use ($own, $shape): void {
        $c = $own((string) $p['id'], $a);
        $on = (bool) (Response::input()['on'] ?? true);
        $token = $c['share_token'] ?: Ids::token(16);
        Db::exec('UPDATE core_collections SET visibility = ?, share_token = ?, shared_at = ? WHERE id = ?',
            [$on ? 'public' : 'private', $token, $on ? date('Y-m-d H:i:s') : null, (int) $c['id']]);
        if ($on && !$c['share_token']) {
            Points::award((int) $a->id(), 'share_create', 'core_collections', (string) $c['public_id']);
        }
        Audit::log($a, $on ? 'collection.share' : 'collection.unshare', 'core_collections:' . $c['public_id']);
        Response::json($shape(Db::row('SELECT * FROM core_collections WHERE id = ?', [(int) $c['id']]), $a, false));
    }, ['auth' => true]);

    // 공유 컬렉션 — 로그인 없이 읽기 전용. 항목은 보는 사람(익명 포함) 기준으로 다시 잠근다(G30).
    $r->get('/c/{token}', function (array $p, Actor $a) use ($shape, $hydrate): void {
        $c = Db::row("SELECT * FROM core_collections WHERE share_token = ? AND visibility = 'public'", [(string) $p['token']]);
        if (!$c) {
            throw HttpError::notFound('공유 컬렉션');
        }
        $items = Db::rows('SELECT * FROM core_collection_items WHERE collection_id = ? ORDER BY sort DESC, id DESC', [(int) $c['id']]);
        $owner = Db::row('SELECT name FROM core_users WHERE id = ?', [(int) $c['owner_user_id']]);
        header('X-Robots-Tag: noindex, nofollow');
        Response::json(['collection' => $shape($c, $a, false) + ['owner' => trim((string) ($owner['name'] ?? '')) ?: '회원'], 'items' => $hydrate($items, $a, (int) $c['owner_user_id'] === (int) $a->id())]);
    });
};
