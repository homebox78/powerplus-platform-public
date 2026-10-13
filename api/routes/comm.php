<?php
/**
 * 커뮤니티 라우트 — /api/v1/community/… + /api/v1/notifications/…
 * 출처: homebox-handoff api/routes/community.php 를 REST v1 규약(Actor·Access·public_id)으로.
 * 사용자 지시(2026-10-06): 기존 홈박스 커뮤니티를 살려 상위 메뉴로 — 공지사항·게시판·커뮤니티 용도.
 *   notice = 관리자만 쓰고 전체 회원 알림 · staff = 사내 게시판(visibility internal, staff 만) · 나머지 = public.
 */
declare(strict_types=1);

use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Notify;
use Pp\Core\Points;
use Pp\Core\Response;
use Pp\Core\Router;

const COMM_CATEGORIES = [
    ['id' => 'notice',   'name' => '공지사항',    'desc' => 'powerPlus 소식과 업데이트', 'staff' => false],
    ['id' => 'qna',      'name' => '질문·답변',   'desc' => '에셋·장표·목업·가이드·MCP 사용법 질문', 'staff' => false],
    ['id' => 'showcase', 'name' => '작업 공유',   'desc' => '만든 시안·장표·목업 공유', 'staff' => false],
    ['id' => 'free',     'name' => '자유',        'desc' => '자유 이야기', 'staff' => false],
];
const COMM_MODULES = ['assets', 'deck', 'mock', 'guide'];

