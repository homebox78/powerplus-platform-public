<?php
/**
 * 통합 검색 — /api/v1/search?q=&type=assets|community|deck|mockups&limit= (기획 §13.2-4).
 * 출처: homebox-handoff api/routes/search.php(탭별 건수 + 고른 탭 결과 한 번에) 의 응답 모양을 REST v1 로.
 * 권한: 탭마다 그 모듈의 판정을 그대로 지난다(출구마다 따로 걸지 않는다 — G30).
 *   에셋 = Assets\Service::list(Access::whereVisible) · 커뮤니티 = Access::whereVisible('p')
 *   장표·시안 = 본인 것만(관리자여도 남의 것은 여기서 안 나온다 — 관리자 화면에서 본다).
 * 가이드(부품·KRDS)는 정적 데이터라 화면에서 검색한다.
 */
declare(strict_types=1);

use Pp\Assets\Service;
use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Db;
use Pp\Core\Response;
use Pp\Core\Router;

const SEARCH_TYPES = ['assets', 'community', 'deck', 'mockups'];

return static function (Router $r): void {
    $r->get('/search', function (array $p, Actor $a): void {
        $q = trim((string) ($_GET['q'] ?? ''));
        $type = in_array($_GET['type'] ?? '', SEARCH_TYPES, true) ? (string) $_GET['type'] : 'assets';
        $limit = max(1, min(60, (int) ($_GET['limit'] ?? 24)));
        $counts = array_fill_keys(SEARCH_TYPES, 0);
        if (mb_strlen($q) < 1) {
            Response::json(['q' => '', 'type' => $type, 'counts' => $counts, 'items' => []]);
        }
        $q = mb_substr($q, 0, 100);
        // 탭을 안 고르고 검색하면 검색어가 바라는 탭을 빠른 판단(Jev)으로 고른다(확신도 0.7 미만이면 자산 그대로).
        $best = null;
        if (!in_array($_GET['type'] ?? '', SEARCH_TYPES, true) && mb_strlen($q) >= 2) {
            $best = \Pp\Core\Triage::searchTab($q);
            if ($best === 'deck' && $a->id() === null) {
                $best = null;
            }
            $type = $best ?? $type;
        }
        $like = '%' . addcslashes(mb_strtolower($q), '%_\\') . '%';
        $items = [];

        // 에셋 — 애드인·에셋 검색과 같은 서비스(목업 샘플은 기본 제외, 등급 밖은 쿼리에서 빠진다)
        $assets = Service::list($a, ['q' => $q, 'addin' => true, 'sort' => 'newest'], $type === 'assets' ? $limit : 1, 0);
        $counts['assets'] = $assets['total'];
        if ($type === 'assets') {
            $items = array_map(static fn (array $x): array => [
                'type' => 'asset', 'id' => $x['id'], 'title' => $x['name'] ?: ($x['alt'] ?: $x['category_ko']),
                'category' => $x['category'], 'category_ko' => $x['category_ko'], 'visibility' => $x['visibility'],
                'ai' => $x['ai_generated'], 'thumb_url' => $x['thumb_url'], 'url' => '/assets/browse?q=' . rawurlencode($q) . '&item=' . $x['id'],
            ], $assets['rows']);
        }

        // 커뮤니티 — 글 목록과 같은 판정(사내 게시판은 임직원만)
        [$vis, $vp] = Access::whereVisible($a, 'p');
        // 비회원은 공지 말고는 본문을 못 본다 — 본문 검색·미리보기도 공지만
        $anon = $a->user === null;
        $cw = "p.deleted_at IS NULL AND {$vis} AND (LOWER(p.title) LIKE ? OR " . ($anon ? "(p.category = 'notice' AND LOWER(p.body) LIKE ?)" : 'LOWER(p.body) LIKE ?') . ')';
        $cargs = array_merge($vp, [$like, $like]);
        $counts['community'] = (int) Db::val("SELECT COUNT(*) FROM comm_posts p WHERE {$cw}", $cargs);
        if ($type === 'community') {
            $rows = Db::rows("SELECT p.public_id, p.category, p.title, p.body, p.comment_count, p.like_count, p.created_at, u.name AS author
                              FROM comm_posts p LEFT JOIN core_users u ON u.id = p.owner_user_id WHERE {$cw} ORDER BY p.created_at DESC LIMIT {$limit}", $cargs);
            $items = array_map(static fn (array $x): array => [
                'type' => 'post', 'id' => $x['public_id'], 'title' => $x['title'], 'category' => $x['category'],
                'excerpt' => ($anon && $x['category'] !== 'notice') ? '' : mb_substr(preg_replace('/\s+/u', ' ', (string) $x['body']) ?? '', 0, 140),
                'author' => trim((string) $x['author']) ?: '회원', 'comments' => (int) $x['comment_count'], 'likes' => (int) $x['like_count'],
                'created_at' => $x['created_at'], 'url' => '/community/' . $x['public_id'],
            ], $rows);
        }

        // 내 장표 작업 — deck_jobs 는 옛 스키마라 주인이 email. 로그인 안 했으면 0.
        $email = $a->user['email'] ?? null;
        if ($email !== null) {
            $dw = 'email = ? AND (LOWER(title) LIKE ? OR LOWER(filename) LIKE ?)';
            $dargs = [$email, $like, $like];
            $counts['deck'] = (int) Db::val("SELECT COUNT(*) FROM deck_jobs WHERE {$dw}", $dargs);
            if ($type === 'deck') {
                $rows = Db::rows("SELECT id, title, filename, status, slides, progress, created_at FROM deck_jobs WHERE {$dw} ORDER BY created_at DESC LIMIT {$limit}", $dargs);
                $items = array_map(static fn (array $x): array => [
                    'type' => 'deck', 'id' => $x['id'], 'title' => $x['title'], 'filename' => $x['filename'], 'status' => $x['status'],
                    'slides' => $x['slides'] === null ? null : (int) $x['slides'], 'created_at' => $x['created_at'],
                    'url' => '/deck/jobs?id=' . rawurlencode((string) $x['id']),
                ], $rows);
            }

            // 내 시안 — 본인 것만
            $mw = 'owner_user_id = ? AND deleted_at IS NULL AND (LOWER(title) LIKE ? OR LOWER(COALESCE(ref_id, \'\')) LIKE ?)';
            $margs = [$a->id(), $like, $like];
            $counts['mockups'] = (int) Db::val("SELECT COUNT(*) FROM mock_mockups WHERE {$mw}", $margs);
            if ($type === 'mockups') {
                $rows = Db::rows("SELECT public_id, token, title, score, passed, device, published_at, discarded_at, created_at FROM mock_mockups WHERE {$mw} ORDER BY created_at DESC LIMIT {$limit}", $margs);
                $items = array_map(static fn (array $x): array => [
                    'type' => 'mockup', 'id' => $x['public_id'], 'title' => $x['title'] !== '' ? $x['title'] : '제목 없는 시안',
                    'score' => $x['score'] === null ? null : (int) $x['score'], 'passed' => $x['passed'] === null ? null : (bool) $x['passed'],
                    'device' => $x['device'], 'published' => $x['published_at'] !== null, 'discarded' => $x['discarded_at'] !== null,
                    'created_at' => $x['created_at'], 'url' => '/mock/mockups?tab=mine', 'preview_url' => '/api/v1/mock/mockups/' . $x['token'] . '/html',
                ], $rows);
            }
        }

        Response::json(['q' => $q, 'type' => $type, 'counts' => $counts, 'items' => $items, 'signed_in' => $email !== null, 'picked_by_ai' => $best !== null]);
    });
};
