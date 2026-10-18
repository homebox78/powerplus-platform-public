<?php
declare(strict_types=1);

/**
 * powerMock — 시안 보관·판정 기록·게시·갤러리·포인트.
 * 출처: homebox-handoff api/routes/mockup-pages.php(시안 보관·받아쓰기 줄이기·공개 주소) + gallery.php(갤러리·포인트) 를
 *       REST v1·Actor·Access::can·public_id 규약으로 옮겼다. 판정(check_mockup)은 MCP(powerMCP) 가 쥐고 결과만 여기에 기록한다.
 *
 *   POST   /mock/mockups                 {mode: draft|publish, token?, html?, edits?, title?, ref_id?, base_token?, device?}
 *   POST   /mock/mockups/{token}/check   {score, pass, ref_id?, result, thumb?(base64 jpeg), device?}
 *   GET    /mock/mockups                 내 시안 목록(판정·게시·갤러리 상태)
 *   GET    /mock/mockups/{token}         내 시안 하나(판정 기록)
 *   DELETE /mock/mockups/{token}
 *   GET    /p/{token}                    게시된 시안(CSP sandbox — 세션에 닿지 못한다)
 *   GET    /mock/gallery?view=shared|mine&sort=popular|new|score   · /mock/gallery/leaders · /mock/gallery/{id}(+thumb·html)
 *   POST   /mock/gallery/{id}/{unlock|like|share|hide}
 *   GET    /mock/points                  잔액·내역·규칙
 *
 * 보안: 게시 화면은 CSP sandbox(allow-same-origin 없음)·noindex·30일 만료·사용자당 하루 60건·한 장 2MB(§5.3).
 */

use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Notify;
use Pp\Core\Points;
use Pp\Core\Response;
use Pp\Core\Router;

const MOCK_MAX_BYTES = 2 * 1024 * 1024;
const MOCK_DAYS = 30;
const MOCK_PER_DAY = 60;
const MOCK_GALLERY_CUT = 84;   // 통과선(85점 이상 + 치명 0)만 보관·노출 — 미통과 시안은 목록·갤러리에 남기지 않는다(2026-10-13 사용자 지시)

