<?php
/**
 * powerAssets 애드인(PowerPoint 작업창) 전용 라우트 — /api/v1/addin/…
 * 출처: powerPlus server(AuthController·PrefsService·AnnouncementService) — 옛 애드인 작업창이 쓰던 로그인·즐겨찾기·최근·공지를 플랫폼 표로.
 * 작업창은 Office 웹에서 iframe 이라 쿠키가 막힐 수 있다 → 로그인하면 이름 "powerAssets 애드인"(범위 assets) 키를 발급해 Bearer 로 쓴다.
 * 그 키는 목업 샘플을 열지 않는다(Service::canSample).
 */
declare(strict_types=1);

use Pp\Assets\Service;
use Pp\Core\Actor;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Keys;
use Pp\Core\Otp;
use Pp\Core\Response;
use Pp\Core\Router;

return static function (Router $r): void {
    $need = static function (Actor $a): int {
        $id = $a->id();
        if ($id === null) {
            throw new HttpError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
        }
        return $id;
    };
    $item = static function (Actor $a, string $pid): array {
        $it = Db::row('SELECT id, visibility, owner_user_id, org_id FROM asset_items WHERE public_id = ? AND deleted_at IS NULL', [$pid]);
        if (!$it) {
            throw HttpError::notFound('에셋');
        }
        \Pp\Core\Access::assert($a, $it);
        return $it;
    };

    // 로그인 — OTP 요청은 /auth/otp/request 를 그대로 쓴다. 확인 때 애드인 키를 새로 발급(이전 애드인 키는 폐기).
    $r->post('/addin/login', function (): void {
        $in = Response::input();
        $u = Otp::verify((string) ($in['email'] ?? ''), (string) ($in['code'] ?? ''));
        Db::exec('UPDATE core_api_keys SET revoked_at = NOW(3) WHERE user_id = ? AND name = ? AND revoked_at IS NULL', [$u['id'], Service::ADDIN_KEY]);
        [, $raw] = Keys::issue((int) $u['id'], Service::ADDIN_KEY, ['assets']);
        Response::json(['token' => $raw, 'email' => $u['email'], 'name' => $u['name'] ?? null]);
    });

    $r->post('/addin/logout', function (array $p, Actor $a): void {
        if ($a->via === 'key' && ($a->key['name'] ?? '') === Service::ADDIN_KEY) {
            Db::exec('UPDATE core_api_keys SET revoked_at = NOW(3) WHERE id = ?', [$a->key['id']]);
        }
        Response::noContent();
    });

    // 즐겨찾기 — id 목록만(목록은 /assets/items?ids= 로 받는다)
    $r->get('/addin/favorites', function (array $p, Actor $a) use ($need): void {
        $uid = $need($a);
        Response::json(array_column(Db::rows('SELECT i.public_id FROM asset_favorites f JOIN asset_items i ON i.id = f.item_id AND i.deleted_at IS NULL WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT 500', [$uid]), 'public_id'));
    });
    $r->post('/addin/favorites/{id}', function (array $p, Actor $a) use ($need, $item): void {
        $uid = $need($a);
        $it = $item($a, (string) $p['id']);
        Db::exec('INSERT IGNORE INTO asset_favorites (user_id, item_id) VALUES (?, ?)', [$uid, $it['id']]);
        Response::noContent();
    });
    $r->delete('/addin/favorites/{id}', function (array $p, Actor $a) use ($need): void {
        $uid = $need($a);
        Db::exec('DELETE f FROM asset_favorites f JOIN asset_items i ON i.id = f.item_id WHERE f.user_id = ? AND i.public_id = ?', [$uid, $p['id']]);
        Response::noContent();
    });

    // 최근 삽입 — 내가 쓴 에셋, 가장 최근 순
    $r->get('/addin/recent', function (array $p, Actor $a) use ($need): void {
        $uid = $need($a);
        Response::json(array_column(Db::rows('SELECT i.public_id, MAX(u.created_at) AS t FROM asset_uses u JOIN asset_items i ON i.id = u.item_id AND i.deleted_at IS NULL WHERE u.user_id = ? GROUP BY i.id ORDER BY t DESC LIMIT 60', [$uid]), 'public_id'));
    });

    // 공지 — 커뮤니티 공지사항(공개분) 최근 10개
    $r->get('/addin/announcements', function (): void {
        $rows = Db::rows("SELECT public_id, title, body, created_at FROM comm_posts WHERE category = 'notice' AND visibility = 'public' AND deleted_at IS NULL ORDER BY id DESC LIMIT 10");
        Response::json(array_map(static fn ($x) => [
            'id' => $x['public_id'], 'title' => $x['title'],
            'body' => mb_substr(trim(strip_tags((string) $x['body'])), 0, 400), 'created_at' => $x['created_at'],
        ], $rows));
    });

    // ── Jev 빠른 판단(2026-10-07) — AI 는 고르기만 한다. 꺼져 있거나 실패하면 규칙으로, 그것도 아니면 null(전체에서 찾기) ──
    $ruleKind = static function (string $t): ?string {
        $rules = [
            'ppt' => '/표지|목차|간지|감사합니다|질의\s*응답|Q\s*&\s*A|장표|템플릿|슬라이드/u',
            'diagram' => '/프로세스|절차|단계|흐름|구조도|체계도|조직도|로드맵|도표|다이어그램|차트|그래프|비교표/u',
            'icon' => '/아이콘|체크|표시|기호|버튼|화살표/u',
            'photo' => '/사진|현장|풍경|사람들|인물|건물|실사/u',
            'illust' => '/일러스트|삽화|캐릭터|그림/u',
        ];
        foreach ($rules as $k => $re) {
            if (preg_match($re, $t)) {
                return $k;
            }
        }
        return null;
    };

    // 검색어 → 종류 자동 선택
    $r->post('/addin/route', function (array $p, Actor $a) use ($need, $ruleKind): void {
        $need($a);
        $q = trim((string) (Response::input()['q'] ?? ''));
        if ($q === '' || mb_strlen($q) > 100) {
            Response::json(['kind' => null, 'by' => null]);
            return;
        }
        $k = \Pp\Core\Triage::assetKind($q);
        $by = $k !== null ? 'ai' : null;
        if ($k === null && ($k = $ruleKind($q)) !== null) {
            $by = 'rule';
        }
        Response::json(['kind' => $k, 'by' => $by]);
    });

    // 선택한 슬라이드 글 → 종류 + 검색 낱말(실제 태그에 있는 낱말만 후보)
    $r->post('/addin/suggest', function (array $p, Actor $a) use ($need, $ruleKind): void {
        $need($a);
        $in = Response::input();
        $title = trim(mb_substr((string) ($in['title'] ?? ''), 0, 200));
        $body = trim(mb_substr((string) ($in['text'] ?? ''), 0, 2000));
        $text = trim($title . "\n" . $body);
        if (mb_strlen($text) < 2) {
            throw new HttpError('EMPTY_SLIDE', '슬라이드에 글이 없습니다. 제목이나 본문이 있는 슬라이드를 골라 주세요.', 422);
        }
        // 후보 낱말: 2글자 이상 덩어리, 끝 조사를 뗀 형태도 같이 본다
        preg_match_all('/[\p{Hangul}A-Za-z0-9]{2,}/u', $text, $m);
        $josa = '/(으로|에서|에게|까지|부터|이며|하고|및|은|는|이|가|을|를|의|에|와|과|로|도|만)$/u';
        $cand = [];
        foreach ($m[0] as $w) {
            foreach ([$w, preg_replace($josa, '', $w) ?? $w] as $x) {
                if (mb_strlen($x) >= 2 && mb_strlen($x) <= 20 && !preg_match('/^\d+$/', $x)) {
                    $cand[$x] = true;
                }
            }
            if (count($cand) >= 60) {
                break;
            }
        }
        $words = [];
        if ($cand) {
            $list = array_keys($cand);
            $ph = implode(',', array_fill(0, count($list), '?'));
            $rows = Db::rows("SELECT tag, COUNT(*) AS c FROM asset_tags WHERE axis = 'kw' AND tag IN ($ph) GROUP BY tag ORDER BY c DESC LIMIT 12", $list);
            $titleSet = $title !== '' ? $title : $text;
            usort($rows, static fn ($x, $y) => [(int) !str_contains($titleSet, (string) $x["tag"]), (int) $y["c"]] <=> [(int) !str_contains($titleSet, (string) $y["tag"]), (int) $x["c"]]);
            $words = array_map(static fn ($x) => (string) $x['tag'], $rows);
        }
        $kind = \Pp\Core\Triage::slideKind($text);
        $kindBy = $kind !== null ? 'ai' : null;
        if ($kind === null && ($kind = $ruleKind($text)) !== null) {
            $kindBy = 'rule';
        }
        $kw = $words ? \Pp\Core\Triage::slideKeyword($text, $words) : null;
        $kwBy = $kw !== null && count($words) > 1 ? 'ai' : ($kw !== null ? 'rule' : null);
        if ($kw === null && $words) {
            $kw = $words[0];
            $kwBy = 'rule';
        }
        Response::json(['kind' => $kind, 'kind_by' => $kindBy, 'keyword' => $kw, 'keyword_by' => $kwBy, 'candidates' => array_slice($words, 0, 6)]);
    });
};