return static function (Router $r): void {
    $catIds = array_column(COMM_CATEGORIES, 'id');
    $author = static fn (array $row): array => [
        'id' => (string) $row['author_pid'],
        'name' => trim((string) ($row['author_name'] ?? '')) ?: '회원',
        'avatar' => $row['author_avatar'] ?: null,
        'admin' => !empty($row['author_admin']),
        'staff' => ($row['author_kind'] ?? '') === 'staff',
    ];
    // 작성자 조인 조각 — 운영 배지는 admin·superadmin 역할 보유 여부
    $authorSql = 'u.public_id AS author_pid, u.name AS author_name, u.avatar_url AS author_avatar, u.kind AS author_kind,
                  EXISTS(SELECT 1 FROM core_user_roles ur WHERE ur.user_id = u.id AND ur.role IN ("admin","superadmin")) AS author_admin';
    $post = static function (string $pid) use ($authorSql): array {
        $row = Db::row("SELECT p.*, $authorSql FROM comm_posts p JOIN core_users u ON u.id = p.owner_user_id WHERE p.public_id = ? AND p.deleted_at IS NULL", [$pid]);
        if (!$row) {
            throw HttpError::notFound('글');
        }
        return $row;
    };
    $validate = static function (array $b, bool $partial, Actor $a) use ($catIds): array {
        $out = [];
        if (!$partial || array_key_exists('category', $b)) {
            $cat = (string) ($b['category'] ?? '');
            if (!in_array($cat, $catIds, true)) {
                throw HttpError::invalid('분류를 골라 주세요.');
            }
            if ($cat === 'notice' && !$a->isAdmin()) {
                throw HttpError::forbidden('공지는 관리자만 쓸 수 있습니다.');
            }
            if ($cat === 'staff' && !$a->isStaff() && !$a->isAdmin()) {
                throw HttpError::forbidden('사내 게시판은 임직원만 쓸 수 있습니다.');
            }
            $out['category'] = $cat;
        }
        if (!$partial || array_key_exists('title', $b)) {
            $t = trim((string) ($b['title'] ?? ''));
            if (mb_strlen($t) < 2 || mb_strlen($t) > 120) {
                throw HttpError::invalid('제목은 2~120자로 써 주세요.');
            }
            $out['title'] = $t;
        }
        if (!$partial || array_key_exists('body', $b)) {
            $t = trim((string) ($b['body'] ?? ''));
            if (mb_strlen($t) < 2 || mb_strlen($t) > 20000) {
                throw HttpError::invalid('내용은 2~20,000자로 써 주세요.');
            }
            $out['body'] = $t;
        }
        if (array_key_exists('module', $b)) {
            $m = (string) $b['module'];
            $out['module'] = in_array($m, COMM_MODULES, true) ? $m : null;
        }
        return $out;
    };
    $item = static fn (array $row) => [
        'id' => $row['public_id'], 'category' => $row['category'], 'title' => $row['title'],
        'excerpt' => mb_substr(preg_replace('/\s+/u', ' ', (string) $row['body']) ?? '', 0, 140),
        'module' => $row['module'], 'pinned' => (bool) $row['pinned'],
        'comments' => (int) $row['comment_count'], 'likes' => (int) $row['like_count'], 'views' => (int) $row['view_count'],
        'created_at' => $row['created_at'], 'author' => $author($row),
    ];

    $r->get('/community/categories', function (array $p, Actor $a) use ($catIds): void {
        [$sql, $params] = Access::whereVisible($a, 'p');
        $cnt = [];
        foreach (Db::rows("SELECT category, COUNT(*) AS n FROM comm_posts p WHERE p.deleted_at IS NULL AND $sql GROUP BY category", $params) as $row) {
            $cnt[$row['category']] = (int) $row['n'];
        }
        $items = [];
        foreach (COMM_CATEGORIES as $c) {
            if ($c['staff'] && !$a->isStaff() && !$a->isAdmin()) {
                continue;
            }
            $items[] = ['id' => $c['id'], 'name' => $c['name'], 'desc' => $c['desc'], 'count' => $cnt[$c['id']] ?? 0];
        }
        Response::json(['items' => $items, 'total' => array_sum($cnt), 'can_notice' => $a->isAdmin(), 'can_staff' => $a->isStaff() || $a->isAdmin()]);
    });

    $r->get('/community/posts', function (array $p, Actor $a) use ($authorSql, $item, $catIds): void {
        $cat = (string) ($_GET['category'] ?? '');
        $q = trim((string) ($_GET['q'] ?? ''));
        $sort = ($_GET['sort'] ?? 'new') === 'popular' ? 'popular' : 'new';
        $mine = ($_GET['mine'] ?? '') === '1';
        [$page, $limit, $offset] = Response::paging(30, 50);
        [$vis, $params] = Access::whereVisible($a, 'p');
        $where = ['p.deleted_at IS NULL', $vis];
        if (in_array($cat, $catIds, true)) { $where[] = 'p.category = ?'; $params[] = $cat; }
        if ($q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            if ($a->user === null) {   // 비회원은 본문을 못 보니 본문 검색도 공지만
                $where[] = "(p.title LIKE ? OR (p.category = 'notice' AND p.body LIKE ?))";
            } else {
                $where[] = '(p.title LIKE ? OR p.body LIKE ?)';
            }
            $params[] = $like; $params[] = $like;
        }
        if ($mine) { $u = Auth::requireUser($a); $where[] = 'p.owner_user_id = ?'; $params[] = $u['id']; }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) FROM comm_posts p WHERE $w", $params);
        $order = $sort === 'popular' ? 'p.pinned DESC, (p.like_count * 3 + p.comment_count * 2 + p.view_count / 10) DESC, p.id DESC' : 'p.pinned DESC, p.id DESC';
        $rows = Db::rows("SELECT p.*, $authorSql FROM comm_posts p JOIN core_users u ON u.id = p.owner_user_id WHERE $w ORDER BY $order LIMIT $limit OFFSET $offset", $params);
        $items = array_map($item, $rows);
        if ($a->user === null) {   // 비회원: 공지 말고는 본문 미리보기를 비우고 잠금 표시
            foreach ($items as &$it) {
                if ($it['category'] !== 'notice') { $it['excerpt'] = ''; $it['locked'] = true; }
            }
            unset($it);
        }
        Response::list($items, $total, $page, $limit);
    });

    $r->get('/community/posts/{id}', function (array $p, Actor $a) use ($post, $author, $authorSql): void {
        $row = $post((string) $p['id']);
        Access::assert($a, $row);
        // 공지사항만 누구나 읽는다 — 나머지 게시판 글은 목록(제목)만 보이고 본문은 로그인한 회원만
        if ($row['category'] !== 'notice' && $a->user === null) {
            throw new HttpError('LOGIN_REQUIRED', '로그인한 회원만 글을 볼 수 있습니다', 401, '공지사항은 로그인 없이 볼 수 있습니다');
        }
        Db::exec('UPDATE comm_posts SET view_count = view_count + 1 WHERE id = ?', [$row['id']]);
        $uid = $a->id();
        $comments = array_map(static fn (array $c): array => [
            'id' => (int) $c['id'], 'body' => $c['body'], 'created_at' => $c['created_at'], 'author' => $author($c),
            'can_delete' => $uid !== null && ($a->isAdmin() || (int) $c['user_id'] === $uid),
        ], Db::rows("SELECT c.id, c.body, c.created_at, c.user_id, $authorSql FROM comm_comments c JOIN core_users u ON u.id = c.user_id WHERE c.post_id = ? AND c.deleted_at IS NULL ORDER BY c.id", [$row['id']]));
        $liked = $uid !== null && Db::row('SELECT 1 AS x FROM comm_likes WHERE post_id = ? AND user_id = ?', [$row['id'], $uid]) !== null;
        Response::json([
            'id' => $row['public_id'], 'category' => $row['category'], 'title' => $row['title'], 'body' => $row['body'], 'module' => $row['module'],
            'pinned' => (bool) $row['pinned'], 'likes' => (int) $row['like_count'], 'views' => (int) $row['view_count'] + 1,
            'created_at' => $row['created_at'], 'updated_at' => $row['updated_at'], 'author' => $author($row),
            'liked' => $liked, 'can_edit' => Access::can($a, $row, 'edit'), 'comments' => $comments,
        ]);
    });

    $r->post('/community/posts', function (array $p, Actor $a) use ($validate): void {
        $u = Auth::requireUser($a);
        $v = $validate(Response::input(), false, $a);
        $recent = (int) Db::val('SELECT COUNT(*) FROM comm_posts WHERE owner_user_id = ? AND created_at > NOW() - INTERVAL 1 HOUR', [$u['id']]);
        if ($recent >= 10) {
            throw HttpError::tooMany('한 시간에 글 10개까지 쓸 수 있습니다.');
        }
        $pid = Ids::publicId();
        $vis = $v['category'] === 'staff' ? 'internal' : 'public';
        Db::exec('INSERT INTO comm_posts (public_id, owner_user_id, org_id, visibility, category, title, body, module, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$pid, $u['id'], $a->orgId, $vis, $v['category'], $v['title'], $v['body'], $v['module'] ?? null, $v['category'] === 'notice' ? 1 : 0]);
        if ($v['category'] === 'notice') {
            Notify::broadcast('notice', '새 공지: ' . $v['title'], "/community/$pid", (int) $u['id']);
            Notify::mailAll('notice', 'notice_new', ['title' => (string) $v['title'], 'link' => "/community/$pid"], (int) $u['id']);
        } else {
            Points::award((int) $u['id'], 'post', 'comm_posts', $pid);
            \Pp\Core\Triage::post($pid, $v['category'], $v['title'], $v['body']);
        }
        Audit::log($a, 'comm.post', 'comm_posts:' . $pid);
        Response::json(['id' => $pid], 201);
    }, ['auth' => true]);

    $r->patch('/community/posts/{id}', function (array $p, Actor $a) use ($post, $validate): void {
        Auth::requireUser($a);
        $row = $post((string) $p['id']);
        Access::assert($a, $row, 'edit');
        $v = $validate(Response::input(), true, $a);
        if ($v === []) {
            Response::noContent();
        }
        if (isset($v['category'])) {
            $v['visibility'] = $v['category'] === 'staff' ? 'internal' : 'public';
        }
        $set = implode(', ', array_map(static fn (string $k): string => "`$k` = ?", array_keys($v)));
        Db::exec("UPDATE comm_posts SET $set WHERE id = ?", [...array_values($v), $row['id']]);
        Response::noContent();
    }, ['auth' => true]);

    $r->delete('/community/posts/{id}', function (array $p, Actor $a) use ($post): void {
        Auth::requireUser($a);
        $row = $post((string) $p['id']);
        Access::assert($a, $row, 'delete');
        Db::exec('UPDATE comm_posts SET deleted_at = NOW(3) WHERE id = ?', [$row['id']]);
        Audit::log($a, 'comm.delete', 'comm_posts:' . $row['public_id']);
        Response::noContent();
    }, ['auth' => true]);

    $r->post('/community/posts/{id}/comments', function (array $p, Actor $a) use ($post): void {
        $u = Auth::requireUser($a);
        $row = $post((string) $p['id']);
        Access::assert($a, $row);
        $text = trim((string) (Response::input()['body'] ?? ''));
        if (mb_strlen($text) < 1 || mb_strlen($text) > 3000) {
            throw HttpError::invalid('댓글은 1~3,000자로 써 주세요.');
        }
        Db::exec('INSERT INTO comm_comments (post_id, user_id, body) VALUES (?, ?, ?)', [$row['id'], $u['id'], $text]);
        $cid = Db::lastId();
        Db::exec('UPDATE comm_posts SET comment_count = (SELECT COUNT(*) FROM comm_comments WHERE post_id = ? AND deleted_at IS NULL) WHERE id = ?', [$row['id'], $row['id']]);
        if ((int) $row['owner_user_id'] !== (int) $u['id']) {
            Points::award((int) $u['id'], 'comment', 'comm_comments', (string) $cid);
        }
        $who = trim((string) ($u['name'] ?? '')) ?: '회원';
        Notify::send((int) $row['owner_user_id'], 'comment', "$who 님이 「{$row['title']}」에 댓글을 남겼습니다", '/community/' . $row['public_id'], (int) $u['id']);
        if ((int) $row['owner_user_id'] !== (int) $u['id']) {
            $mailVars = ['who' => $who, 'title' => (string) $row['title'], 'excerpt' => mb_substr($text, 0, 200), 'link' => '/community/' . $row['public_id']];
            $owner = (int) $row['owner_user_id'];
            Notify::later(static fn () => Notify::mail($owner, 'comment', 'comment_new', $mailVars));
        }
        Response::json(['id' => $cid], 201);
    }, ['auth' => true]);

    $r->delete('/community/comments/{id}', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $c = Db::row('SELECT id, post_id, user_id FROM comm_comments WHERE id = ? AND deleted_at IS NULL', [(int) $p['id']]);
        if (!$c) {
            throw HttpError::notFound('댓글');
        }
        if (!$a->isAdmin() && (int) $c['user_id'] !== (int) $u['id']) {
            throw HttpError::forbidden('내가 쓴 댓글만 지울 수 있습니다.');
        }
        Db::exec('UPDATE comm_comments SET deleted_at = NOW(3) WHERE id = ?', [$c['id']]);
        Db::exec('UPDATE comm_posts SET comment_count = (SELECT COUNT(*) FROM comm_comments WHERE post_id = ? AND deleted_at IS NULL) WHERE id = ?', [$c['post_id'], $c['post_id']]);
        Response::noContent();
    }, ['auth' => true]);

    $r->post('/community/posts/{id}/like', function (array $p, Actor $a) use ($post): void {
        $u = Auth::requireUser($a);
        $row = $post((string) $p['id']);
        Access::assert($a, $row);
        $had = Db::row('SELECT 1 AS x FROM comm_likes WHERE post_id = ? AND user_id = ?', [$row['id'], $u['id']]) !== null;
        if ($had) {
            Db::exec('DELETE FROM comm_likes WHERE post_id = ? AND user_id = ?', [$row['id'], $u['id']]);
        } else {
            Db::exec('INSERT INTO comm_likes (post_id, user_id) VALUES (?, ?)', [$row['id'], $u['id']]);
            $who = trim((string) ($u['name'] ?? '')) ?: '회원';
            Notify::send((int) $row['owner_user_id'], 'like', "$who 님이 「{$row['title']}」을 좋아합니다", '/community/' . $row['public_id'], (int) $u['id']);
            if ((int) $row['owner_user_id'] !== (int) $u['id']) {
                Points::award((int) $row['owner_user_id'], 'like_received', 'comm_posts', $row['public_id'] . ':' . $u['id']);
            }
        }
        $n = (int) Db::val('SELECT COUNT(*) FROM comm_likes WHERE post_id = ?', [$row['id']]);
        Db::exec('UPDATE comm_posts SET like_count = ? WHERE id = ?', [$n, $row['id']]);
        Response::json(['liked' => !$had, 'likes' => $n]);
    }, ['auth' => true]);

    // ---- 알림 (마이페이지 §8.1 활동·알림, 헤더 종)
    $r->get('/notifications/unread', function (array $p, Actor $a): void {
        $n = $a->id() ? (int) Db::val('SELECT COUNT(*) FROM core_notifications WHERE user_id = ? AND read_at IS NULL', [$a->id()]) : 0;
        // 가장 최근 안 읽은 알림 하나 — 사이트에 있는 동안 새 알림이 오면 화면이 토스트로 띄운다(사용자 2026-10-07)
        $latest = $n > 0 ? Db::row('SELECT id, kind, title, body, link FROM core_notifications WHERE user_id = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1', [$a->id()]) : null;
        Response::json(['count' => $n, 'latest' => $latest ? ['id' => (int) $latest['id'], 'kind' => $latest['kind'], 'title' => $latest['title'], 'body' => $latest['body'], 'link' => $latest['link']] : null]);
    });

    // 알림 받는 방법 — 사이트 알림은 항상, 메일은 종류별로(Notify::MAIL_CATEGORIES)
    $r->get('/notifications/prefs', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $json = Db::val('SELECT notify_mail FROM core_users WHERE id = ?', [$u['id']]);
        $on = Notify::mailPrefs(is_string($json) ? $json : null);
        $items = [];
        foreach (Notify::MAIL_CATEGORIES as $k => $c) {
            $items[] = ['id' => $k, 'label' => $c['label'], 'desc' => $c['desc'], 'mail' => $on[$k]];
        }
        Response::json(['email' => $u['email'], 'items' => $items]);
    }, ['auth' => true]);

    $r->put('/notifications/prefs', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $in = (array) (Response::input()['mail'] ?? []);
        $json = Db::val('SELECT notify_mail FROM core_users WHERE id = ?', [$u['id']]);
        $cur = Notify::mailPrefs(is_string($json) ? $json : null);
        foreach ($cur as $k => $v) {
            if (array_key_exists($k, $in)) {
                $cur[$k] = (bool) $in[$k];
            }
        }
        Db::exec('UPDATE core_users SET notify_mail = ? WHERE id = ?', [json_encode($cur), $u['id']]);
        Response::json(['mail' => $cur]);
    }, ['auth' => true]);

    $r->get('/notifications', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $limit = max(1, min(50, (int) ($_GET['limit'] ?? 20)));
        $rows = Db::rows('SELECT id, kind, title, body, link, read_at, created_at FROM core_notifications WHERE user_id = ? ORDER BY id DESC LIMIT ' . $limit, [$u['id']]);
        $unread = (int) Db::val('SELECT COUNT(*) FROM core_notifications WHERE user_id = ? AND read_at IS NULL', [$u['id']]);
        Response::json(['items' => array_map(static fn (array $n): array => [
            'id' => (int) $n['id'], 'kind' => $n['kind'], 'title' => $n['title'], 'body' => $n['body'], 'link' => $n['link'], 'read' => $n['read_at'] !== null, 'created_at' => $n['created_at'],
        ], $rows), 'unread' => $unread]);
    }, ['auth' => true]);

    $r->post('/notifications/read', function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $b = Response::input();
        if (!empty($b['all'])) {
            Db::exec('UPDATE core_notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL', [$u['id']]);
        } else {
            $ids = array_values(array_filter(array_map('intval', (array) ($b['ids'] ?? [])), static fn (int $i): bool => $i > 0));
            if ($ids !== []) {
                $in = implode(',', array_fill(0, count($ids), '?'));
                Db::exec("UPDATE core_notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL AND id IN ($in)", [$u['id'], ...$ids]);
            }
        }
        Response::json(['unread' => (int) Db::val('SELECT COUNT(*) FROM core_notifications WHERE user_id = ? AND read_at IS NULL', [$u['id']])]);
    }, ['auth' => true]);
};
