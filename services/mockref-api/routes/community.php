<?php
declare(strict_types=1);

/**
 * 커뮤니티 (2026-09-26 사용자 지시 "상단 메뉴에 커뮤니티").
 *   GET    /api/community/categories                         분류별 글 수
 *   GET    /api/community/posts?category=&q=&sort=new|popular&cursor=
 *   GET    /api/community/posts/{id}                          글 + 댓글 (조회수 +1)
 *   POST   /api/community/posts {category,title,body,site_slug?}   로그인, 공지는 관리자만 (공지는 전체 회원 알림)
 *   PATCH  /api/community/posts/{id} {title?,body?,category?}  작성자·관리자
 *   DELETE /api/community/posts/{id}                          작성자·관리자 (소프트 삭제)
 *   POST   /api/community/posts/{id}/comments {body}          로그인 → 글쓴이에게 알림
 *   DELETE /api/community/comments/{id}                       작성자·관리자
 *   POST   /api/community/posts/{id}/like                     로그인, 토글 → 켜질 때 글쓴이에게 알림
 * 알림: GET /api/notifications · GET /api/notifications/unread · POST /api/notifications/read {ids?|all}
 * @var Homebox\Http\Router $router
 */

use Homebox\Auth\Session;
use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Notify;

const COMMUNITY_CATEGORIES = [
    ['id' => 'notice',   'name' => '공지',        'desc' => '홈박스 소식과 업데이트'],
    ['id' => 'qna',      'name' => '질문·답변',   'desc' => '관공서 UX·KRDS·MCP 사용법 질문'],
    ['id' => 'showcase', 'name' => '작업 공유',   'desc' => '홈박스로 만든 시안·목업 공유'],
    ['id' => 'tip',      'name' => '레퍼런스 제보', 'desc' => '좋은 관공서 사이트·개편 소식 제보'],
    ['id' => 'free',     'name' => '자유',        'desc' => '자유 이야기'],
];

