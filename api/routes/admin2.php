<?php
/**
 * 관리자 서버 2 — 콘텐츠 운영: powerMock 시안·갤러리, 커뮤니티(글·댓글·공지), 도움말 문서.
 * 출처: api/routes/admin.php 의 권한·Audit 규약 그대로(다른 작업자와 파일 충돌을 피해 별도 파일). 공개 도움말 /help/docs 도 여기.
 * 권한: 전부 admin 이상 세션 로그인(API 키 불가). 모든 쓰기는 Core\Audit.
 * 커뮤니티 "숨김" = deleted_at(공개 화면은 deleted_at 만 거르므로 comm.php 무수정으로 사라진다), "삭제" = 행 제거(댓글·좋아요 CASCADE).
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Notify;
use Pp\Core\Response;
use Pp\Core\Router;

/** 도움말 카테고리 — 제목·설명은 화면(help.tsx HELP_CATEGORIES)과 같다. 문서만 DB(core_help_docs). */
const HELP_CATEGORIES = ['start', 'assets', 'deck', 'mock', 'guide', 'account'];

return static function (Router $r): void {
    $need = static function (Actor $a, string $role = 'admin'): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole($role)) {
            throw HttpError::forbidden();
        }
    };
    $like = static fn (string $q): string => '%' . addcslashes($q, '%_\\') . '%';

    // =============================== 시안·갤러리 ===============================
    $mockup = static function (string $pid): array {
        $row = Db::row('SELECT m.*, u.name AS owner_name, u.email AS owner_email, u.public_id AS owner_pid,
                               g.id AS g_id, g.status AS g_status, g.likes AS g_likes, g.views AS g_views, g.unlocks AS g_unlocks, g.shared_at AS g_shared_at, g.note AS g_note
                        FROM mock_mockups m LEFT JOIN core_users u ON u.id = m.owner_user_id LEFT JOIN mock_gallery g ON g.mockup_id = m.id
                        WHERE m.public_id = ? AND m.deleted_at IS NULL', [$pid]);
        if (!$row) {
            throw HttpError::notFound('시안');
        }
        return $row;
    };
    $mockupOut = static function (array $x): array {
        $check = null;
        if ($x['check_json']) {
            $j = json_decode((string) $x['check_json'], true);
            if (is_array($j)) {
                $check = [
                    'score' => $j['score'] ?? null, 'passed' => $j['passed'] ?? null,
                    'fixes' => array_slice(array_values(array_filter((array) ($j['fixes'] ?? []), static fn ($f) => is_array($f) || (is_string($f) && $f !== ''))), 0, 30),
                    'summary' => isset($j['summary']) ? mb_substr((string) $j['summary'], 0, 800) : null,
                ];
            }
        }
        return [
            'id' => $x['public_id'], 'title' => $x['title'] !== '' ? $x['title'] : null, 'ref_id' => $x['ref_id'], 'device' => $x['device'],
            'visibility' => $x['visibility'], 'bytes' => (int) $x['bytes'], 'views' => (int) $x['views'],
            'score' => $x['score'] === null ? null : (int) $x['score'], 'passed' => $x['passed'] === null ? null : (bool) $x['passed'],
            'checks' => (int) $x['check_count'], 'checked_at' => $x['checked_at'], 'check' => $check,
            'published' => $x['published_at'] !== null, 'published_at' => $x['published_at'], 'discarded' => $x['discarded_at'] !== null, 'discarded_at' => $x['discarded_at'],
            'owner' => $x['owner_name'], 'owner_email' => $x['owner_email'], 'owner_id' => $x['owner_pid'],
            'created_at' => $x['created_at'], 'updated_at' => $x['updated_at'], 'expires_at' => $x['expires_at'],
            'gallery' => $x['g_id'] ? ['id' => (int) $x['g_id'], 'status' => $x['g_status'], 'likes' => (int) $x['g_likes'], 'views' => (int) $x['g_views'], 'unlocks' => (int) $x['g_unlocks'], 'shared_at' => $x['g_shared_at'], 'note' => $x['g_note']] : null,
            'preview_url' => '/api/v1/mock/mockups/' . $x['token'] . '/html',
            'thumb_url' => $x['has_thumb'] ? '/api/v1/mock/mockups/' . $x['token'] . '/thumb' : null,
            'public_url' => $x['published_at'] !== null ? '/p/' . $x['token'] : null,
        ];
    };

    $r->get('/admin/mockups/{id}', function (array $p, Actor $a) use ($need, $mockup, $mockupOut): void {
        $need($a);
        Response::json($mockupOut($mockup((string) $p['id'])));
    });

    // 폐기 — discarded_at 표시, 갤러리에 올라가 있으면 숨김. 시안 html·점수는 그대로(복원 가능).
    $r->delete('/admin/mockups/{id}', function (array $p, Actor $a) use ($need, $mockup, $mockupOut): void {
        $need($a);
        $m = $mockup((string) $p['id']);
        if ($m['discarded_at'] !== null) {
            throw new HttpError('ALREADY_DISCARDED', '이미 폐기된 시안입니다.', 409);
        }
        Db::exec('UPDATE mock_mockups SET discarded_at = NOW(3) WHERE id = ?', [(int) $m['id']]);
        $before = ['discarded' => false, 'gallery' => $m['g_status']];
        if ($m['g_id'] && $m['g_status'] === 'shared') {
            Db::exec("UPDATE mock_gallery SET status = 'hidden' WHERE id = ?", [(int) $m['g_id']]);
        }
        Audit::log($a, 'mock.mockup.discard', 'mockup:' . $m['public_id'], $before, ['discarded' => true]);
        Response::json($mockupOut($mockup((string) $p['id'])));
    });

    $r->post('/admin/mockups/{id}/restore', function (array $p, Actor $a) use ($need, $mockup, $mockupOut): void {
        $need($a);
        $m = $mockup((string) $p['id']);
        if ($m['discarded_at'] === null) {
            throw new HttpError('NOT_DISCARDED', '폐기된 시안이 아닙니다.', 409);
        }
        Db::exec('UPDATE mock_mockups SET discarded_at = NULL WHERE id = ?', [(int) $m['id']]);
        if ($m['g_id'] && $m['g_status'] === 'hidden') {
            Db::exec("UPDATE mock_gallery SET status = 'study' WHERE id = ?", [(int) $m['g_id']]);
        }
        Audit::log($a, 'mock.mockup.restore', 'mockup:' . $m['public_id'], ['discarded' => true], ['discarded' => false]);
        Response::json($mockupOut($mockup((string) $p['id'])));
    });

    $gallery = static function (int $id): array {
        $g = Db::row('SELECT g.*, m.public_id AS mockup_pid FROM mock_gallery g JOIN mock_mockups m ON m.id = g.mockup_id WHERE g.id = ?', [$id]);
        if (!$g) {
            throw HttpError::notFound('갤러리 항목');
        }
        return $g;
    };
    // 갤러리 숨김/공개 — hidden 은 주인 보관함에서도 안 보인다(운영 제재). show 는 shared 로.
    $r->post('/admin/gallery/{id}/{act}', function (array $p, Actor $a) use ($need, $gallery): void {
        $need($a);
        $act = (string) $p['act'];
        if (!in_array($act, ['hide', 'show'], true)) {
            throw HttpError::notFound('동작');
        }
        $g = $gallery((int) $p['id']);
        $to = $act === 'hide' ? 'hidden' : 'shared';
        if ($g['status'] === $to) {
            throw new HttpError('SAME_STATE', $to === 'hidden' ? '이미 숨긴 항목입니다.' : '이미 공개된 항목입니다.', 409);
        }
        Db::exec('UPDATE mock_gallery SET status = ?, shared_at = IF(? = "shared", COALESCE(shared_at, NOW(3)), shared_at) WHERE id = ?', [$to, $to, (int) $g['id']]);
        Audit::log($a, 'mock.gallery.' . $act, 'gallery:' . $g['id'], ['status' => $g['status']], ['status' => $to]);
        Response::json(['id' => (int) $g['id'], 'mockup' => $g['mockup_pid'], 'status' => $to]);
    });

    $r->delete('/admin/gallery/{id}', function (array $p, Actor $a) use ($need, $gallery): void {
        $need($a);
        $g = $gallery((int) $p['id']);
        Db::exec('DELETE FROM mock_gallery WHERE id = ?', [(int) $g['id']]);
        Audit::log($a, 'mock.gallery.delete', 'gallery:' . $g['id'], ['status' => $g['status'], 'mockup' => $g['mockup_pid'], 'likes' => (int) $g['likes']], null);
        Response::noContent();
    });

    // =============================== 커뮤니티 ===============================
    $catIds = array_column(COMM_CATEGORIES, 'id');
    $authorSql = 'u.public_id AS author_pid, u.name AS author_name, u.email AS author_email, u.kind AS author_kind';
    $postOut = static fn (array $x): array => [
        'id' => $x['public_id'], 'category' => $x['category'], 'title' => $x['title'], 'body' => $x['body'],
        'excerpt' => mb_substr(preg_replace('/\s+/u', ' ', (string) $x['body']) ?? '', 0, 140),
        'module' => $x['module'], 'pinned' => (bool) $x['pinned'], 'hidden' => $x['deleted_at'] !== null,
        'comments' => (int) $x['comment_count'], 'likes' => (int) $x['like_count'], 'views' => (int) $x['view_count'],
        'created_at' => $x['created_at'], 'updated_at' => $x['updated_at'],
        'ai' => isset($x['ai']) && $x['ai'] !== null ? json_decode((string) $x['ai'], true) : null,
        'author' => ['id' => $x['author_pid'], 'name' => trim((string) ($x['author_name'] ?? '')) ?: '회원', 'email' => $x['author_email'], 'staff' => ($x['author_kind'] ?? '') === 'staff'],
    ];
    $postRow = static function (string $pid) use ($authorSql): array {
        $row = Db::row("SELECT p.*, $authorSql FROM comm_posts p JOIN core_users u ON u.id = p.owner_user_id WHERE p.public_id = ?", [$pid]);
        if (!$row) {
            throw HttpError::notFound('글');
        }
        return $row;
    };

    $r->get('/admin/community/posts', function (array $p, Actor $a) use ($need, $like, $authorSql, $postOut, $catIds): void {
        $need($a);
        [$page, $limit, $off] = Response::paging(30, 100);
        $where = ['1=1'];
        $args = [];
        $cat = (string) ($_GET['cat'] ?? '');
        if (in_array($cat, $catIds, true)) {
            $where[] = 'p.category = ?';
            $args[] = $cat;
        }
        $where[] = match ((string) ($_GET['state'] ?? '')) {
            'hidden' => 'p.deleted_at IS NOT NULL',
            'pinned' => 'p.pinned = 1 AND p.deleted_at IS NULL',
            'visible' => 'p.deleted_at IS NULL',
            default => '1=1',
        };
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(p.title LIKE ? OR p.body LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR p.public_id = ?)';
            array_push($args, $like($q), $like($q), $like($q), $like($q), $q);
        }
        $w = implode(' AND ', $where);
        $from = 'FROM comm_posts p JOIN core_users u ON u.id = p.owner_user_id';
        $total = (int) Db::val("SELECT COUNT(*) {$from} WHERE {$w}", $args);
        $rows = Db::rows("SELECT p.*, $authorSql {$from} WHERE {$w} ORDER BY p.pinned DESC, p.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        $counts = [];
        foreach (Db::rows('SELECT category, COUNT(*) AS n, SUM(deleted_at IS NOT NULL) AS hidden FROM comm_posts GROUP BY category') as $c) {
            $counts[$c['category']] = (int) $c['n'];
            $counts['hidden'] = ($counts['hidden'] ?? 0) + (int) $c['hidden'];
        }
        Response::list(array_map($postOut, $rows), $total, $page, $limit, ['counts' => $counts]);
    });

    $r->get('/admin/community/posts/{id}', function (array $p, Actor $a) use ($need, $postRow, $postOut): void {
        $need($a);
        Response::json($postOut($postRow((string) $p['id'])));
    });

    // 숨김·고정·분류·제목·본문 변경
    $r->patch('/admin/community/posts/{id}', function (array $p, Actor $a) use ($need, $postRow, $postOut, $catIds): void {
        $need($a);
        $row = $postRow((string) $p['id']);
        $b = Response::input();
        $set = [];
        $args = [];
        $before = [];
        $after = [];
        if (array_key_exists('hidden', $b)) {
            $h = (bool) $b['hidden'];
            $set[] = 'deleted_at = ' . ($h ? 'COALESCE(deleted_at, NOW(3))' : 'NULL');
            $before['hidden'] = $row['deleted_at'] !== null;
            $after['hidden'] = $h;
        }
        if (array_key_exists('pinned', $b)) {
            $set[] = 'pinned = ?';
            $args[] = (bool) $b['pinned'] ? 1 : 0;
            $before['pinned'] = (bool) $row['pinned'];
            $after['pinned'] = (bool) $b['pinned'];
        }
        if (array_key_exists('category', $b)) {
            $cat = (string) $b['category'];
            if (!in_array($cat, $catIds, true)) {
                throw HttpError::invalid('분류를 골라 주세요.');
            }
            $set[] = 'category = ?, visibility = ?';
            array_push($args, $cat, $cat === 'staff' ? 'internal' : 'public');
            $before['category'] = $row['category'];
            $after['category'] = $cat;
        }
        if (array_key_exists('title', $b)) {
            $t = trim((string) $b['title']);
            if (mb_strlen($t) < 2 || mb_strlen($t) > 120) {
                throw HttpError::invalid('제목은 2~120자로 써 주세요.');
            }
            $set[] = 'title = ?';
            $args[] = $t;
            $before['title'] = $row['title'];
            $after['title'] = $t;
        }
        if (array_key_exists('body', $b)) {
            $t = trim((string) $b['body']);
            if (mb_strlen($t) < 2 || mb_strlen($t) > 20000) {
                throw HttpError::invalid('내용은 2~20,000자로 써 주세요.');
            }
            $set[] = 'body = ?';
            $args[] = $t;
            $before['body_len'] = mb_strlen((string) $row['body']);
            $after['body_len'] = mb_strlen($t);
        }
        if (!$set) {
            throw HttpError::invalid('바꿀 값이 없습니다.');
        }
        $args[] = (int) $row['id'];
        Db::exec('UPDATE comm_posts SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
        Audit::log($a, 'comm.admin.update', 'comm_posts:' . $row['public_id'], $before, $after);
        Response::json($postOut($postRow((string) $p['id'])));
    });

    // 영구 삭제 — 댓글·좋아요 CASCADE. 숨김으로 충분하면 PATCH {hidden:true}.
    $r->delete('/admin/community/posts/{id}', function (array $p, Actor $a) use ($need, $postRow): void {
        $need($a);
        $row = $postRow((string) $p['id']);
        Db::exec('DELETE FROM comm_posts WHERE id = ?', [(int) $row['id']]);
        Audit::log($a, 'comm.admin.delete', 'comm_posts:' . $row['public_id'], ['category' => $row['category'], 'title' => $row['title'], 'comments' => (int) $row['comment_count']], null);
        Response::noContent();
    });

    // 공지 작성 — 관리자 계정이 소유자, 전체 회원 알림(comm.php 의 공지 로직과 같은 Notify::broadcast)
    $r->post('/admin/community/notices', function (array $p, Actor $a) use ($need, $postRow, $postOut): void {
        $need($a);
        $u = Auth::requireUser($a);
        $b = Response::input();
        $title = trim((string) ($b['title'] ?? ''));
        $body = trim((string) ($b['body'] ?? ''));
        if (mb_strlen($title) < 2 || mb_strlen($title) > 120) {
            throw HttpError::invalid('제목은 2~120자로 써 주세요.');
        }
        if (mb_strlen($body) < 2 || mb_strlen($body) > 20000) {
            throw HttpError::invalid('내용은 2~20,000자로 써 주세요.');
        }
        $pinned = !array_key_exists('pinned', $b) || (bool) $b['pinned'];
        $module = in_array((string) ($b['module'] ?? ''), COMM_MODULES, true) ? (string) $b['module'] : null;
        $pid = Ids::publicId();
        Db::exec("INSERT INTO comm_posts (public_id, owner_user_id, org_id, visibility, category, title, body, module, pinned) VALUES (?, ?, ?, 'public', 'notice', ?, ?, ?, ?)",
            [$pid, $u['id'], $a->orgId, $title, $body, $module, $pinned ? 1 : 0]);
        if (!array_key_exists('notify', $b) || (bool) $b['notify']) {
            Notify::broadcast('notice', '새 공지: ' . $title, "/community/$pid", (int) $u['id']);
            Notify::mailAll('notice', 'notice_new', ['title' => (string) $title, 'link' => "/community/$pid"], (int) $u['id']);
        }
        Audit::log($a, 'comm.admin.notice', 'comm_posts:' . $pid, null, ['title' => $title, 'pinned' => $pinned]);
        Response::json($postOut($postRow($pid)), 201);
    });

    // ---- 댓글
    $commentOut = static fn (array $c): array => [
        'id' => (int) $c['id'], 'body' => $c['body'], 'created_at' => $c['created_at'], 'hidden' => $c['deleted_at'] !== null,
        'post' => ['id' => $c['post_pid'], 'title' => $c['post_title'], 'category' => $c['post_category']],
        'author' => ['id' => $c['author_pid'], 'name' => trim((string) ($c['author_name'] ?? '')) ?: '회원', 'email' => $c['author_email'], 'staff' => ($c['author_kind'] ?? '') === 'staff'],
    ];
    $commentFrom = "FROM comm_comments c JOIN comm_posts p ON p.id = c.post_id JOIN core_users u ON u.id = c.user_id";
    $commentSel = "SELECT c.*, p.public_id AS post_pid, p.title AS post_title, p.category AS post_category, $authorSql";
    $commentRow = static function (int $id) use ($commentFrom, $commentSel): array {
        $c = Db::row("$commentSel $commentFrom WHERE c.id = ?", [$id]);
        if (!$c) {
            throw HttpError::notFound('댓글');
        }
        return $c;
    };
    $recount = static fn (int $postId) => Db::exec('UPDATE comm_posts SET comment_count = (SELECT COUNT(*) FROM comm_comments WHERE post_id = ? AND deleted_at IS NULL) WHERE id = ?', [$postId, $postId]);

    $r->get('/admin/community/comments', function (array $p, Actor $a) use ($need, $like, $commentFrom, $commentSel, $commentOut): void {
        $need($a);
        [$page, $limit, $off] = Response::paging(30, 100);
        $where = ['1=1'];
        $args = [];
        $post = trim((string) ($_GET['post'] ?? ''));
        if ($post !== '') {
            $where[] = 'p.public_id = ?';
            $args[] = $post;
        }
        if ((string) ($_GET['state'] ?? '') === 'hidden') {
            $where[] = 'c.deleted_at IS NOT NULL';
        } elseif ((string) ($_GET['state'] ?? '') === 'visible') {
            $where[] = 'c.deleted_at IS NULL';
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(c.body LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR p.title LIKE ?)';
            array_push($args, $like($q), $like($q), $like($q), $like($q));
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) $commentFrom WHERE {$w}", $args);
        $rows = Db::rows("$commentSel $commentFrom WHERE {$w} ORDER BY c.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        $c = Db::row('SELECT COUNT(*) AS total, SUM(deleted_at IS NOT NULL) AS hidden FROM comm_comments') ?? [];
        Response::list(array_map($commentOut, $rows), $total, $page, $limit, ['counts' => array_map('intval', $c)]);
    });

    $r->post('/admin/community/comments/{id}/{act}', function (array $p, Actor $a) use ($need, $commentRow, $commentOut, $recount): void {
        $need($a);
        $act = (string) $p['act'];
        if (!in_array($act, ['hide', 'show'], true)) {
            throw HttpError::notFound('동작');
        }
        $c = $commentRow((int) $p['id']);
        Db::exec('UPDATE comm_comments SET deleted_at = ' . ($act === 'hide' ? 'COALESCE(deleted_at, NOW(3))' : 'NULL') . ' WHERE id = ?', [(int) $c['id']]);
        $recount((int) $c['post_id']);
        Audit::log($a, 'comm.admin.comment.' . $act, 'comm_comments:' . $c['id'], ['hidden' => $c['deleted_at'] !== null], ['hidden' => $act === 'hide']);
        Response::json($commentOut($commentRow((int) $p['id'])));
    });

    $r->delete('/admin/community/comments/{id}', function (array $p, Actor $a) use ($need, $commentRow, $recount): void {
        $need($a);
        $c = $commentRow((int) $p['id']);
        Db::exec('DELETE FROM comm_comments WHERE id = ?', [(int) $c['id']]);
        $recount((int) $c['post_id']);
        Audit::log($a, 'comm.admin.comment.delete', 'comm_comments:' . $c['id'], ['post' => $c['post_pid'], 'body' => mb_substr((string) $c['body'], 0, 200)], null);
        Response::noContent();
    });

    // =============================== 도움말 문서 ===============================
    $docOut = static fn (array $x): array => [
        'id' => $x['public_id'], 'category' => $x['category'], 'slug' => $x['slug'], 'title' => $x['title'], 'body' => $x['body'],
        'order' => (int) $x['sort_order'], 'published' => (bool) $x['published'], 'created_at' => $x['created_at'], 'updated_at' => $x['updated_at'],
    ];
    $docRow = static function (string $pid): array {
        $row = Db::row('SELECT * FROM core_help_docs WHERE public_id = ? AND deleted_at IS NULL', [$pid]);
        if (!$row) {
            throw HttpError::notFound('문서');
        }
        return $row;
    };
    $docValidate = static function (array $b, bool $partial, ?array $cur = null): array {
        $out = [];
        if (!$partial || array_key_exists('category', $b)) {
            $c = (string) ($b['category'] ?? '');
            if (!in_array($c, HELP_CATEGORIES, true)) {
                throw HttpError::invalid('카테고리를 골라 주세요.');
            }
            $out['category'] = $c;
        }
        if (!$partial || array_key_exists('slug', $b)) {
            $s = strtolower(trim((string) ($b['slug'] ?? '')));
            if (!preg_match('/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/', $s)) {
                throw HttpError::invalid('주소(slug)는 영문 소문자·숫자·하이픈 2~80자로 써 주세요.');
            }
            $out['slug'] = $s;
        }
        if (!$partial || array_key_exists('title', $b)) {
            $t = trim((string) ($b['title'] ?? ''));
            if (mb_strlen($t) < 2 || mb_strlen($t) > 200) {
                throw HttpError::invalid('제목은 2~200자로 써 주세요.');
            }
            $out['title'] = $t;
        }
        if (!$partial || array_key_exists('body', $b)) {
            $t = trim(str_replace("\r\n", "\n", (string) ($b['body'] ?? '')));
            if (mb_strlen($t) < 2 || mb_strlen($t) > 50000) {
                throw HttpError::invalid('본문은 2~50,000자로 써 주세요.');
            }
            $out['body'] = $t;
        }
        if (array_key_exists('order', $b)) {
            $out['sort_order'] = max(0, min(999, (int) $b['order']));
        }
        if (array_key_exists('published', $b)) {
            $out['published'] = (bool) $b['published'] ? 1 : 0;
        }
        // 같은 카테고리 안 slug 중복
        $cat = $out['category'] ?? $cur['category'] ?? '';
        $slug = $out['slug'] ?? $cur['slug'] ?? '';
        if ($cat !== '' && $slug !== '') {
            $dup = Db::row('SELECT id FROM core_help_docs WHERE category = ? AND slug = ? AND deleted_at IS NULL AND id <> ?', [$cat, $slug, (int) ($cur['id'] ?? 0)]);
            if ($dup) {
                throw HttpError::invalid('같은 카테고리에 같은 주소(slug)의 문서가 있습니다.');
            }
        }
        return $out;
    };

    // 공개 — 게시된 문서 전부(화면이 카테고리별로 묶는다). 도움말은 로그인 없이.
    $r->get('/help/docs', function () use ($docOut): void {
        $rows = Db::rows('SELECT public_id, category, slug, title, body, sort_order, published, created_at, updated_at FROM core_help_docs WHERE published = 1 AND deleted_at IS NULL ORDER BY category, sort_order, id');
        Response::json(['items' => array_map($docOut, $rows)], 200, [], true);
    });

    $r->get('/admin/help/docs', function (array $p, Actor $a) use ($need, $like, $docOut): void {
        $need($a);
        $where = ['deleted_at IS NULL'];
        $args = [];
        $cat = (string) ($_GET['cat'] ?? '');
        if (in_array($cat, HELP_CATEGORIES, true)) {
            $where[] = 'category = ?';
            $args[] = $cat;
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(title LIKE ? OR body LIKE ? OR slug LIKE ?)';
            array_push($args, $like($q), $like($q), $like($q));
        }
        $rows = Db::rows('SELECT * FROM core_help_docs WHERE ' . implode(' AND ', $where) . ' ORDER BY category, sort_order, id', $args);
        $counts = [];
        foreach (Db::rows('SELECT category, COUNT(*) AS n FROM core_help_docs WHERE deleted_at IS NULL GROUP BY category') as $c) {
            $counts[$c['category']] = (int) $c['n'];
        }
        Response::list(array_map($docOut, $rows), count($rows), 1, max(1, count($rows)), ['counts' => $counts]);
    });

    $r->post('/admin/help/docs', function (array $p, Actor $a) use ($need, $docValidate, $docRow, $docOut): void {
        $need($a);
        $v = $docValidate(Response::input(), false);
        $pid = Ids::publicId();
        $order = $v['sort_order'] ?? ((int) Db::val('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM core_help_docs WHERE category = ? AND deleted_at IS NULL', [$v['category']]));
        Db::exec('INSERT INTO core_help_docs (public_id, category, slug, title, body, sort_order, published) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$pid, $v['category'], $v['slug'], $v['title'], $v['body'], $order, $v['published'] ?? 1]);
        Audit::log($a, 'help.doc.create', 'core_help_docs:' . $pid, null, ['category' => $v['category'], 'slug' => $v['slug'], 'title' => $v['title']]);
        Response::json($docOut($docRow($pid)), 201);
    });

    $r->patch('/admin/help/docs/{id}', function (array $p, Actor $a) use ($need, $docValidate, $docRow, $docOut): void {
        $need($a);
        $row = $docRow((string) $p['id']);
        $v = $docValidate(Response::input(), true, $row);
        if (!$v) {
            throw HttpError::invalid('바꿀 값이 없습니다.');
        }
        $set = [];
        $args = [];
        $before = [];
        foreach ($v as $k => $val) {
            $set[] = "$k = ?";
            $args[] = $val;
            $before[$k] = $k === 'body' ? mb_strlen((string) $row[$k]) : $row[$k];
        }
        $args[] = (int) $row['id'];
        Db::exec('UPDATE core_help_docs SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
        if (isset($v['body'])) {
            $v['body'] = mb_strlen($v['body']);
        }
        Audit::log($a, 'help.doc.update', 'core_help_docs:' . $row['public_id'], $before, $v);
        Response::json($docOut($docRow((string) $p['id'])));
    });

    $r->delete('/admin/help/docs/{id}', function (array $p, Actor $a) use ($need, $docRow): void {
        $need($a);
        $row = $docRow((string) $p['id']);
        Db::exec('UPDATE core_help_docs SET deleted_at = NOW(3) WHERE id = ?', [(int) $row['id']]);
        Audit::log($a, 'help.doc.delete', 'core_help_docs:' . $row['public_id'], ['category' => $row['category'], 'slug' => $row['slug'], 'title' => $row['title']], null);
        Response::noContent();
    });

    // =============================== 변경 이력(core_changelog) ===============================
    $clModules = ['platform', 'assets', 'deck', 'mock', 'guide', 'mcp'];
    $clOut = static fn (array $x): array => [
        'id' => $x['public_id'], 'module' => $x['module'], 'track' => $x['track'], 'version' => $x['version'],
        'date' => $x['released_on'], 'title' => $x['title'], 'notes' => json_decode((string) $x['notes'], true) ?: [],
        'published' => (bool) $x['published'], 'updated_at' => $x['updated_at'],
    ];
    $clRow = static function (string $pid): array {
        $row = Db::row('SELECT * FROM core_changelog WHERE public_id = ? AND deleted_at IS NULL', [$pid]);
        if (!$row) {
            throw HttpError::notFound('이력');
        }
        return $row;
    };
    $clValidate = static function (array $b, bool $partial, ?array $cur = null) use ($clModules): array {
        $out = [];
        if (!$partial || array_key_exists('module', $b)) {
            $m = (string) ($b['module'] ?? '');
            if (!in_array($m, $clModules, true)) {
                throw HttpError::invalid('서비스를 골라 주세요.');
            }
            $out['module'] = $m;
        }
        if (!$partial || array_key_exists('track', $b)) {
            $out['track'] = mb_substr(trim((string) ($b['track'] ?? '')), 0, 40);
        }
        if (!$partial || array_key_exists('version', $b)) {
            $v = trim((string) ($b['version'] ?? ''));
            if (!preg_match('/^[0-9A-Za-z][0-9A-Za-z.\-]{0,19}$/', $v)) {
                throw HttpError::invalid('버전은 영문·숫자·점 20자 이내로 써 주세요(예: 1.2.0).');
            }
            $out['version'] = $v;
        }
        if (!$partial || array_key_exists('date', $b)) {
            $d = (string) ($b['date'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !strtotime($d)) {
                throw HttpError::invalid('날짜를 YYYY-MM-DD 로 써 주세요.');
            }
            $out['released_on'] = $d;
        }
        if (!$partial || array_key_exists('title', $b)) {
            $t = trim((string) ($b['title'] ?? ''));
            if (mb_strlen($t) < 2 || mb_strlen($t) > 200) {
                throw HttpError::invalid('제목은 2~200자로 써 주세요.');
            }
            $out['title'] = $t;
        }
        if (!$partial || array_key_exists('notes', $b)) {
            $n = $b['notes'] ?? [];
            if (is_string($n)) {
                $n = preg_split('/\r?\n/', $n) ?: [];
            }
            $n = array_values(array_filter(array_map(static fn ($x) => mb_substr(trim((string) $x), 0, 300), (array) $n), static fn ($x) => $x !== ''));
            if (!$n || count($n) > 30) {
                throw HttpError::invalid('바뀐 점을 1~30줄로 써 주세요.');
            }
            $out['notes'] = json_encode($n, JSON_UNESCAPED_UNICODE);
        }
        if (array_key_exists('published', $b)) {
            $out['published'] = (bool) $b['published'] ? 1 : 0;
        }
        $m = $out['module'] ?? $cur['module'] ?? '';
        $tr = $out['track'] ?? $cur['track'] ?? '';
        $ver = $out['version'] ?? $cur['version'] ?? '';
        if ($m !== '' && $ver !== '') {
            $dup = Db::row('SELECT id FROM core_changelog WHERE module = ? AND track = ? AND version = ? AND deleted_at IS NULL AND id <> ?', [$m, $tr, $ver, (int) ($cur['id'] ?? 0)]);
            if ($dup) {
                throw HttpError::invalid('같은 서비스·갈래에 같은 버전이 있습니다.');
            }
        }
        return $out;
    };

    // 공개 — 발행된 이력(서비스별). 로그인 없이.
    $r->get('/changelog', function () use ($clModules, $clOut): void {
        $m = (string) ($_GET['module'] ?? '');
        $where = 'published = 1 AND deleted_at IS NULL';
        $args = [];
        if (in_array($m, $clModules, true)) {
            $where .= ' AND module = ?';
            $args[] = $m;
        } elseif ($m !== '') {
            // GDE-008: 모르는 서비스 이름이면 전부 돌려주지 않고 알려 준다.
            throw HttpError::invalid('알 수 없는 서비스입니다.', '쓸 수 있는 값: ' . implode(', ', $clModules));
        }
        $rows = Db::rows("SELECT * FROM core_changelog WHERE $where ORDER BY released_on DESC, id DESC", $args);
        Response::json(['items' => array_map($clOut, $rows)], 200, [], true);
    });

    $r->get('/admin/changelog', function (array $p, Actor $a) use ($need, $like, $clModules, $clOut): void {
        $need($a);
        $where = ['deleted_at IS NULL'];
        $args = [];
        $m = (string) ($_GET['module'] ?? '');
        if (in_array($m, $clModules, true)) {
            $where[] = 'module = ?';
            $args[] = $m;
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(title LIKE ? OR version LIKE ? OR track LIKE ? OR CAST(notes AS CHAR) LIKE ?)';
            array_push($args, $like($q), $like($q), $like($q), $like($q));
        }
        $rows = Db::rows('SELECT * FROM core_changelog WHERE ' . implode(' AND ', $where) . ' ORDER BY released_on DESC, id DESC', $args);
        $counts = [];
        foreach (Db::rows('SELECT module, COUNT(*) AS n FROM core_changelog WHERE deleted_at IS NULL GROUP BY module') as $c) {
            $counts[$c['module']] = (int) $c['n'];
        }
        Response::list(array_map($clOut, $rows), count($rows), 1, max(1, count($rows)), ['counts' => $counts]);
    });

    $r->post('/admin/changelog', function (array $p, Actor $a) use ($need, $clValidate, $clRow, $clOut): void {
        $need($a);
        $v = $clValidate(Response::input(), false);
        $pid = Ids::publicId();
        Db::exec('INSERT INTO core_changelog (public_id, module, track, version, released_on, title, notes, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$pid, $v['module'], $v['track'], $v['version'], $v['released_on'], $v['title'], $v['notes'], $v['published'] ?? 1]);
        Audit::log($a, 'changelog.create', 'core_changelog:' . $pid, null, ['module' => $v['module'], 'version' => $v['version'], 'title' => $v['title']]);
        Response::json($clOut($clRow($pid)), 201);
    });

    $r->patch('/admin/changelog/{id}', function (array $p, Actor $a) use ($need, $clValidate, $clRow, $clOut): void {
        $need($a);
        $row = $clRow((string) $p['id']);
        $v = $clValidate(Response::input(), true, $row);
        if (!$v) {
            throw HttpError::invalid('바꿀 값이 없습니다.');
        }
        $set = [];
        $args = [];
        $before = [];
        foreach ($v as $k => $val) {
            $set[] = "$k = ?";
            $args[] = $val;
            $before[$k] = $row[$k];
        }
        $args[] = (int) $row['id'];
        Db::exec('UPDATE core_changelog SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
        Audit::log($a, 'changelog.update', 'core_changelog:' . $row['public_id'], $before, $v);
        Response::json($clOut($clRow((string) $p['id'])));
    });

    $r->delete('/admin/changelog/{id}', function (array $p, Actor $a) use ($need, $clRow): void {
        $need($a);
        $row = $clRow((string) $p['id']);
        Db::exec('UPDATE core_changelog SET deleted_at = NOW(3) WHERE id = ?', [(int) $row['id']]);
        Audit::log($a, 'changelog.delete', 'core_changelog:' . $row['public_id'], ['module' => $row['module'], 'version' => $row['version'], 'title' => $row['title']], null);
        Response::noContent();
    });
};
