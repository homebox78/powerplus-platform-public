<?php
declare(strict_types=1);

/**
 * 시안 갤러리·포인트 (2026-10-03 사용자 지시).
 *   "80점 이하는 폐기하고 나머지 80점 이상은 학습 자료로 탐구하고 보관해서 썸네일 형태로 제작하고 공유하는 공간,
 *    제작하고 공유하면 포인트 축적, 축적된 포인트를 다른 게시물을 보는데 사용 — 커뮤니티 참여 유도"
 *
 * 흐름: MCP check_mockup 판정 점수가 Points::GALLERY_CUT 을 넘으면 그 시안을 학습 자료(status=study)로 보관(+20P, 썸네일은 판정 캡처에서).
 *       만든 사람이 [갤러리에 공유] 하면 status=shared(+50P) — 누구나 썸네일·점수를 보고, 포인트(30P)를 내고 열어 본다(만든 사람 +10P).
 *       좋아요를 받으면 +2P. 커뮤니티 글·댓글도 포인트(하루 상한). 가입 환영 100P·출석 5P.
 *   GET  /api/gallery?view=shared|mine&sort=popular|new|score&cursor=
 *   GET  /api/gallery/leaders                    지난 30일 포인트를 많이 번 만든 사람
 *   GET  /api/gallery/{id}                        정보 + (열람 권한이 있으면) 학습 노트
 *   GET  /api/gallery/{id}/thumb                  썸네일
 *   GET  /api/gallery/{id}/html                   시안(열람 권한 필요, sandbox)
 *   POST /api/gallery/{id}/unlock                 포인트로 열기
 *   POST /api/gallery/{id}/like                   좋아요 토글
 *   POST /api/gallery/{id}/share {title?,note?}   공유(만든 사람)
 *   POST /api/gallery/{id}/hide                   공유 내리기(만든 사람·관리자)
 *   GET  /api/points                              잔액·내역·규칙
 *   POST /api/admin/gallery/backfill              기존 판정 기록을 갤러리로(관리자)
 *   GET  /api/internal/gallery/missing-thumbs · POST /api/internal/gallery/{token}/thumb   썸네일 채우기(MCP 서버 스크립트)
 * @var Homebox\Http\Router $router
 */

use Homebox\Auth\Session;
use Homebox\Db;
use Homebox\Http\Auth;
use Homebox\Http\Response;
use Homebox\Notify;
use Homebox\Points;