$cBody = static fn (): array => json_decode((string) file_get_contents('php://input'), true) ?: [];
$cNeedUser = static fn (): array => Session::user() ?? Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
$cIsAdmin = static fn (?array $u): bool => ($u['role'] ?? '') === 'admin';
$cAuthor = static fn (array $r): array => [
    'id' => (int) $r['user_id'],
    'name' => trim((string) ($r['author_name'] ?? '')) ?: '회원',
    'avatar' => $r['author_avatar'] ?: null,
    'admin' => ($r['author_role'] ?? '') === 'admin',
];
$cPost = static function (int $id): array {
    $r = Db::row('SELECT p.*, u.name AS author_name, u.avatar_url AS author_avatar, u.role AS author_role
                  FROM community_posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.deleted_at IS NULL', [$id]);
    return $r ?? Response::error(404, 'NOT_FOUND', '글을 찾을 수 없습니다.');
};
$cValid = static function (array $b, bool $partial) use ($cIsAdmin): array {
    $out = [];
    if (!$partial || array_key_exists('category', $b)) {
        $cat = (string) ($b['category'] ?? '');
        if (!in_array($cat, array_column(COMMUNITY_CATEGORIES, 'id'), true)) {
            Response::error(422, 'INVALID', '분류를 골라 주세요.');
        }
        if ($cat === 'notice' && !$cIsAdmin(Session::user())) {
            Response::error(403, 'FORBIDDEN', '공지는 관리자만 쓸 수 있습니다.');
        }
        $out['category'] = $cat;
    }
    if (!$partial || array_key_exists('title', $b)) {
        $t = trim((string) ($b['title'] ?? ''));
        if (mb_strlen($t) < 2 || mb_strlen($t) > 120) {
            Response::error(422, 'INVALID', '제목은 2~120자로 써 주세요.');
        }
        $out['title'] = $t;
    }
    if (!$partial || array_key_exists('body', $b)) {
        $t = trim((string) ($b['body'] ?? ''));
        if (mb_strlen($t) < 2 || mb_strlen($t) > 20000) {
            Response::error(422, 'INVALID', '내용은 2~20,000자로 써 주세요.');
        }
        $out['body'] = $t;
    }
    if (array_key_exists('site_slug', $b)) {
        $s = trim((string) $b['site_slug']);
        $out['site_slug'] = preg_match('/^[a-z0-9-]{1,100}$/', $s) === 1 ? $s : null;
    }
    return $out;
};

$router->get('/api/community/categories', static function (): void {
    $cnt = [];
    foreach (Db::rows('SELECT category, COUNT(*) AS n FROM community_posts WHERE deleted_at IS NULL GROUP BY category') as $r) {
        $cnt[$r['category']] = (int) $r['n'];
    }
    Response::json(['items' => array_map(static fn (array $c): array => $c + ['count' => $cnt[$c['id']] ?? 0], COMMUNITY_CATEGORIES),
        'total' => array_sum($cnt)], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/community/posts', static function () use ($cAuthor): void {
    $cat = (string) ($_GET['category'] ?? '');
    $q = trim((string) ($_GET['q'] ?? ''));
    $sort = ($_GET['sort'] ?? 'new') === 'popular' ? 'popular' : 'new';
    $mine = ($_GET['mine'] ?? '') === '1';
    $limit = max(1, min(50, (int) ($_GET['limit'] ?? 20)));
    $offset = max(0, (int) ($_GET['cursor'] ?? 0));
    $where = ['p.deleted_at IS NULL'];
    $params = [];
    if (in_array($cat, array_column(COMMUNITY_CATEGORIES, 'id'), true)) { $where[] = 'p.category = ?'; $params[] = $cat; }
    if ($q !== '') { $where[] = '(p.title LIKE ? OR p.body LIKE ?)'; $like = '%' . addcslashes($q, '%_\\') . '%'; $params[] = $like; $params[] = $like; }
    if ($mine) { $u = Session::user() ?? Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.'); $where[] = 'p.user_id = ?'; $params[] = $u['id']; }
    $order = $sort === 'popular' ? 'p.pinned DESC, (p.like_count * 3 + p.comment_count * 2 + p.view_count / 10) DESC, p.id DESC' : 'p.pinned DESC, p.id DESC';
    $rows = Db::rows('SELECT p.id, p.category, p.title, p.body, p.site_slug, p.pinned, p.comment_count, p.like_count, p.view_count, p.created_at, p.user_id,
                             u.name AS author_name, u.avatar_url AS author_avatar, u.role AS author_role
                      FROM community_posts p LEFT JOIN users u ON u.id = p.user_id
                      WHERE ' . implode(' AND ', $where) . " ORDER BY $order LIMIT " . ($limit + 1) . " OFFSET $offset", $params);
    $more = count($rows) > $limit;
    $items = array_map(static fn (array $r): array => [
        'id' => (int) $r['id'], 'category' => $r['category'], 'title' => $r['title'],
        'excerpt' => mb_substr(preg_replace('/\s+/u', ' ', (string) $r['body']), 0, 140),
        'site_slug' => $r['site_slug'], 'pinned' => (bool) $r['pinned'],
        'comments' => (int) $r['comment_count'], 'likes' => (int) $r['like_count'], 'views' => (int) $r['view_count'],
        'created_at' => $r['created_at'], 'author' => $cAuthor($r),
    ], array_slice($rows, 0, $limit));
    Response::json(['items' => $items, 'next' => $more ? $offset + $limit : null], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/community/posts/{id}', static function (array $p) use ($cPost, $cAuthor, $cIsAdmin): void {
    $r = $cPost((int) $p['id']);
    Db::exec('UPDATE community_posts SET view_count = view_count + 1 WHERE id = ?', [$r['id']]);
    $u = Session::user();
    $admin = $cIsAdmin($u);
    $comments = array_map(static fn (array $c): array => [
        'id' => (int) $c['id'], 'body' => $c['body'], 'created_at' => $c['created_at'], 'author' => $cAuthor($c),
        'can_delete' => $u !== null && ($admin || (int) $c['user_id'] === (int) $u['id']),
    ], Db::rows('SELECT c.id, c.body, c.created_at, c.user_id, u.name AS author_name, u.avatar_url AS author_avatar, u.role AS author_role
                 FROM community_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.post_id = ? AND c.deleted_at IS NULL ORDER BY c.id', [$r['id']]));
    $liked = $u !== null && Db::row('SELECT 1 AS x FROM community_likes WHERE post_id = ? AND user_id = ?', [$r['id'], $u['id']]) !== null;
    Response::json([
        'id' => (int) $r['id'], 'category' => $r['category'], 'title' => $r['title'], 'body' => $r['body'], 'site_slug' => $r['site_slug'],
        'pinned' => (bool) $r['pinned'], 'likes' => (int) $r['like_count'], 'views' => (int) $r['view_count'] + 1,
        'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'], 'author' => $cAuthor($r),
        'liked' => $liked, 'can_edit' => $u !== null && ($admin || (int) $r['user_id'] === (int) $u['id']),
        'comments' => $comments,
    ], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/community/posts', static function () use ($cBody, $cNeedUser, $cValid): void {
    $u = $cNeedUser();
    $v = $cValid($cBody(), false);
    Db::exec('INSERT INTO community_posts (category, user_id, title, body, site_slug, pinned) VALUES (?, ?, ?, ?, ?, ?)',
        [$v['category'], $u['id'], $v['title'], $v['body'], $v['site_slug'] ?? null, $v['category'] === 'notice' ? 1 : 0]);
    $id = (int) Db::pdo()->lastInsertId();
    if ($v['category'] === 'notice') {
        Notify::broadcast('notice', '새 공지: ' . $v['title'], mb_substr($v['body'], 0, 120), "/community/$id", (int) $u['id']);
    } else {
        \Homebox\Points::award((int) $u['id'], 'community_post', (string) $id); // 참여 포인트(하루 상한)
    }
    Response::json(['id' => $id], 201, ['Cache-Control' => 'no-store']);
});

$router->patch('/api/community/posts/{id}', static function (array $p) use ($cBody, $cNeedUser, $cValid, $cPost, $cIsAdmin): void {
    $u = $cNeedUser();
    $r = $cPost((int) $p['id']);
    if (!$cIsAdmin($u) && (int) $r['user_id'] !== (int) $u['id']) {
        Response::error(403, 'FORBIDDEN', '내가 쓴 글만 고칠 수 있습니다.');
    }
    $v = $cValid($cBody(), true);
    if ($v === []) {
        Response::json(['ok' => true], 200, ['Cache-Control' => 'no-store']);
    }
    $set = implode(', ', array_map(static fn (string $k): string => "`$k` = ?", array_keys($v)));
    Db::exec("UPDATE community_posts SET $set WHERE id = ?", [...array_values($v), $r['id']]);
    Response::json(['ok' => true], 200, ['Cache-Control' => 'no-store']);
});

$router->delete('/api/community/posts/{id}', static function (array $p) use ($cNeedUser, $cPost, $cIsAdmin): void {
    $u = $cNeedUser();
    $r = $cPost((int) $p['id']);
    if (!$cIsAdmin($u) && (int) $r['user_id'] !== (int) $u['id']) {
        Response::error(403, 'FORBIDDEN', '내가 쓴 글만 지울 수 있습니다.');
    }
    Db::exec('UPDATE community_posts SET deleted_at = NOW(3) WHERE id = ?', [$r['id']]);
    Response::json(['ok' => true], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/community/posts/{id}/comments', static function (array $p) use ($cBody, $cNeedUser, $cPost): void {
    $u = $cNeedUser();
    $r = $cPost((int) $p['id']);
    $text = trim((string) ($cBody()['body'] ?? ''));
    if (mb_strlen($text) < 1 || mb_strlen($text) > 3000) {
        Response::error(422, 'INVALID', '댓글은 1~3,000자로 써 주세요.');
    }
    Db::exec('INSERT INTO community_comments (post_id, user_id, body) VALUES (?, ?, ?)', [$r['id'], $u['id'], $text]);
    $cid = (int) Db::pdo()->lastInsertId();
    Db::exec('UPDATE community_posts SET comment_count = (SELECT COUNT(*) FROM community_comments WHERE post_id = ? AND deleted_at IS NULL) WHERE id = ?', [$r['id'], $r['id']]);
    if ((int) $r['user_id'] !== (int) $u['id']) { \Homebox\Points::award((int) $u['id'], 'community_reply', (string) $cid); } // 다른 사람 글 댓글만
    $who = trim((string) ($u['name'] ?? '')) ?: '회원';
    Notify::send((int) $r['user_id'], 'comment', "$who 님이 내 글에 댓글을 남겼습니다", '「' . $r['title'] . '」 ' . mb_substr($text, 0, 100), '/community/' . $r['id'], (int) $u['id']);
    Response::json(['id' => $cid], 201, ['Cache-Control' => 'no-store']);
});

$router->delete('/api/community/comments/{id}', static function (array $p) use ($cNeedUser, $cIsAdmin): void {
    $u = $cNeedUser();
    $c = Db::row('SELECT id, post_id, user_id FROM community_comments WHERE id = ? AND deleted_at IS NULL', [(int) $p['id']])
        ?? Response::error(404, 'NOT_FOUND', '댓글을 찾을 수 없습니다.');
    if (!$cIsAdmin($u) && (int) $c['user_id'] !== (int) $u['id']) {
        Response::error(403, 'FORBIDDEN', '내가 쓴 댓글만 지울 수 있습니다.');
    }
    Db::exec('UPDATE community_comments SET deleted_at = NOW(3) WHERE id = ?', [$c['id']]);
    Db::exec('UPDATE community_posts SET comment_count = (SELECT COUNT(*) FROM community_comments WHERE post_id = ? AND deleted_at IS NULL) WHERE id = ?', [$c['post_id'], $c['post_id']]);
    Response::json(['ok' => true], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/community/posts/{id}/like', static function (array $p) use ($cNeedUser, $cPost): void {
    $u = $cNeedUser();
    $r = $cPost((int) $p['id']);
    $had = Db::row('SELECT 1 AS x FROM community_likes WHERE post_id = ? AND user_id = ?', [$r['id'], $u['id']]) !== null;
    if ($had) {
        Db::exec('DELETE FROM community_likes WHERE post_id = ? AND user_id = ?', [$r['id'], $u['id']]);
    } else {
        Db::exec('INSERT INTO community_likes (post_id, user_id) VALUES (?, ?)', [$r['id'], $u['id']]);
        $who = trim((string) ($u['name'] ?? '')) ?: '회원';
        Notify::send((int) $r['user_id'], 'like', "$who 님이 내 글을 좋아합니다", '「' . $r['title'] . '」', '/community/' . $r['id'], (int) $u['id']);
    }
    $n = (int) (Db::row('SELECT COUNT(*) AS n FROM community_likes WHERE post_id = ?', [$r['id']])['n'] ?? 0);
    Db::exec('UPDATE community_posts SET like_count = ? WHERE id = ?', [$n, $r['id']]);
    Response::json(['liked' => !$had, 'likes' => $n], 200, ['Cache-Control' => 'no-store']);
});

// ── 알림 ──
$router->get('/api/notifications/unread', static function (): void {
    $u = Session::user();
    $n = $u ? (int) (Db::row('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [$u['id']])['n'] ?? 0) : 0;
    Response::json(['count' => $n], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/notifications', static function () use ($cNeedUser): void {
    $u = $cNeedUser();
    $limit = max(1, min(50, (int) ($_GET['limit'] ?? 20)));
    $rows = Db::rows('SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ' . $limit, [$u['id']]);
    $unread = (int) (Db::row('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [$u['id']])['n'] ?? 0);
    Response::json(['items' => array_map(static fn (array $r): array => [
        'id' => (int) $r['id'], 'kind' => $r['kind'], 'title' => $r['title'], 'body' => $r['body'], 'link' => $r['link'],
        'read' => $r['read_at'] !== null, 'created_at' => $r['created_at'],
    ], $rows), 'unread' => $unread], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/notifications/read', static function () use ($cBody, $cNeedUser): void {
    $u = $cNeedUser();
    $b = $cBody();
    if (!empty($b['all'])) {
        Db::exec('UPDATE notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL', [$u['id']]);
    } else {
        $ids = array_values(array_filter(array_map('intval', (array) ($b['ids'] ?? [])), static fn (int $i): bool => $i > 0));
        if ($ids !== []) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            Db::exec("UPDATE notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL AND id IN ($in)", [$u['id'], ...$ids]);
        }
    }
    $unread = (int) (Db::row('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [$u['id']])['n'] ?? 0);
    Response::json(['unread' => $unread], 200, ['Cache-Control' => 'no-store']);
});