return static function (Router $r): void {
    $tokenOf = static fn (string $s): string => (string) preg_replace('/[^A-Za-z0-9_-]/', '', $s);
    $galleryDir = static function (): string {
        $d = rtrim((string) Config::get('storage.dir'), '/\\') . '/mock/gallery';
        if (!is_dir($d)) {
            @mkdir($d, 0775, true);
        }
        return $d;
    };

    /** 찾아 바꾸기 — 없거나(0번) 여러 번(all 아니면) 나오면 어느 항목인지 말하고 멈춘다. */
    $applyEdits = static function (string $html, array $edits): string {
        // 줄바꿈은 LF 하나로 — 윈도에서 쓴 시안(CRLF)과 AI 가 친 find(LF)가 어긋나 '찾지 못함'이 나던 것(2026-10-15 시험 s09)
        $html = str_replace("\r\n", "\n", $html);
        foreach (array_values($edits) as $i => $e) {
            if (!is_array($e)) {
                throw HttpError::invalid("edits[{$i}] 는 {find, replace} 객체여야 합니다.");
            }
            $find = str_replace("\r\n", "\n", (string) ($e['find'] ?? ''));
            $rep = str_replace("\r\n", "\n", (string) ($e['replace'] ?? ''));
            if ($find === '') {
                throw HttpError::invalid("edits[{$i}].find 가 비어 있습니다.");
            }
            $n = substr_count($html, $find);
            if ($n === 0) {
                // 공백(들여쓰기·줄바꿈) 차이만 있으면 그대로 맞춘다 — 한 군데만 맞을 때만
                $parts = preg_split('/\s+/u', trim($find)) ?: [];
                $re = '/' . implode('\s*', array_map(static fn ($w) => preg_quote($w, '/'), $parts)) . '/u';
                if ($parts && preg_match_all($re, $html, $mm, PREG_OFFSET_CAPTURE) === 1) {
                    [$hit, $at] = $mm[0][0];
                    $html = substr_replace($html, $rep, (int) $at, strlen($hit));
                    continue;
                }
                // 첫 낱말 근처 보관 원문을 같이 돌려준다 — 보관본이 어떻게 생겼는지 몰라 전체를 다시 보내던 것
                $near = '';
                $head = $parts[0] ?? '';
                if ($head !== '' && ($pos = strpos($html, $head)) !== false) {
                    $near = ' · 보관본 해당 부분: ' . mb_substr(substr($html, $pos, 240), 0, 160);
                }
                throw HttpError::invalid("edits[{$i}] 의 find 를 보관된 시안에서 찾지 못했습니다(앞 항목이 이미 바꿨을 수 있습니다). 보관본에는 hb:use·동작 스크립트·기본 CSS 가 펼쳐져 있으니 그 자리 표시(<!--hb:use …-->·data-hb-base)를 find 에 넣지 마세요: " . mb_substr($find, 0, 80) . $near);
            }
            if ($n > 1 && empty($e['all'])) {
                throw HttpError::invalid("edits[{$i}] 의 find 가 시안에 {$n}번 나옵니다. 앞뒤 글자를 더 붙여 한 군데만 맞게 하거나, 전부 바꿀 거면 all: true 를 주세요: " . mb_substr($find, 0, 80));
            }
            $html = empty($e['all']) ? substr_replace($html, $rep, (int) strpos($html, $find), strlen($find)) : str_replace($find, $rep, $html);
        }
        return $html;
    };

    /** 비어 있는 <style data-hb-base></style> 자리를 기본 CSS 로 채운다 */
    $fillBase = static function (string $html): string {
        $slot = '/<style\b[^>]*\bdata-hb-base\b[^>]*>\s*<\/style>/i';
        if (preg_match($slot, $html)) {
            $css = (string) @file_get_contents(dirname(__DIR__) . '/data/hb-base.css');
            $html = (string) preg_replace_callback($slot, static fn () => "<style data-hb-base=\"1\">\n" . $css . "\n</style>", $html);
        }
        return $html;
    };

    /**
     * 받아쓰기 줄이기 — AI 가 매 장 똑같이 다시 쓰던 부분을 서버가 채운다.
     *   <script data-hb-behavior></script> → 동작 스크립트 / <style data-hb-base></style> → 기본 CSS / <!--hb:use 이름--> → 기준 시안의 그 부분
     */
    /** 기준 시안에서 부분 하나 — 없으면 null. 머리의 h1(로고)은 서브에서 div 로 내린다(서브 h1 = 페이지 이름, 2026-10-15 시험 4/10곳이 h1 2개로 감점) */
    $basePart = static function (string $src, string $name): ?string {
        $q = preg_quote($name, '/');
        $part = null;
        if (preg_match('/<!--\s*hb:part\s+' . $q . '\s*-->(.*?)<!--\s*\/hb:part\s*-->/s', $src, $pm)) {
            $part = $pm[1];
        } elseif ($name === 'style' && preg_match_all('/<style\b[^>]*>.*?<\/style>/is', $src, $sm)) {
            $part = implode("\n", $sm[0]);
        } elseif ($name === 'header' && preg_match('/<body\b[^>]*>(.*?<\/header>)/is', $src, $hm) && !preg_match('/<(main|section)\b/i', $hm[1])) {
            // <header> 앞의 공식 누리집 띠·건너뛰기 링크도 머리다 — <header> 만 가져와 서브에서 띠가 빠지던 것(2026-10-15 시험 s02)
            $part = (string) preg_replace('/<script\b.*?<\/script>/is', '', $hm[1]);
        } elseif ($name === 'header' && preg_match('/<header\b.*?<\/header>/is', $src, $hm)) {
            $part = $hm[0];
        } elseif ($name === 'footer' && preg_match_all('/<footer\b.*?<\/footer>/is', $src, $fm)) {
            $part = (string) end($fm[0]);
        }
        if ($part !== null && $name === 'header') {
            $part = (string) preg_replace(['/<h1\b([^>]*)>/i', '/<\/h1\s*>/i'], ['<div$1 data-hb-was="h1">', '</div>'], $part);
        }
        return $part;
    };

    $expand = static function (string $html, int $ownerId, string $baseToken) use ($fillBase, $basePart): string {
        $slot = '/<script\b[^>]*\bdata-hb-behavior\b[^>]*>\s*<\/script>/i';
        if (preg_match($slot, $html)) {
            $js = (string) @file_get_contents(dirname(__DIR__) . '/data/hb-behavior.js');
            $html = (string) preg_replace_callback($slot, static fn () => "<script data-hb-behavior=\"1\">\n" . $js . "\n</script>", $html, 1);
        }
        $html = $fillBase($html);
        if (!preg_match_all('/<!--\s*hb:use\s+([A-Za-z0-9_-]+)\s*-->/', $html, $m)) {
            return $html;
        }
        if ($baseToken === '') {
            throw HttpError::invalid('<!--hb:use …--> 를 쓰려면 base_token(먼저 판정한 메인 시안의 token)을 함께 보내세요.');
        }
        $base = Db::row('SELECT html FROM mock_mockups WHERE token = ? AND owner_user_id = ? AND deleted_at IS NULL', [$baseToken, $ownerId]);
        if ($base === null) {
            throw HttpError::notFound('base_token 시안(만료됐거나 다른 계정의 것)');
        }
        $src = (string) $base['html'];
        foreach (array_unique($m[1]) as $name) {
            $q = preg_quote($name, '/');
            $part = $basePart($src, $name);
            if ($part === null) {
                throw HttpError::invalid("기준 시안에 \"{$name}\" 부분이 없습니다. 기준 시안에서 <!--hb:part {$name}-->…<!--/hb:part--> 로 표시했거나, style·header·footer 중 하나여야 합니다.");
            }
            // 넣은 자리를 표시해 둔다 — 메인을 고친 뒤 서브를 token 으로 다시 판정하면 최신 메인 것으로 바꿔 넣는다
            $html = (string) preg_replace_callback('/<!--\s*hb:use\s+' . $q . '\s*-->/', static fn () => "<!--hb:from {$name}-->" . $part . '<!--/hb:from-->', $html);
        }
        return $fillBase($html);
    };

    /** 보관된 서브의 hb:from 구간을 기준 시안 최신본으로 다시 채운다(기준이 없거나 그대로면 그대로) */
    $resync = static function (string $html, int $ownerId, string $baseToken) use ($basePart): string {
        if ($baseToken === '' || !str_contains($html, '<!--hb:from ')) {
            return $html;
        }
        $base = Db::row('SELECT html FROM mock_mockups WHERE token = ? AND owner_user_id = ? AND deleted_at IS NULL', [$baseToken, $ownerId]);
        if ($base === null) {
            return $html;
        }
        $src = (string) $base['html'];
        return (string) preg_replace_callback('/<!--hb:from ([A-Za-z0-9_-]+)-->.*?<!--\/hb:from-->/s', static function (array $mm) use ($src, $basePart): string {
            $part = $basePart($src, $mm[1]);
            return $part === null ? $mm[0] : '<!--hb:from ' . $mm[1] . '-->' . $part . '<!--/hb:from-->';
        }, $html);
    };

    $mockupPub = static function (array $m, ?array $g = null): array {
        return [
            'id' => $m['public_id'], 'token' => $m['token'], 'title' => (string) $m['title'] ?: '제목 없는 시안', 'ref_id' => $m['ref_id'],
            'device' => $m['device'], 'bytes' => (int) $m['bytes'], 'score' => $m['score'] === null ? null : (int) $m['score'],
            'passed' => $m['passed'] === null ? null : (bool) $m['passed'], 'check_count' => (int) $m['check_count'],
            'published' => $m['published_at'] !== null, 'path' => $m['published_at'] !== null ? '/api/v1/p/' . $m['token'] : null,
            'views' => (int) $m['views'], 'thumb_url' => (int) $m['has_thumb'] === 1 ? '/api/v1/mock/mockups/' . $m['token'] . '/thumb?v=' . strtotime((string) $m['updated_at']) : null,
            'discarded' => $m['discarded_at'] !== null, 'expires_at' => $m['expires_at'], 'created_at' => $m['created_at'], 'checked_at' => $m['checked_at'],
            'gallery' => $g ? ['id' => (int) $g['id'], 'status' => $g['status'], 'likes' => (int) $g['likes'], 'unlocks' => (int) $g['unlocks']] : null,
        ];
    };

    $saveThumb = static function (int $galleryId, string $b64) use ($galleryDir): bool {
        $bin = base64_decode($b64, true);
        if ($bin === false || strlen($bin) < 200 || strlen($bin) > 3_000_000 || substr($bin, 0, 3) !== "\xFF\xD8\xFF") {
            return false;
        }
        return @file_put_contents($galleryDir() . "/{$galleryId}.jpg", $bin) !== false;
    };

    /** 판정 직후 — 기준을 넘으면 갤러리에 보관·갱신(+포인트), 아니면 폐기 표시 */
    $galleryStore = static function (array $m, int $score, ?string $thumb, string $device, bool $pass = false) use ($saveThumb): void {
        try {
            $mid = (int) $m['id'];
            $uid = (int) ($m['owner_user_id'] ?? 0);
            $old = Db::row('SELECT id, score FROM mock_gallery WHERE mockup_id = ?', [$mid]);
            if (!$pass || $score <= MOCK_GALLERY_CUT) {
                if ($old === null) {
                    Db::exec('UPDATE mock_mockups SET discarded_at = COALESCE(discarded_at, NOW(3)) WHERE id = ?', [$mid]);
                }
                return;
            }
            Db::exec('UPDATE mock_mockups SET discarded_at = NULL WHERE id = ?', [$mid]);
            $dev = $device === 'mobile' ? 'mobile' : 'pc';
            if ($old === null) {
                Db::exec('INSERT INTO mock_gallery (mockup_id, owner_user_id, title, score, ref_id, device, html, check_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$mid, $uid ?: null, (string) $m['title'], $score, $m['ref_id'], $dev, (string) $m['html'], $m['check_json']]);
                $gid = (int) Db::lastId();
                if ($uid > 0) {
                    Points::award($uid, 'mockup_keep', 'mockup', (string) $mid);
                    Notify::send($uid, 'system', "시안이 학습 자료로 보관됐습니다 ({$score}점)", '/mock/mockups', null, '시안 메뉴에서 갤러리에 공유하면 +50P, 다른 사람이 열어 볼 때마다 +10P 가 쌓입니다.');
                }
            } elseif ($score >= (int) $old['score']) {
                $gid = (int) $old['id'];
                Db::exec('UPDATE mock_gallery SET title = IF(? = \'\', title, ?), score = ?, ref_id = ?, device = ?, html = ?, check_json = ? WHERE id = ?',
                    [(string) $m['title'], (string) $m['title'], $score, $m['ref_id'], $dev, (string) $m['html'], $m['check_json'], $gid]);
            } else {
                return; // 더 낮은 재판정은 보관본을 덮지 않는다
            }
            if ($thumb !== null && $thumb !== '' && $saveThumb($gid, $thumb)) {
                Db::exec('UPDATE mock_mockups SET has_thumb = 1 WHERE id = ?', [$mid]);
            }
        } catch (\Throwable $e) {
            error_log('[pp-gallery] ' . $e->getMessage());
        }
    };

    // ---------------------------------------------------------------- 시안 보관·게시
    $r->post('/mock/mockups', static function (array $p, Actor $a) use ($tokenOf, $applyEdits, $expand, $resync, $mockupPub): void {
        $u = Auth::requireUser($a);
        $uid = (int) $u['id'];
        $b = Response::input();
        $mode = ($b['mode'] ?? 'draft') === 'publish' ? 'publish' : 'draft';
        $title = mb_substr(trim((string) ($b['title'] ?? '')), 0, 120);
        $refId = mb_substr(trim((string) ($b['ref_id'] ?? '')), 0, 255);
        $token = $tokenOf((string) ($b['token'] ?? ''));
        $edits = is_array($b['edits'] ?? null) ? $b['edits'] : [];
        $newHtml = isset($b['html']) ? (string) $b['html'] : null;
        $device = ($b['device'] ?? 'pc') === 'mobile' ? 'mobile' : 'pc';
        Db::exec('DELETE FROM mock_mockups WHERE expires_at < NOW(3) AND id NOT IN (SELECT mockup_id FROM mock_gallery)');
        // 미통과(폐기) 시안은 다시 판정할 하루만 두고 삭제한다
        Db::exec('UPDATE mock_mockups SET deleted_at = NOW(3), published_at = NULL WHERE discarded_at IS NOT NULL AND discarded_at < NOW(3) - INTERVAL 1 DAY AND deleted_at IS NULL');

        $own = null;
        if ($token !== '') {
            $own = Db::row('SELECT * FROM mock_mockups WHERE token = ? AND deleted_at IS NULL', [$token]);
            if ($own === null) {
                Response::error('NOT_FOUND', '시안 token 을 찾을 수 없습니다(만료됐거나 지워졌습니다).', 404, 'html 을 보내 새로 판정하세요.');
            }
            // O-32: 남의 시안은 404 가 아니라 403 — "없음"으로 읽혀 같은 token 으로 계속 고치려 들던 것
            if ((int) $own['owner_user_id'] !== $uid) {
                throw HttpError::forbidden('다른 계정이 만든 시안은 고칠 수 없습니다. html 을 보내 새로 판정하세요.');
            }
        }

        if ($mode === 'publish' && $newHtml === null && !$edits) {
            if ($own === null) {
                throw HttpError::invalid('check_mockup 이 돌려준 token 을 보내세요.');
            }
            if ((int) ($own['passed'] ?? 0) !== 1) {
                Response::error('NOT_PASSED', '이 시안은 아직 판정(check_mockup)을 통과하지 못했습니다.', 409, 'fixes 를 고쳐 token 과 edits 로 다시 판정하고, 통과하면 게시하세요.');
            }
            Db::exec('UPDATE mock_mockups SET published_at = COALESCE(published_at, NOW(3)), visibility = \'public\', title = IF(? = \'\', title, ?), expires_at = NOW(3) + INTERVAL ' . MOCK_DAYS . ' DAY WHERE id = ?', [$title, $title, (int) $own['id']]);
            Audit::log($a, 'mock.publish', 'mockup:' . $own['public_id']);
            $m = Db::row('SELECT * FROM mock_mockups WHERE id = ?', [(int) $own['id']]);
            Response::json($mockupPub($m));
        }

        if ($newHtml !== null) {
            $newHtml = $expand(str_replace("\r\n", "\n", $newHtml), $uid, $tokenOf((string) ($b['base_token'] ?? '')));
        }
        $html = $newHtml ?? $resync((string) ($own['html'] ?? ''), $uid, (string) ($own['base_token'] ?? ''));
        if ($html === '') {
            throw HttpError::invalid('html 이 없습니다. 처음 판정할 때는 완성한 HTML 문서 전체를, 다시 판정할 때는 token 과 edits 를 보내세요.');
        }
        if ($edits) {
            $html = $applyEdits($html, $edits);
        }
        $bytes = strlen($html);
        if ($bytes < 50 || stripos($html, '<') === false) {
            throw HttpError::invalid('HTML 이 비어 있습니다. 완성한 HTML 문서 전체를 보내세요.');
        }
        if ($bytes > MOCK_MAX_BYTES) {
            Response::error('TOO_LARGE', '한 장에 2MB 까지 받습니다.', 413, '이미지를 data URI 로 넣지 말고 에셋 주소를 그대로 쓰세요.');
        }
        $bt = $tokenOf((string) ($b['base_token'] ?? ''));
        if ($own !== null) {
            $changed = $html !== (string) $own['html'];
            Db::exec('UPDATE mock_mockups SET html = ?, bytes = ?, device = ?, title = IF(? = \'\', title, ?), ref_id = IF(? = \'\', ref_id, ?), base_token = IF(? = \'\', base_token, ?),'
                . ($changed ? ' published_at = NULL, visibility = \'private\', passed = NULL, score = NULL,' : '')
                . ' expires_at = NOW(3) + INTERVAL ' . MOCK_DAYS . ' DAY WHERE id = ?',
                [$html, $bytes, $device, $title, $title, $refId, $refId, $bt, $bt, (int) $own['id']]);
            $id = (int) $own['id'];
        } else {
            // 한도: 외부 60건 / 임직원은 관리자 설정 mock.per_day_staff(기본 300) — 여러 작업을 같이 돌리는 사내 시험이 60건에 막혔다(2026-10-12 MCP 시험)
            $perDay = $a->isStaff() ? max(MOCK_PER_DAY, (int) (Db::val("SELECT v FROM core_settings WHERE k = 'mock.per_day_staff'") ?: 300)) : MOCK_PER_DAY;
            $today = (int) Db::val('SELECT COUNT(*) FROM mock_mockups WHERE owner_user_id = ? AND created_at >= CURDATE()', [$uid]);
            if ($today >= $perDay) {
                throw HttpError::tooMany('시안은 하루 ' . $perDay . '건까지 새로 만들 수 있습니다(오늘 ' . $today . '건). 같은 시안을 다시 판정할 때는 받은 token 과 edits 만 보내세요.');
            }
            $token = rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=');
            Db::exec('INSERT INTO mock_mockups (public_id, owner_user_id, org_id, visibility, token, base_token, api_key_id, title, ref_id, device, html, bytes, expires_at) VALUES (?, ?, ?, \'private\', ?, ?, ?, ?, ?, ?, ?, ?, NOW(3) + INTERVAL ' . MOCK_DAYS . ' DAY)',
                [Ids::publicId(), $uid, $a->orgId, $token, $bt !== '' ? $bt : null, $a->key['id'] ?? null, $title, $refId !== '' ? $refId : null, $device, $html, $bytes]);
            $id = (int) Db::lastId();
        }
        // 페이지 종류가 아직 없으면 마크업으로 미리 채운다 — 판정을 안 거친 시안(가져오기)이 갤러리 '메인'에 섞이던 것(R41).
        // 기본 CSS 에 같은 클래스 이름이 다 들어 있으니 CSS 가 아니라 class="…"·aria-label 속성으로 본다. 판정하면 레퍼런스 page_type 으로 덮인다.
        $subMark = (bool) preg_match('/class="[^"]*\b(hb-subvisual|sub-visual|subvisual|sub_visual|hb-lnb|lnb|snb|sub-nav|subnav|hb-path|breadcrumb)\b[^"]*"|aria-label="(경로|현재 위치|breadcrumb)"/u', $html);
        Db::exec("UPDATE mock_mockups SET page = ? WHERE id = ? AND COALESCE(page, '') = ''", [$subMark || $bt !== '' ? 'content' : 'main', $id]);
        // 같은 묶음(메인 + 그 메인을 기준으로 만든 서브)의 판정 기록 — 서브 틀이 장마다 같은지 MCP 가 대조한다
        $peers = [];
        if ($bt !== '' && $bt !== $token) {
            foreach (Db::rows('SELECT token, check_json FROM mock_mockups WHERE owner_user_id = ? AND (token = ? OR base_token = ?) AND token <> ? AND check_json IS NOT NULL ORDER BY checked_at LIMIT 12', [$uid, $bt, $bt, $token]) as $row) {
                $cr = json_decode((string) $row['check_json'], true);
                if (!is_array($cr)) {
                    continue;
                }
                if ($row['token'] === $bt) {
                    if (isset($cr['frame']['left'], $cr['frame']['right'])) {
                        $peers[] = ['frame' => ['left' => $cr['frame']['left'], 'right' => $cr['frame']['right']]];
                    }
                } elseif (is_array($cr['design']['shell'] ?? null)) {
                    $peers[] = ['shell' => $cr['design']['shell']];
                }
            }
        }
        $m = Db::row('SELECT * FROM mock_mockups WHERE id = ?', [$id]);
        Response::json($mockupPub($m) + ['html' => $html, 'peers' => $peers], $own === null ? 201 : 200);
    }, ['auth' => true]);

    $r->post('/mock/mockups/{token}/check', static function (array $p, Actor $a) use ($tokenOf, $galleryStore): void {
        $u = Auth::requireUser($a);
        $token = $tokenOf($p['token']);
        $m = Db::row('SELECT * FROM mock_mockups WHERE token = ? AND deleted_at IS NULL', [$token]);
        if ($m === null) {
            throw HttpError::notFound('시안');
        }
        if ((int) $m['owner_user_id'] !== (int) $u['id']) {
            throw HttpError::forbidden('다른 계정이 만든 시안의 판정은 기록할 수 없습니다.');   // O-32
        }
        $b = Response::input();
        $score = max(0, min(100, (int) ($b['score'] ?? 0)));
        $pass = !empty($b['pass']) ? 1 : 0;
        // 판정은 powerMCP 서버(헤드리스 브라우저)만 기록한다 — 사용자가 같은 키로 점수·통과를 직접 보내 게시하는 것을 막는다(2026-10-10 판정 B MCK-007).
        // 서명 = HMAC-SHA256(공유 비밀, "token|score|pass"), 비밀은 config mock.judge_secret(없으면 worker.key) = powerMCP 의 PP_JUDGE_SECRET.
        $secret = (string) (Config::get('mock.judge_secret', '') ?: Config::get('worker.key', ''));
        $sig = (string) ($_SERVER['HTTP_X_PP_JUDGE'] ?? '');
        if ($secret === '') {
            // R11·MC-34: 비밀이 비면 모든 판정이 거부된다 — 조용히 넘기지 말고 서버 로그에 남긴다.
            error_log('[mock] 판정 서명 비밀(mock.judge_secret·worker.key)이 비어 판정 기록을 거부함');
        }
        if ($secret === '' || $sig === '' || !hash_equals(hash_hmac('sha256', $token . '|' . $score . '|' . $pass, $secret), $sig)) {
            throw new HttpError('JUDGE_REQUIRED', '판정은 powerMCP 의 mock_check_mockup 으로만 기록됩니다.', 403, 'AI 도구에서 mock_check_mockup 을 불러 주세요.');
        }
        $res = is_array($b['result'] ?? null) ? $b['result'] : [];
        $refId = mb_substr(trim((string) ($b['ref_id'] ?? '')), 0, 255);
        // 어떤 페이지인지(레퍼런스 화면의 page_type) — 게시본끼리 링크에 쓴다
        $page = (string) preg_replace('/[^a-z_]/', '', (string) ($b['page'] ?? ''));
        Db::exec('UPDATE mock_mockups SET score = ?, passed = ?, check_count = check_count + 1, check_json = ?, ref_id = IF(? = \'\', ref_id, ?), page = IF(? = \'\', page, ?), checked_at = NOW(3) WHERE id = ?',
            [$score, $pass, json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $refId, $refId, $page, $page, (int) $m['id']]);
        $m = Db::row('SELECT * FROM mock_mockups WHERE id = ?', [(int) $m['id']]);
        $galleryStore($m, $score, isset($b['thumb']) ? (string) $b['thumb'] : null, (string) ($b['device'] ?? $m['device']), $pass === 1);
        // 개선 체크리스트 누적 — 실패해도 판정 기록은 막지 않는다
        try {
            \Pp\Mock\Checklist::fromJudge($res, $token, $refId !== '' ? $refId : null, $score);
        } catch (\Throwable $e) {
            error_log('[pp-checklist] ' . $e->getMessage());
        }
        // 되먹임 — 다른 시안들에서 반복된 결함(powerMCP 가 판정 결과에 recurring 으로 싣는다)
        try {
            $lessons = \Pp\Mock\Checklist::lessons();
        } catch (\Throwable $e) {
            $lessons = [];
            error_log('[pp-checklist] ' . $e->getMessage());
        }
        Response::json(['token' => $token, 'score' => $score, 'passed' => (bool) $pass, 'kept' => $pass === 1 && $score > MOCK_GALLERY_CUT, 'lessons' => $lessons]);
    }, ['auth' => true]);

    $r->get('/mock/mockups', static function (array $p, Actor $a) use ($mockupPub): void {
        $u = Auth::requireUser($a);
        [$page, $limit, $offset] = Response::paging(30, 100);
        $owners = array_merge([(int) $u['id']], \Pp\Core\TestLogin::mirrorIds((int) $u['id']));   // 테스트 계정 거울(읽기 전용)
        $where = 'm.owner_user_id IN (' . implode(',', array_fill(0, count($owners), '?')) . ') AND m.deleted_at IS NULL AND m.discarded_at IS NULL AND m.passed = 1';   // 통과한 시안만 목록에(미통과·미판정은 다시 판정할 하루만 두고 지운다)
        $args = $owners;
        $total = (int) Db::val("SELECT COUNT(*) FROM mock_mockups m WHERE {$where}", $args);
        $rows = Db::rows("SELECT m.*, g.id AS g_id, g.status AS g_status, g.likes AS g_likes, g.unlocks AS g_unlocks FROM mock_mockups m LEFT JOIN mock_gallery g ON g.mockup_id = m.id WHERE {$where} ORDER BY m.created_at DESC LIMIT {$limit} OFFSET {$offset}", $args);
        $items = array_map(static fn ($m) => $mockupPub($m, $m['g_id'] ? ['id' => $m['g_id'], 'status' => $m['g_status'], 'likes' => $m['g_likes'], 'unlocks' => $m['g_unlocks']] : null), $rows);
        Response::list($items, $total, $page, $limit, ['cut' => MOCK_GALLERY_CUT, 'points' => Points::balance((int) $u['id'])]);
    }, ['auth' => true]);

    $r->get('/mock/mockups/{token}/thumb', static function (array $p, Actor $a) use ($tokenOf, $galleryDir): void {
        $m = Db::row('SELECT m.*, g.id AS g_id, g.status AS g_status FROM mock_mockups m LEFT JOIN mock_gallery g ON g.mockup_id = m.id WHERE m.token = ? AND m.deleted_at IS NULL', [$tokenOf($p['token'])]);
        if ($m === null || !$m['g_id']) {
            throw HttpError::notFound('썸네일');
        }
        if ($m['g_status'] !== 'shared') {
            Access::assert($a, $m, 'view');
        }
        $f = $galleryDir() . '/' . (int) $m['g_id'] . '.jpg';
        if (!is_file($f)) {
            throw HttpError::notFound('썸네일');
        }
        header('Content-Type: image/jpeg');
        header('Cache-Control: ' . ($m['g_status'] === 'shared' ? 'public' : 'private') . ', max-age=86400');
        readfile($f);
        exit;
    });

    $r->get('/mock/mockups/{token}', static function (array $p, Actor $a) use ($tokenOf, $mockupPub): void {
        $u = Auth::requireUser($a);
        $m = Db::row('SELECT m.*, g.id AS g_id, g.status AS g_status, g.likes AS g_likes, g.unlocks AS g_unlocks FROM mock_mockups m LEFT JOIN mock_gallery g ON g.mockup_id = m.id WHERE m.token = ? AND m.deleted_at IS NULL', [$tokenOf($p['token'])]);
        if ($m === null) {
            throw HttpError::notFound('시안');
        }
        Access::assert($a, $m, 'view');
        $out = $mockupPub($m, $m['g_id'] ? ['id' => $m['g_id'], 'status' => $m['g_status'], 'likes' => $m['g_likes'], 'unlocks' => $m['g_unlocks']] : null);
        $out['check'] = $m['check_json'] !== null ? json_decode((string) $m['check_json'], true) : null;
        // 이 시안 판정에 걸린 체크리스트 항목(짧게) — 표가 없거나 실패해도 응답은 그대로
        $out['checklist'] = [];
        if (is_array($out['check'])) {
            try {
                $slugs = array_keys(\Pp\Mock\Checklist::slugsOf($out['check']));
                if ($slugs) {
                    $ph = implode(',', array_fill(0, count($slugs), '?'));
                    foreach (Db::rows("SELECT id, title, area, status, hits, regressed FROM mock_checklist WHERE slug IN ({$ph}) ORDER BY regressed DESC, hits DESC LIMIT 12", $slugs) as $c) {
                        $out['checklist'][] = [
                            'id' => (int) $c['id'], 'title' => $c['title'], 'area_name' => \Pp\Mock\Checklist::AREAS[$c['area']] ?? $c['area'],
                            'status' => $c['status'], 'hits' => (int) $c['hits'], 'regressed' => (bool) $c['regressed'],
                        ];
                    }
                }
            } catch (\Throwable $e) {
                error_log('[pp-checklist] ' . $e->getMessage());
            }
        }
        $out['preview_url'] = '/api/v1/mock/mockups/' . $m['token'] . '/html';
        Response::json($out);
    }, ['auth' => true]);

    // 내 시안 미리보기(게시 전) — 게시 화면과 같은 sandbox
    $r->get('/mock/mockups/{token}/html', static function (array $p, Actor $a) use ($tokenOf): void {
        $m = Db::row('SELECT * FROM mock_mockups WHERE token = ? AND deleted_at IS NULL', [$tokenOf($p['token'])]);
        if ($m === null) {
            throw HttpError::notFound('시안');
        }
        Access::assert($a, $m, 'view');
        header('X-Robots-Tag: noindex, nofollow, noarchive');
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: private, no-store');
        header("Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals; form-action 'none'");
        header('X-AI-Generated: true'); // LEGAL-003: AI 생성 산출물 표시
        echo \Pp\Mock\FrameHeight::inject((string) $m['html']);
        exit;
    });

    $r->delete('/mock/mockups/{token}', static function (array $p, Actor $a) use ($tokenOf): void {
        $m = Db::row('SELECT * FROM mock_mockups WHERE token = ? AND deleted_at IS NULL', [$tokenOf($p['token'])]);
        if ($m === null) {
            throw HttpError::notFound('시안');
        }
        Access::assert($a, $m, 'delete');
        Db::exec('UPDATE mock_mockups SET deleted_at = NOW(3), published_at = NULL, visibility = \'private\' WHERE id = ?', [(int) $m['id']]);
        Db::exec('UPDATE mock_gallery SET status = \'hidden\' WHERE mockup_id = ?', [(int) $m['id']]);
        Audit::log($a, 'mock.delete', 'mockup:' . $m['public_id']);
        Response::noContent();
    }, ['auth' => true]);

    // 게시된 시안 — powerplus.hom2box.com/p/{token} (Apache 가 /api/v1/p 로 넘긴다)
    $r->get('/p/{token}', static function (array $p) use ($tokenOf): void {
        $token = $tokenOf($p['token']);
        $row = $token === '' ? null : Db::row('SELECT id, token, base_token, owner_user_id, html, published_at FROM mock_mockups WHERE token = ? AND deleted_at IS NULL AND expires_at > NOW(3)', [$token]);
        header('X-Robots-Tag: noindex, nofollow, noarchive');
        header('Referrer-Policy: no-referrer');
        if ($row === null || $row['published_at'] === null) {
            http_response_code(404);
            header('Content-Type: text/html; charset=utf-8');
            header('Cache-Control: no-store');
            $msg = $row === null ? '시안 주소가 만료됐거나 없습니다. 시안 주소는 만든 뒤 30일 동안 열립니다.' : '아직 판정을 통과하지 못한 시안입니다. 통과해서 게시하면 이 주소에서 열립니다.';
            echo '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>시안을 볼 수 없습니다</title><p style="font:16px/1.6 sans-serif;padding:48px">' . $msg . '</p>';
            exit;
        }
        Db::exec('UPDATE mock_mockups SET views = views + 1 WHERE id = ?', [(int) $row['id']]);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: private, max-age=30');
        header("Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals; form-action 'none'");
        header('X-AI-Generated: true'); // LEGAL-003: AI 생성 산출물 표시
        // 샘플 원본 주소는 웹 사본으로 — 예전 묶음(url_template …/original)으로 만든 시안도 가볍게 연다
        $html = (string) preg_replace('#(/api/v1/assets/samples/[a-z0-9]{8,32})/original\b#', '$1/web', (string) $row['html']);
        // 게시본끼리 링크: 같은 묶음(메인 + 그 메인을 기준으로 만든 서브)에서 main.html·greeting.html 같은 파일 이름을 게시 주소로
        // (2026-10-15 시험: 메뉴의 greeting.html 이 /api/v1/p/greeting.html 404 — 메인에서 서브로 못 넘어감)
        $root = (string) ($row['base_token'] ?: $row['token']);
        $sib = Db::rows('SELECT token, base_token, page FROM mock_mockups WHERE owner_user_id = ? AND (token = ? OR base_token = ?) AND deleted_at IS NULL AND published_at IS NOT NULL AND expires_at > NOW(3) ORDER BY checked_at DESC', [(int) $row['owner_user_id'], $root, $root]);
        $map = [];
        foreach ($sib as $s) {
            $pg = $s['token'] === $root ? 'main' : (string) ($s['page'] ?? '');
            if ($pg !== '' && !isset($map[$pg])) {
                $map[$pg] = '/api/v1/p/' . $s['token'];
            }
        }
        if (isset($map['main'])) {
            $map['index'] = $map['main'];
        }
        if ($map) {
            $html = (string) preg_replace_callback('/\bhref="(?:\.\/)?([a-z_]+)\.html(#[^"]*)?"/', static fn (array $mm) => isset($map[$mm[1]]) ? 'href="' . $map[$mm[1]] . ($mm[2] ?? '') . '"' : $mm[0], $html);
        }
        echo \Pp\Mock\FrameHeight::inject($html);
        exit;
    });

    // ---------------------------------------------------------------- 갤러리·포인트
    $gItem = static function (int $id): array {
        $g = Db::row('SELECT g.*, m.token, m.public_id AS mockup_public_id, m.base_token AS m_base, m.page AS m_page, u.name AS owner_name, u.avatar_url AS owner_avatar FROM mock_gallery g JOIN mock_mockups m ON m.id = g.mockup_id LEFT JOIN core_users u ON u.id = g.owner_user_id WHERE g.id = ?', [$id]);
        if ($g === null) {
            throw HttpError::notFound('시안');
        }
        return $g;
    };
    $gCanSee = static fn (array $g, Actor $a): bool => $g['status'] === 'shared' || $a->isAdmin() || ($a->id() !== null && (int) $g['owner_user_id'] === $a->id());
    $gUnlocked = static function (array $g, Actor $a): bool {
        if ($a->id() === null) {
            return false;
        }
        if ($a->isAdmin() || (int) $g['owner_user_id'] === $a->id()) {
            return true;
        }
        return Db::row('SELECT 1 AS x FROM mock_gallery_unlocks WHERE gallery_id = ? AND user_id = ?', [(int) $g['id'], $a->id()]) !== null;
    };
    $badge = static fn (int $shared): ?array => $shared >= 15 ? ['id' => 'master', 'name' => '명장'] : ($shared >= 5 ? ['id' => 'expert', 'name' => '장인'] : ($shared >= 1 ? ['id' => 'sprout', 'name' => '새싹'] : null));
    // 세트 = 메인 + 그 메인을 기준(base_token)으로 만든 서브. 세트 열쇠는 메인 token(사용자 2026-10-15 "같은 이름 셋트로 만든거면 셋트로 다같이")
    $gSub = "(COALESCE(g.ref_id, '') NOT LIKE 'mix1:%' AND (COALESCE(m.base_token, '') <> '' OR COALESCE(m.page, '') NOT IN ('', 'main')))";
    $gCard = static function (array $g, Actor $a, array $sharedBy, array $liked, array $unlocked, array $setSize = []) use ($badge): array {
        $mine = $a->id() !== null && (int) $g['owner_user_id'] === $a->id();
        $ref = (string) ($g['ref_id'] ?? '');
        $base = (string) ($g['m_base'] ?? '');
        $pg = (string) ($g['m_page'] ?? '');
        $isSub = !str_starts_with($ref, 'mix1:') && ($base !== '' || ($pg !== '' && $pg !== 'main'));
        $set = $base !== '' ? $base : (string) ($g['token'] ?? '');
        return [
            'id' => (int) $g['id'], 'title' => (string) $g['title'] ?: '제목 없는 시안', 'score' => (int) $g['score'], 'device' => $g['device'],
            'kind' => str_starts_with($ref, 'mix1:') ? 'mix' : (str_starts_with($ref, 'wire1:') ? 'wire' : 'single'), // wire = 사용자 와이어로 만든 시안(2026-10-18)
            'role' => $isSub ? 'sub' : 'main', 'page' => $isSub ? ($pg !== '' && $pg !== 'main' ? $pg : null) : 'main',
            'set' => $set, 'set_size' => (int) ($setSize[$set] ?? 1),
            'thumb_url' => '/api/v1/mock/gallery/' . $g['id'] . '/thumb?v=' . strtotime((string) $g['updated_at']),
            'status' => $g['status'], 'likes' => (int) $g['likes'], 'views' => (int) $g['views'], 'unlocks' => (int) $g['unlocks'], 'note' => $g['note'],
            'owner' => ['name' => trim((string) ($g['owner_name'] ?? '')) ?: '회원', 'avatar' => $g['owner_avatar'] ?: null, 'badge' => $badge((int) ($sharedBy[(int) $g['owner_user_id']] ?? 0))],
            'mine' => $mine, 'liked' => isset($liked[(int) $g['id']]), 'unlocked' => $mine || $a->isAdmin() || isset($unlocked[(int) $g['id']]),
            'created_at' => $g['created_at'], 'shared_at' => $g['shared_at'],
        ];
    };

    $r->get('/mock/gallery', static function (array $p, Actor $a) use ($gCard, $gSub): void {
        $view = ($_GET['view'] ?? 'shared') === 'mine' ? 'mine' : 'shared';
        if ($view === 'mine' && $a->id() === null) {
            throw HttpError::unauthorized('로그인하면 내가 만든 시안을 볼 수 있습니다.');
        }
        // 기본 = 최신순(사용자 2026-10-18 "갤러리 정렬은 기본값 최신순으로") — 인기순은 sort=popular 일 때만
        $order = match ((string) ($_GET['sort'] ?? 'new')) {
            'popular' => '(g.likes * 3 + g.unlocks * 2 + g.views / 10) DESC, g.id DESC',
            'score' => 'g.score DESC, g.id DESC',
            default => 'COALESCE(g.shared_at, g.created_at) DESC, g.id DESC',
        };
        [$page, $limit, $offset] = Response::paging(24, 60);
        $owners = array_merge([(int) $a->id()], \Pp\Core\TestLogin::mirrorIds($a->id()));   // 테스트 계정 거울(읽기 전용)
        [$where, $args] = $view === 'mine'
            ? ['g.owner_user_id IN (' . implode(',', array_fill(0, count($owners), '?')) . ") AND g.status <> 'hidden'", $owners]
            : ["g.status = 'shared'", []];
        if ($view === 'mine' && $a->isAdmin() && ($_GET['all'] ?? '') === '1') {
            [$where, $args] = ['1 = 1', []];
        }
        // 세트 크기는 보이는 범위(공유·내 것) 안에서 센다 — 구분·세트 거르기 전 조건
        [$seeWhere, $seeArgs] = [$where, $args];
        $type = (string) ($_GET['type'] ?? '');
        if ($type === 'main' || $type === 'sub') {
            $where .= $type === 'sub' ? " AND {$gSub}" : " AND NOT {$gSub}";
        }
        $set = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($_GET['set'] ?? ''));
        if ($set !== '') {
            $where .= ' AND (m.token = ? OR m.base_token = ?)';
            $args = array_merge($args, [$set, $set]);
            $order = "(m.token = '{$set}') DESC, m.created_at ASC, g.id ASC";   // 메인 먼저, 서브는 만든 순서
        }
        $from = 'mock_gallery g JOIN mock_mockups m ON m.id = g.mockup_id';
        $rows = Db::rows("SELECT g.*, m.token, m.base_token AS m_base, m.page AS m_page, u.name AS owner_name, u.avatar_url AS owner_avatar FROM {$from} LEFT JOIN core_users u ON u.id = g.owner_user_id WHERE {$where} ORDER BY {$order} LIMIT {$limit} OFFSET {$offset}", $args);
        $total = (int) Db::val("SELECT COUNT(*) FROM {$from} WHERE {$where}", $args);
        $setSize = [];
        $keys = array_values(array_unique(array_map(static fn ($x) => (string) ($x['m_base'] ?: $x['token']), $rows)));
        if ($keys) {
            $in = implode(',', array_fill(0, count($keys), '?'));
            foreach (Db::rows("SELECT COALESCE(NULLIF(m.base_token, ''), m.token) AS k, COUNT(*) AS n FROM {$from} WHERE {$seeWhere} AND (m.token IN ({$in}) OR m.base_token IN ({$in})) GROUP BY k", array_merge($seeArgs, $keys, $keys)) as $s) {
                $setSize[(string) $s['k']] = (int) $s['n'];
            }
        }
        $sharedBy = [];
        foreach (Db::rows("SELECT owner_user_id, COUNT(*) AS n FROM mock_gallery WHERE status = 'shared' AND owner_user_id IS NOT NULL GROUP BY owner_user_id") as $s) {
            $sharedBy[(int) $s['owner_user_id']] = (int) $s['n'];
        }
        $liked = [];
        $unlocked = [];
        if ($a->id() !== null && $rows) {
            $ids = implode(',', array_map(static fn ($x) => (int) $x['id'], $rows));
            foreach (Db::rows("SELECT gallery_id FROM mock_gallery_likes WHERE user_id = ? AND gallery_id IN ({$ids})", [$a->id()]) as $x) {
                $liked[(int) $x['gallery_id']] = true;
            }
            foreach (Db::rows("SELECT gallery_id FROM mock_gallery_unlocks WHERE user_id = ? AND gallery_id IN ({$ids})", [$a->id()]) as $x) {
                $unlocked[(int) $x['gallery_id']] = true;
            }
        }
        Response::list(array_map(static fn ($g) => $gCard($g, $a, $sharedBy, $liked, $unlocked, $setSize), $rows), $total, $page, $limit, [
            'points' => $a->id() === null ? null : Points::balance($a->id()), 'unlock_cost' => Points::cost('use_mockup_open'), 'cut' => MOCK_GALLERY_CUT,
        ]);
    });

    $r->get('/mock/gallery/leaders', static function () use ($badge): void {
        $rows = Db::rows("SELECT l.user_id, SUM(l.delta) AS pts, u.name, u.avatar_url FROM core_point_ledger l JOIN core_users u ON u.id = l.user_id
                           WHERE l.delta > 0 AND l.created_at >= NOW(3) - INTERVAL 30 DAY GROUP BY l.user_id ORDER BY pts DESC LIMIT 10");
        $shared = [];
        foreach (Db::rows("SELECT owner_user_id, COUNT(*) AS n FROM mock_gallery WHERE status = 'shared' AND owner_user_id IS NOT NULL GROUP BY owner_user_id") as $s) {
            $shared[(int) $s['owner_user_id']] = (int) $s['n'];
        }
        Response::json(['items' => array_map(static fn ($x) => ['name' => trim((string) $x['name']) ?: '회원', 'avatar' => $x['avatar_url'] ?: null, 'points' => (int) $x['pts'], 'shared' => $shared[(int) $x['user_id']] ?? 0, 'badge' => $badge($shared[(int) $x['user_id']] ?? 0)], $rows)], 200, [], true);
    });

    $r->get('/mock/gallery/{id}/thumb', static function (array $p, Actor $a) use ($gItem, $gCanSee, $galleryDir): void {
        $g = $gItem((int) $p['id']);
        if (!$gCanSee($g, $a)) {
            throw HttpError::notFound('시안');
        }
        $f = $galleryDir() . '/' . (int) $g['id'] . '.jpg';
        if (!is_file($f)) {
            throw HttpError::notFound('썸네일');
        }
        header('Content-Type: image/jpeg');
        header('Cache-Control: ' . ($g['status'] === 'shared' ? 'public' : 'private') . ', max-age=86400');
        readfile($f);
        exit;
    });

    $r->get('/mock/gallery/{id}/html', static function (array $p, Actor $a) use ($gItem, $gCanSee, $gUnlocked): void {
        $g = $gItem((int) $p['id']);
        // 공유가 내려간 시안은 열람권이 있어도 열지 않는다 — 주인·관리자만(leak-audit 2026-10-06)
        if (!$gCanSee($g, $a)) {
            throw HttpError::notFound('시안');
        }
        if (!$gUnlocked($g, $a)) {
            throw HttpError::paymentRequired('포인트로 열어야 볼 수 있습니다.');
        }
        header('X-Robots-Tag: noindex, nofollow, noarchive');
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: private, no-store');
        header("Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals; form-action 'none'");
        header('X-AI-Generated: true'); // LEGAL-003: AI 생성 산출물 표시
        echo \Pp\Mock\FrameHeight::inject((string) $g['html']);
        exit;
    });

    $r->get('/mock/gallery/{id}', static function (array $p, Actor $a) use ($gItem, $gCanSee, $gUnlocked, $gCard): void {
        $g = $gItem((int) $p['id']);
        if (!$gCanSee($g, $a)) {
            throw HttpError::notFound('시안');
        }
        $open = $gUnlocked($g, $a);
        $sharedN = (int) Db::val("SELECT COUNT(*) FROM mock_gallery WHERE status = 'shared' AND owner_user_id = ?", [(int) $g['owner_user_id']]);
        $liked = $a->id() !== null && Db::row('SELECT 1 AS x FROM mock_gallery_likes WHERE gallery_id = ? AND user_id = ?', [(int) $g['id'], $a->id()]) ? [(int) $g['id'] => true] : [];
        $card = $gCard($g, $a, [(int) $g['owner_user_id'] => $sharedN], $liked, $open ? [(int) $g['id'] => true] : []);
        $notes = null;
        if ($open) {
            Db::exec('UPDATE mock_gallery SET views = views + 1 WHERE id = ?', [(int) $g['id']]);
            $res = json_decode((string) ($g['check_json'] ?? ''), true);
            if (is_array($res)) {
                $notes = [
                    'summary' => (string) ($res['summary'] ?? ''), 'height' => $res['height'] ?? null, 'similarity' => $res['similarity'] ?? null, 'sources' => $res['sources'] ?? null,
                    'frame' => isset($res['frame']) ? ['left' => $res['frame']['left'] ?? null, 'right' => $res['frame']['right'] ?? null, 'gap' => $res['frame']['gap'] ?? null, 'row_gap' => $res['frame']['row_gap'] ?? null] : null,
                    'fixes' => array_slice(array_map(static fn ($f) => is_array($f) ? (string) ($f['message'] ?? json_encode($f, JSON_UNESCAPED_UNICODE)) : (string) $f, (array) ($res['fixes'] ?? [])), 0, 12),
                    // 판정 노트(감점 없는 참고 사항) — fixes 만 보여 주던 것(2026-10-09 시험)
                    'notes' => array_slice(array_values(array_filter(array_map(static fn ($n) => is_array($n) ? (string) ($n['message'] ?? json_encode($n, JSON_UNESCAPED_UNICODE)) : (string) $n, (array) ($res['notes'] ?? [])), static fn (string $s) => $s !== '')), 0, 12),
                ];
            }
        }
        Response::json(['item' => $card, 'notes' => $notes, 'html_url' => $open ? '/api/v1/mock/gallery/' . $g['id'] . '/html' : null, 'points' => $a->id() === null ? null : Points::balance($a->id()), 'unlock_cost' => Points::cost('use_mockup_open')]);
    });

    $r->post('/mock/gallery/{id}/unlock', static function (array $p, Actor $a) use ($gItem, $gUnlocked): void {
        $u = Auth::requireUser($a);
        $g = $gItem((int) $p['id']);
        if ($g['status'] !== 'shared') {
            throw HttpError::notFound('공유된 시안');
        }
        $uid = (int) $u['id'];
        if ($gUnlocked($g, $a)) {
            Response::json(['ok' => true, 'points' => Points::balance($uid)]);
        }
        if (!Points::spend($uid, 'use_mockup_open', 'gallery', (string) $g['id'])) {
            Response::error('NOT_ENOUGH_POINTS', '포인트가 모자랍니다.', 402, '시안을 만들어 공유하거나 커뮤니티에 글을 쓰면 포인트가 쌓입니다.');
        }
        if (Db::exec('INSERT IGNORE INTO mock_gallery_unlocks (gallery_id, user_id) VALUES (?, ?)', [(int) $g['id'], $uid]) > 0) {
            Db::exec('UPDATE mock_gallery SET unlocks = unlocks + 1 WHERE id = ?', [(int) $g['id']]);
            $owner = (int) $g['owner_user_id'];
            if ($owner > 0 && $owner !== $uid) {
                Points::award($owner, 'mockup_royalty', 'gallery', $g['id'] . ':' . $uid);
                Notify::send($owner, 'like', (trim((string) ($u['name'] ?? '')) ?: '회원') . ' 님이 내 시안을 열어 봤습니다 — ' . ((string) $g['title'] ?: '시안'), '/mock/mockups?gallery=' . $g['id'], $uid);
            }
        }
        Response::json(['ok' => true, 'points' => Points::balance($uid)]);
    }, ['auth' => true]);

    $r->post('/mock/gallery/{id}/like', static function (array $p, Actor $a) use ($gItem): void {
        $u = Auth::requireUser($a);
        $g = $gItem((int) $p['id']);
        if ($g['status'] !== 'shared') {
            throw HttpError::notFound('공유된 시안');
        }
        $uid = (int) $u['id'];
        $had = Db::row('SELECT 1 AS x FROM mock_gallery_likes WHERE gallery_id = ? AND user_id = ?', [(int) $g['id'], $uid]) !== null;
        if ($had) {
            Db::exec('DELETE FROM mock_gallery_likes WHERE gallery_id = ? AND user_id = ?', [(int) $g['id'], $uid]);
        } else {
            Db::exec('INSERT IGNORE INTO mock_gallery_likes (gallery_id, user_id) VALUES (?, ?)', [(int) $g['id'], $uid]);
            $owner = (int) $g['owner_user_id'];
            if ($owner > 0 && $owner !== $uid && Points::award($owner, 'like_received', 'gallery', $g['id'] . ':' . $uid)) {
                Notify::send($owner, 'like', (trim((string) ($u['name'] ?? '')) ?: '회원') . ' 님이 내 시안을 좋아합니다 — ' . ((string) $g['title'] ?: '시안'), '/mock/mockups?gallery=' . $g['id'], $uid);
            }
        }
        $n = (int) Db::val('SELECT COUNT(*) FROM mock_gallery_likes WHERE gallery_id = ?', [(int) $g['id']]);
        Db::exec('UPDATE mock_gallery SET likes = ? WHERE id = ?', [$n, (int) $g['id']]);
        Response::json(['liked' => !$had, 'likes' => $n]);
    }, ['auth' => true]);

    $r->post('/mock/gallery/{id}/share', static function (array $p, Actor $a) use ($gItem): void {
        $u = Auth::requireUser($a);
        $g = $gItem((int) $p['id']);
        if ((int) $g['owner_user_id'] !== (int) $u['id'] && !$a->isAdmin()) {
            throw HttpError::forbidden('내가 만든 시안만 공유할 수 있습니다.');
        }
        $b = Response::input();
        $title = trim((string) ($b['title'] ?? ''));
        $note = trim((string) ($b['note'] ?? ''));
        if ($title !== '' && (mb_strlen($title) < 2 || mb_strlen($title) > 120)) {
            throw HttpError::invalid('제목은 2~120자로 써 주세요.');
        }
        if (mb_strlen($note) > 1000) {
            throw HttpError::invalid('설명은 1,000자까지 쓸 수 있습니다.');
        }
        Db::exec("UPDATE mock_gallery SET status = 'shared', shared_at = COALESCE(shared_at, NOW(3)), title = IF(? = '', title, ?), note = IF(? = '', note, ?) WHERE id = ?", [$title, $title, $note, $note, (int) $g['id']]);
        $got = (int) $g['owner_user_id'] > 0 && Points::award((int) $g['owner_user_id'], 'mockup_share', 'gallery', (string) $g['id']);
        Audit::log($a, 'mock.gallery.share', 'gallery:' . $g['id']);
        Response::json(['ok' => true, 'awarded' => $got ? Points::cost('mockup_share') : 0, 'points' => Points::balance((int) $u['id'])]);
    }, ['auth' => true]);

    $r->post('/mock/gallery/{id}/hide', static function (array $p, Actor $a) use ($gItem): void {
        $u = Auth::requireUser($a);
        $g = $gItem((int) $p['id']);
        if ((int) $g['owner_user_id'] !== (int) $u['id'] && !$a->isAdmin()) {
            throw HttpError::forbidden('내가 만든 시안만 내릴 수 있습니다.');
        }
        Db::exec("UPDATE mock_gallery SET status = 'study' WHERE id = ?", [(int) $g['id']]);
        Response::json(['ok' => true]);
    }, ['auth' => true]);

    $r->get('/mock/points', static function (array $p, Actor $a): void {
        $u = Auth::requireUser($a);
        $uid = (int) $u['id'];
        $rows = Db::rows('SELECT delta, reason, ref_type, ref_id, created_at FROM core_point_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50', [$uid]);
        $rules = Db::rows('SELECT reason, delta, daily_cap, yearly_cap, note FROM core_point_rules WHERE enabled = 1 ORDER BY delta DESC');
        $names = [];
        foreach ($rules as $x) {
            $names[$x['reason']] = (string) $x['note'];
        }
        Response::json([
            'points' => Points::balance($uid),
            'ledger' => array_map(static fn ($x) => ['delta' => (int) $x['delta'], 'reason' => $x['reason'], 'name' => $names[$x['reason']] ?? $x['reason'], 'created_at' => $x['created_at']], $rows),
            'rules' => array_map(static fn ($x) => ['reason' => $x['reason'], 'points' => (int) $x['delta'], 'name' => (string) $x['note'], 'daily_cap' => $x['daily_cap'] === null ? null : (int) $x['daily_cap']], $rules),
            'unlock_cost' => Points::cost('use_mockup_open'), 'cut' => MOCK_GALLERY_CUT,
        ]);
    }, ['auth' => true]);

    // ============================ 개선 체크리스트(관리자·큐레이터) ============================
    // 출처: homebox-handoff api/routes/checklist.php — 조회·추가(시험 보고)·상태 변경. 세션 로그인만(API 키 불가), 쓰기는 Audit.
    //   GET  /admin/mock/checklist?status=open|fixing|fixed|watch|wontfix|regressed|all&area=&origin=&q=&sort=hits|recent
    //   GET  /admin/mock/checklist/{id}
    //   POST /admin/mock/checklist            {slug?, area, title, detail?, origin?, evidence?}
    //   POST /admin/mock/checklist/{id}       {status?, fix_note?, fix_commit?, title?, detail?, area?}
    $needCur = static function (Actor $a): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole('curator')) {
            throw HttpError::forbidden();
        }
    };
    $clRow = static function (int $id): array {
        $row = Db::row('SELECT * FROM mock_checklist WHERE id = ?', [$id]);
        if ($row === null) {
            throw HttpError::notFound('체크리스트 항목');
        }
        return $row;
    };

    $r->get('/admin/mock/checklist', static function (array $p, Actor $a) use ($needCur): void {
        $needCur($a);
        $where = ['1 = 1'];
        $args = [];
        $st = (string) ($_GET['status'] ?? 'open');
        if ($st === 'open') {
            $where[] = "status IN ('open','fixing')";
        } elseif ($st === 'regressed') {
            $where[] = 'regressed = 1';
        } elseif (in_array($st, \Pp\Mock\Checklist::STATUSES, true)) {
            $where[] = 'status = ?';
            $args[] = $st;
        }
        $area = (string) ($_GET['area'] ?? '');
        if (isset(\Pp\Mock\Checklist::AREAS[$area])) {
            $where[] = 'area = ?';
            $args[] = $area;
        }
        $origin = (string) ($_GET['origin'] ?? '');
        if (in_array($origin, \Pp\Mock\Checklist::ORIGINS, true)) {
            $where[] = 'origin = ?';
            $args[] = $origin;
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $lk = '%' . addcslashes($q, '%_\\') . '%';
            $where[] = '(title LIKE ? OR detail LIKE ? OR slug LIKE ?)';
            array_push($args, $lk, $lk, $lk);
        }
        $order = ($_GET['sort'] ?? 'hits') === 'recent' ? 'last_seen DESC' : 'regressed DESC, hits DESC, last_seen DESC';
        $w = implode(' AND ', $where);
        $rows = Db::rows("SELECT * FROM mock_checklist WHERE {$w} ORDER BY {$order} LIMIT 300", $args);
        $counts = [];
        foreach (Db::rows('SELECT status, COUNT(*) AS n, SUM(hits) AS h FROM mock_checklist GROUP BY status') as $c) {
            $counts[$c['status']] = ['n' => (int) $c['n'], 'hits' => (int) $c['h']];
        }
        $counts['regressed'] = ['n' => (int) Db::val('SELECT COUNT(*) FROM mock_checklist WHERE regressed = 1'), 'hits' => 0];
        $areas = [];
        foreach (Db::rows("SELECT area, COUNT(*) AS n FROM mock_checklist WHERE status IN ('open','fixing') GROUP BY area") as $c) {
            $areas[$c['area']] = (int) $c['n'];
        }
        Response::json(array_map(static fn ($x) => \Pp\Mock\Checklist::pub($x, false), $rows), 200, ['meta' => [
            'counts' => $counts, 'open_by_area' => $areas,
            'areas' => array_map(static fn ($k, $v) => ['id' => $k, 'name' => $v], array_keys(\Pp\Mock\Checklist::AREAS), \Pp\Mock\Checklist::AREAS),
        ]]);
    });

    $r->get('/admin/mock/checklist/{id}', static function (array $p, Actor $a) use ($needCur, $clRow): void {
        $needCur($a);
        $x = \Pp\Mock\Checklist::pub($clRow((int) $p['id']));
        // 근거의 시안 token → 관리자 미리보기 주소(남은 시안만)
        $tokens = array_values(array_unique(array_filter(array_map(static fn ($e) => is_array($e) ? (string) ($e['token'] ?? '') : '', $x['evidence']))));
        $alive = [];
        if ($tokens) {
            $ph = implode(',', array_fill(0, count($tokens), '?'));
            foreach (Db::rows("SELECT token, public_id, title FROM mock_mockups WHERE token IN ({$ph}) AND deleted_at IS NULL", $tokens) as $m) {
                $alive[$m['token']] = ['id' => $m['public_id'], 'title' => $m['title'], 'preview_url' => '/api/v1/mock/mockups/' . $m['token'] . '/html'];
            }
        }
        foreach ($x['evidence'] as &$e) {
            if (is_array($e) && isset($e['token'], $alive[$e['token']])) {
                $e['mockup'] = $alive[$e['token']];
            }
        }
        unset($e);
        Response::json($x);
    });

    $r->post('/admin/mock/checklist', static function (array $p, Actor $a) use ($needCur): void {
        $needCur($a);
        $b = Response::input();
        $title = trim((string) ($b['title'] ?? ''));
        if ($title === '') {
            throw HttpError::invalid('제목이 필요합니다.');
        }
        $slug = trim((string) ($b['slug'] ?? '')) ?: 'manual:' . mb_substr((string) preg_replace('/\s+/u', '-', $title), 0, 100);
        $res = \Pp\Mock\Checklist::record($slug, (string) ($b['area'] ?? 'mockup'), $title, isset($b['detail']) ? (string) $b['detail'] : null,
            (string) ($b['origin'] ?? 'manual'), is_array($b['evidence'] ?? null) ? $b['evidence'] : []);
        Audit::log($a, 'mock.checklist.record', 'mock_checklist:' . $res['id'], null, ['slug' => $slug, 'created' => $res['created']]);
        Response::json($res, $res['created'] ? 201 : 200);
    });

    $r->post('/admin/mock/checklist/{id}', static function (array $p, Actor $a) use ($needCur, $clRow): void {
        $needCur($a);
        $id = (int) $p['id'];
        $before = $clRow($id);
        $b = Response::input();
        $set = [];
        $args = [];
        if (isset($b['status'])) {
            $s = (string) $b['status'];
            if (!in_array($s, \Pp\Mock\Checklist::STATUSES, true)) {
                throw HttpError::invalid('상태 값이 올바르지 않습니다.');
            }
            $set[] = 'status = ?';
            $args[] = $s;
            $set[] = $s === 'fixed' ? 'fixed_at = NOW(3), regressed = 0' : 'fixed_at = NULL';
        }
        foreach (['fix_note' => 1000, 'fix_commit' => 40, 'title' => 200, 'detail' => 4000] as $k => $max) {
            if (array_key_exists($k, $b)) {
                $v = trim((string) $b[$k]);
                if ($k === 'title' && $v === '') {
                    throw HttpError::invalid('제목은 비울 수 없습니다.');
                }
                $set[] = "{$k} = ?";
                $args[] = $v === '' ? null : mb_substr($v, 0, $max);
            }
        }
        if (isset($b['area']) && isset(\Pp\Mock\Checklist::AREAS[(string) $b['area']])) {
            $set[] = 'area = ?';
            $args[] = (string) $b['area'];
        }
        if (!$set) {
            throw HttpError::invalid('바꿀 값이 없습니다.');
        }
        $args[] = $id;
        Db::exec('UPDATE mock_checklist SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
        $after = $clRow($id);
        $pick = static fn ($x) => array_intersect_key($x, array_flip(['status', 'fix_note', 'fix_commit', 'title', 'detail', 'area', 'regressed']));
        Audit::log($a, 'mock.checklist.update', 'mock_checklist:' . $id, $pick($before), $pick($after));
        Response::json(\Pp\Mock\Checklist::pub($after));
    });
};