function homebox_gallery_dir(): string
{
    $d = rtrim((string) Config::get('storage.dir', __DIR__ . '/../../storage'), '/\\') . '/gallery';
    if (!is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}

function homebox_gallery_save_thumb(int $id, string $b64): bool
{
    $bin = base64_decode($b64, true);
    if ($bin === false || strlen($bin) < 200 || strlen($bin) > 3_000_000 || substr($bin, 0, 3) !== "\xFF\xD8\xFF") { return false; }
    if (@file_put_contents(homebox_gallery_dir() . "/$id.jpg", $bin) === false) { return false; }
    Db::exec('UPDATE gallery_items SET has_thumb = 1 WHERE id = ?', [$id]);
    return true;
}

/** 판정 직후(mockup-pages check 라우트) 부른다 — 기준을 넘으면 보관·갱신, 아니면 폐기 표시 */
function homebox_gallery_store(string $token, int $keyId, int $score, ?string $thumb, string $device): void
{
    try {
        $m = Db::row('SELECT m.html, m.title, m.ref_id, m.check_result, k.owner_type, k.owner_id, k.created_by
                        FROM mockup_pages m LEFT JOIN api_keys k ON k.id = m.api_key_id WHERE m.token = ? AND m.api_key_id = ?', [$token, $keyId]);
        if ($m === null) { return; }
        if ($score <= Points::GALLERY_CUT) {
            if (Db::row('SELECT id FROM gallery_items WHERE token = ?', [$token]) === null) {
                Db::exec('UPDATE mockup_pages SET discarded_at = COALESCE(discarded_at, NOW(3)) WHERE token = ?', [$token]);
            }
            return;
        }
        Db::exec('UPDATE mockup_pages SET discarded_at = NULL WHERE token = ?', [$token]);
        $uid = ($m['owner_type'] ?? '') === 'user' ? (int) $m['owner_id'] : (int) ($m['created_by'] ?? 0);
        $dev = $device === 'mobile' ? 'mobile' : 'pc';
        $old = Db::row('SELECT id, score FROM gallery_items WHERE token = ?', [$token]);
        if ($old === null) {
            Db::exec('INSERT INTO gallery_items (token, user_id, api_key_id, title, score, ref_id, device, html, check_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$token, $uid ?: null, $keyId, (string) $m['title'], $score, $m['ref_id'], $dev, (string) $m['html'], $m['check_result']]);
            $id = (int) Db::pdo()->lastInsertId();
            if ($uid > 0) {
                Points::award($uid, 'gallery_made', $token);
                Notify::send($uid, 'system', '시안이 학습 자료로 보관됐습니다 (' . $score . '점)', '갤러리 [내 시안] 에서 공유하면 +' . Points::RULES['gallery_share'][0] . 'P, 다른 사람이 열어 볼 때마다 +' . Points::RULES['gallery_royalty'][0] . 'P 가 쌓입니다.', '/gallery?view=mine');
            }
        } elseif ($score >= (int) $old['score']) {
            $id = (int) $old['id'];
            Db::exec('UPDATE gallery_items SET title = IF(? = \'\', title, ?), score = ?, ref_id = ?, device = ?, html = ?, check_result = ?, updated_at = NOW(3) WHERE id = ?',
                [(string) $m['title'], (string) $m['title'], $score, $m['ref_id'], $dev, (string) $m['html'], $m['check_result'], $id]);
        } else {
            return; // 더 낮은 재판정은 보관본을 덮지 않는다
        }
        if ($thumb !== null && $thumb !== '') { homebox_gallery_save_thumb($id, $thumb); }
    } catch (\Throwable $e) {
        error_log('[gallery] ' . $e->getMessage());
    }
}

$gBody = static fn (): array => json_decode((string) file_get_contents('php://input'), true) ?: [];
$gNeedUser = static fn (): array => Session::user() ?? Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
$gIsAdmin = static fn (?array $u): bool => ($u['role'] ?? '') === 'admin';
$gItem = static function (int $id): array {
    return Db::row('SELECT g.*, u.name AS owner_name, u.avatar_url AS owner_avatar FROM gallery_items g LEFT JOIN users u ON u.id = g.user_id WHERE g.id = ?', [$id])
        ?? Response::error(404, 'NOT_FOUND', '시안을 찾을 수 없습니다.');
};
/** 볼 수 있나(목록·썸네일): 공유된 것 또는 내 것·관리자 */
$gCanSee = static fn (array $g, ?array $u): bool => $g['status'] === 'shared' || ($u !== null && ((int) $g['user_id'] === (int) $u['id'] || ($u['role'] ?? '') === 'admin'));
/** 열람 권한(시안·학습 노트): 내 것·관리자·포인트로 연 사람 */
$gUnlocked = static function (array $g, ?array $u): bool {
    if ($u === null) { return false; }
    if ((int) $g['user_id'] === (int) $u['id'] || ($u['role'] ?? '') === 'admin') { return true; }
    return Db::row('SELECT 1 AS x FROM gallery_unlocks WHERE item_id = ? AND user_id = ?', [(int) $g['id'], (int) $u['id']]) !== null;
};
$gCard = static function (array $r, ?array $u, array $sharedBy, array $liked, array $unlocked): array {
    $mine = $u !== null && (int) $r['user_id'] === (int) $u['id'];
    $ref = (string) ($r['ref_id'] ?? '');
    return [
        'id' => (int) $r['id'], 'title' => (string) $r['title'] ?: '제목 없는 시안', 'score' => (int) $r['score'], 'device' => $r['device'],
        'kind' => str_starts_with($ref, 'mix1:') ? 'mix' : 'single',
        'thumb_url' => (int) $r['has_thumb'] === 1 ? '/api/gallery/' . $r['id'] . '/thumb?v=' . strtotime((string) $r['updated_at']) : null,
        'status' => $r['status'], 'likes' => (int) $r['likes'], 'views' => (int) $r['views'], 'unlocks' => (int) $r['unlocks'],
        'note' => $r['note'],
        'owner' => ['name' => trim((string) ($r['owner_name'] ?? '')) ?: '회원', 'avatar' => $r['owner_avatar'] ?: null, 'badge' => Points::badge((int) ($sharedBy[(int) $r['user_id']] ?? 0))],
        'mine' => $mine, 'liked' => isset($liked[(int) $r['id']]),
        'unlocked' => $mine || ($u['role'] ?? '') === 'admin' || isset($unlocked[(int) $r['id']]),
        'created_at' => $r['created_at'], 'shared_at' => $r['shared_at'],
    ];
};

$router->get('/api/gallery', static function () use ($gCard, $gIsAdmin): void {
    $u = Session::user();
    if ($u !== null) { Points::touch((int) $u['id']); }
    $view = ($_GET['view'] ?? 'shared') === 'mine' ? 'mine' : 'shared';
    if ($view === 'mine' && $u === null) { Response::error(401, 'UNAUTHORIZED', '로그인하면 내가 만든 시안을 볼 수 있습니다.'); }
    $sort = (string) ($_GET['sort'] ?? 'popular');
    $order = match ($sort) {
        'new' => 'COALESCE(g.shared_at, g.created_at) DESC, g.id DESC',
        'score' => 'g.score DESC, g.id DESC',
        default => '(g.likes * 3 + g.unlocks * 2 + g.views / 10) DESC, g.id DESC',
    };
    $limit = 24; $offset = max(0, (int) ($_GET['cursor'] ?? 0));
    [$where, $args] = $view === 'mine'
        ? ['g.user_id = ? AND g.status <> \'hidden\'', [(int) $u['id']]]
        : ['g.status = \'shared\'', []];
    if ($view === 'mine' && $gIsAdmin($u) && ($_GET['all'] ?? '') === '1') { [$where, $args] = ['1 = 1', []]; }
    $rows = Db::rows("SELECT g.id, g.user_id, g.title, g.score, g.device, g.ref_id, g.has_thumb, g.status, g.likes, g.views, g.unlocks, g.note, g.created_at, g.updated_at, g.shared_at,
                             u.name AS owner_name, u.avatar_url AS owner_avatar
                        FROM gallery_items g LEFT JOIN users u ON u.id = g.user_id WHERE $where ORDER BY $order LIMIT " . ($limit + 1) . " OFFSET $offset", $args);
    $more = count($rows) > $limit; $rows = array_slice($rows, 0, $limit);
    $sharedBy = [];
    foreach (Db::rows("SELECT user_id, COUNT(*) AS n FROM gallery_items WHERE status = 'shared' AND user_id IS NOT NULL GROUP BY user_id") as $s) { $sharedBy[(int) $s['user_id']] = (int) $s['n']; }
    $liked = []; $unlocked = [];
    if ($u !== null && $rows) {
        $ids = implode(',', array_map(static fn ($r) => (int) $r['id'], $rows));
        foreach (Db::rows("SELECT item_id FROM gallery_likes WHERE user_id = ? AND item_id IN ($ids)", [(int) $u['id']]) as $x) { $liked[(int) $x['item_id']] = true; }
        foreach (Db::rows("SELECT item_id FROM gallery_unlocks WHERE user_id = ? AND item_id IN ($ids)", [(int) $u['id']]) as $x) { $unlocked[(int) $x['item_id']] = true; }
    }
    $total = (int) (Db::row("SELECT COUNT(*) AS n FROM gallery_items g WHERE $where", $args)['n'] ?? 0);
    Response::json([
        'items' => array_map(static fn ($r) => $gCard($r, $u, $sharedBy, $liked, $unlocked), $rows),
        'total' => $total, 'next_cursor' => $more ? $offset + $limit : null,
        'me' => $u === null ? null : ['points' => Points::balance((int) $u['id'])],
        'unlock_cost' => Points::UNLOCK_COST, 'cut' => Points::GALLERY_CUT,
    ], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/gallery/leaders', static function (): void {
    $earn = "'gallery_share','gallery_like','gallery_royalty','gallery_made','community_post','community_reply'";
    $rows = Db::rows("SELECT l.user_id, SUM(l.delta) AS pts, u.name, u.avatar_url
                        FROM point_ledger l JOIN users u ON u.id = l.user_id
                       WHERE l.reason IN ($earn) AND l.created_at >= NOW(3) - INTERVAL 30 DAY
                       GROUP BY l.user_id ORDER BY pts DESC LIMIT 10");
    $shared = [];
    foreach (Db::rows("SELECT user_id, COUNT(*) AS n FROM gallery_items WHERE status = 'shared' AND user_id IS NOT NULL GROUP BY user_id") as $s) { $shared[(int) $s['user_id']] = (int) $s['n']; }
    Response::json(['items' => array_map(static fn ($r) => [
        'name' => trim((string) $r['name']) ?: '회원', 'avatar' => $r['avatar_url'] ?: null, 'points' => (int) $r['pts'],
        'shared' => $shared[(int) $r['user_id']] ?? 0, 'badge' => Points::badge($shared[(int) $r['user_id']] ?? 0),
    ], $rows)], 200, ['Cache-Control' => 'public, max-age=60']);
});

$router->get('/api/gallery/{id}', static function (array $p) use ($gItem, $gCanSee, $gUnlocked, $gCard): void {
    $u = Session::user();
    $g = $gItem((int) $p['id']);
    if (!$gCanSee($g, $u)) { Response::error(404, 'NOT_FOUND', '시안을 찾을 수 없습니다.'); }
    $open = $gUnlocked($g, $u);
    $sharedN = (int) (Db::row("SELECT COUNT(*) AS n FROM gallery_items WHERE status = 'shared' AND user_id = ?", [(int) $g['user_id']])['n'] ?? 0);
    $card = $gCard($g, $u, [(int) $g['user_id'] => $sharedN], $u !== null && Db::row('SELECT 1 AS x FROM gallery_likes WHERE item_id = ? AND user_id = ?', [(int) $g['id'], (int) $u['id']]) ? [(int) $g['id'] => true] : [], $open ? [(int) $g['id'] => true] : []);
    $notes = null;
    if ($open) {
        Db::exec('UPDATE gallery_items SET views = views + 1 WHERE id = ?', [(int) $g['id']]);
        $res = json_decode((string) ($g['check_result'] ?? ''), true);
        if (is_array($res)) {
            $notes = [
                'summary' => (string) ($res['summary'] ?? ''),
                'height' => $res['height'] ?? null, 'similarity' => $res['similarity'] ?? null,
                'sources' => $res['sources'] ?? null,
                'frame' => isset($res['frame']) ? ['left' => $res['frame']['left'] ?? null, 'right' => $res['frame']['right'] ?? null, 'gap' => $res['frame']['gap'] ?? null, 'row_gap' => $res['frame']['row_gap'] ?? null] : null,
                'behavior' => $res['behavior'] ?? null,
                'fixes' => array_slice(array_map(static fn ($f) => is_array($f) ? (string) ($f['message'] ?? json_encode($f, JSON_UNESCAPED_UNICODE)) : (string) $f, (array) ($res['fixes'] ?? [])), 0, 12),
            ];
        }
    }
    Response::json(['item' => $card, 'notes' => $notes, 'html_url' => $open ? '/api/gallery/' . $g['id'] . '/html' : null,
        'me' => $u === null ? null : ['points' => Points::balance((int) $u['id'])], 'unlock_cost' => Points::UNLOCK_COST], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/gallery/{id}/thumb', static function (array $p) use ($gItem, $gCanSee): void {
    $g = $gItem((int) $p['id']);
    if (!$gCanSee($g, Session::user())) { Response::error(404, 'NOT_FOUND', '시안을 찾을 수 없습니다.'); }
    $f = homebox_gallery_dir() . '/' . (int) $g['id'] . '.jpg';
    if (!is_file($f)) { Response::error(404, 'NOT_FOUND', '썸네일이 아직 없습니다.'); }
    header('Content-Type: image/jpeg');
    header('Cache-Control: ' . ($g['status'] === 'shared' ? 'public' : 'private') . ', max-age=86400');
    readfile($f);
    exit;
});

$router->get('/api/gallery/{id}/html', static function (array $p) use ($gItem, $gUnlocked): void {
    $g = $gItem((int) $p['id']);
    if (!$gUnlocked($g, Session::user())) { Response::error(402, 'LOCKED', '포인트로 열어야 볼 수 있습니다.'); }
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: private, no-store');
    header("Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals; form-action 'none'");
    echo $g['html'];
    exit;
});

$router->post('/api/gallery/{id}/unlock', static function (array $p) use ($gItem, $gNeedUser, $gUnlocked): void {
    $u = $gNeedUser();
    $g = $gItem((int) $p['id']);
    if ($g['status'] !== 'shared') { Response::error(404, 'NOT_FOUND', '공유된 시안이 아닙니다.'); }
    if ($gUnlocked($g, $u)) { Response::json(['ok' => true, 'points' => Points::balance((int) $u['id'])], 200, ['Cache-Control' => 'no-store']); }
    Points::touch((int) $u['id']);
    if (!Points::spend((int) $u['id'], 'gallery_unlock', (string) $g['id'])) {
        Response::error(402, 'NOT_ENOUGH_POINTS', '포인트가 모자랍니다. 시안을 만들어 공유하거나 커뮤니티에 글을 쓰면 포인트가 쌓입니다.', ['points' => Points::balance((int) $u['id']), 'cost' => Points::UNLOCK_COST]);
    }
    if (Db::exec('INSERT IGNORE INTO gallery_unlocks (item_id, user_id) VALUES (?, ?)', [(int) $g['id'], (int) $u['id']]) > 0) {
        Db::exec('UPDATE gallery_items SET unlocks = unlocks + 1 WHERE id = ?', [(int) $g['id']]);
        if ((int) $g['user_id'] > 0) {
            Points::award((int) $g['user_id'], 'gallery_royalty', $g['id'] . ':' . $u['id']);
            $who = trim((string) ($u['name'] ?? '')) ?: '회원';
            Notify::send((int) $g['user_id'], 'like', "$who 님이 내 시안을 열어 봤습니다 (+" . Points::RULES['gallery_royalty'][0] . 'P)', '「' . ($g['title'] ?: '시안') . '」', '/gallery/' . $g['id'], (int) $u['id']);
        }
    }
    Response::json(['ok' => true, 'points' => Points::balance((int) $u['id'])], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/gallery/{id}/like', static function (array $p) use ($gItem, $gNeedUser): void {
    $u = $gNeedUser();
    $g = $gItem((int) $p['id']);
    if ($g['status'] !== 'shared') { Response::error(404, 'NOT_FOUND', '공유된 시안이 아닙니다.'); }
    $had = Db::row('SELECT 1 AS x FROM gallery_likes WHERE item_id = ? AND user_id = ?', [(int) $g['id'], (int) $u['id']]) !== null;
    if ($had) {
        Db::exec('DELETE FROM gallery_likes WHERE item_id = ? AND user_id = ?', [(int) $g['id'], (int) $u['id']]);
    } else {
        Db::exec('INSERT IGNORE INTO gallery_likes (item_id, user_id) VALUES (?, ?)', [(int) $g['id'], (int) $u['id']]);
        if ((int) $g['user_id'] > 0 && (int) $g['user_id'] !== (int) $u['id'] && Points::award((int) $g['user_id'], 'gallery_like', $g['id'] . ':' . $u['id'])) {
            $who = trim((string) ($u['name'] ?? '')) ?: '회원';
            Notify::send((int) $g['user_id'], 'like', "$who 님이 내 시안을 좋아합니다 (+" . Points::RULES['gallery_like'][0] . 'P)', '「' . ($g['title'] ?: '시안') . '」', '/gallery/' . $g['id'], (int) $u['id']);
        }
    }
    $n = (int) (Db::row('SELECT COUNT(*) AS n FROM gallery_likes WHERE item_id = ?', [(int) $g['id']])['n'] ?? 0);
    Db::exec('UPDATE gallery_items SET likes = ? WHERE id = ?', [$n, (int) $g['id']]);
    Response::json(['liked' => !$had, 'likes' => $n], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/gallery/{id}/share', static function (array $p) use ($gItem, $gNeedUser, $gBody, $gIsAdmin): void {
    $u = $gNeedUser();
    $g = $gItem((int) $p['id']);
    if ((int) $g['user_id'] !== (int) $u['id'] && !$gIsAdmin($u)) { Response::error(403, 'FORBIDDEN', '내가 만든 시안만 공유할 수 있습니다.'); }
    $b = $gBody();
    $title = trim((string) ($b['title'] ?? ''));
    $note = trim((string) ($b['note'] ?? ''));
    if ($title !== '' && (mb_strlen($title) < 2 || mb_strlen($title) > 120)) { Response::error(422, 'INVALID', '제목은 2~120자로 써 주세요.'); }
    if (mb_strlen($note) > 1000) { Response::error(422, 'INVALID', '설명은 1,000자까지 쓸 수 있습니다.'); }
    Db::exec("UPDATE gallery_items SET status = 'shared', shared_at = COALESCE(shared_at, NOW(3)), title = IF(? = '', title, ?), note = IF(? = '', note, ?) WHERE id = ?",
        [$title, $title, $note, $note, (int) $g['id']]);
    $got = (int) $g['user_id'] > 0 && Points::award((int) $g['user_id'], 'gallery_share', (string) $g['id']);
    Response::json(['ok' => true, 'awarded' => $got ? Points::RULES['gallery_share'][0] : 0, 'points' => Points::balance((int) $u['id'])], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/gallery/{id}/hide', static function (array $p) use ($gItem, $gNeedUser, $gIsAdmin): void {
    $u = $gNeedUser();
    $g = $gItem((int) $p['id']);
    if ((int) $g['user_id'] !== (int) $u['id'] && !$gIsAdmin($u)) { Response::error(403, 'FORBIDDEN', '내가 만든 시안만 내릴 수 있습니다.'); }
    Db::exec("UPDATE gallery_items SET status = 'study' WHERE id = ?", [(int) $g['id']]);
    Response::json(['ok' => true], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/points', static function () use ($gNeedUser): void {
    $u = $gNeedUser();
    Points::touch((int) $u['id']);
    $rows = Db::rows('SELECT delta, reason, ref, created_at FROM point_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50', [(int) $u['id']]);
    Response::json([
        'points' => Points::balance((int) $u['id']),
        'ledger' => array_map(static fn ($r) => ['delta' => (int) $r['delta'], 'reason' => $r['reason'], 'name' => Points::RULES[$r['reason']][1] ?? $r['reason'], 'created_at' => $r['created_at']], $rows),
        'rules' => Points::rules(), 'unlock_cost' => Points::UNLOCK_COST, 'cut' => Points::GALLERY_CUT,
    ], 200, ['Cache-Control' => 'no-store']);
});

// ---- 관리자·내부
$router->post('/api/admin/gallery/backfill', static function (): void {
    Auth::requireAdmin();
    $kept = 0; $discarded = 0;
    foreach (Db::rows('SELECT token, api_key_id, check_score, check_result FROM mockup_pages WHERE check_score IS NOT NULL') as $r) {
        homebox_gallery_store((string) $r['token'], (int) $r['api_key_id'], (int) $r['check_score'], null, 'pc');
        (int) $r['check_score'] > Points::GALLERY_CUT ? $kept++ : $discarded++;
    }
    $noThumb = (int) (Db::row('SELECT COUNT(*) AS n FROM gallery_items WHERE has_thumb = 0')['n'] ?? 0);
    Response::json(['kept' => $kept, 'discarded' => $discarded, 'missing_thumbs' => $noThumb], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/internal/gallery/missing-thumbs', static function (): void {
    Auth::requireAdmin();
    $rows = Db::rows('SELECT token, device, html FROM gallery_items WHERE has_thumb = 0 ORDER BY id LIMIT 5');
    Response::json(['items' => $rows], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/internal/gallery/{token}/thumb', static function (array $p) use ($gBody): void {
    Auth::requireAdmin();
    $token = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($p['token'] ?? ''));
    $g = Db::row('SELECT id FROM gallery_items WHERE token = ?', [$token]) ?? Response::error(404, 'NOT_FOUND', '갤러리에 없는 시안입니다.');
    $ok = homebox_gallery_save_thumb((int) $g['id'], (string) ($gBody()['thumb'] ?? ''));
    Response::json(['ok' => $ok], $ok ? 200 : 422, ['Cache-Control' => 'no-store']);
});
