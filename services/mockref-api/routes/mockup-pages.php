<?php
declare(strict_types=1);

/**
 * 시안 보관·판정 기록·미리보기 주소 (2026-10-01, 2026-10-02 개편) — MCP check_mockup · publish_mockup
 *   POST /api/internal/mockup-pages          (서버 간, X-Admin-Token)
 *        {api_key_id, mode: draft|publish, token?, html?, edits?: [{find, replace, all?}], title?, ref_id?}
 *        draft   = 시안을 초안(published=0)으로 보관하고 토큰과 적용된 HTML 을 돌려준다(check_mockup 이 렌더에 쓴다).
 *                  html 을 주면 통째로, edits 를 주면 보관된 HTML 에 찾아 바꾸기만 적용한다.
 *        publish = 토큰만 받는다. 마지막 판정이 통과(check_pass=1)일 때만 공개(published=1)한다.
 *   POST /api/internal/mockup-pages/{token}/check {api_key_id, score, pass, ref_id, result}  판정 기록
 *   GET  /api/p/{token}  공개된 시안을 그대로 보여 준다
 * 왜: claude.ai 가 같은 76KB HTML 을 판정 때 한 번, 게시 때 한 번 처음부터 다시 써서 18분이 걸렸다(2026-10-02).
 *     보관해 두고 토큰·고친 부분만 주고받으면 판정·게시가 수 초로 끝난다. 판정 결과도 서버에 남는다.
 * 보안: 보여 줄 때 CSP sandbox(allow-same-origin 없음) → 올린 스크립트는 불투명 출처라 홈박스 쿠키·세션·API 에 닿지 못한다.
 *       검색엔진 차단(X-Robots-Tag), 30일 만료, 키당 하루 60건(새 토큰 기준), 한 장 2MB.
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Auth;
use Homebox\Http\Response;

const MOCKUP_MAX_BYTES = 2 * 1024 * 1024;
const MOCKUP_DAYS = 30;
const MOCKUP_PER_DAY = 60;

/** 찾아 바꾸기 적용 — 찾는 글이 없거나(0번) 여러 번 나오면(all 이 아니면) 어느 항목인지 알려 주고 멈춘다. */
function homebox_mockup_edits(string $html, array $edits): string
{
    foreach (array_values($edits) as $i => $e) {
        if (!is_array($e)) { Response::error(400, 'BAD_EDIT', 'edits[' . $i . '] 는 {find, replace} 객체여야 합니다.'); }
        $find = (string) ($e['find'] ?? '');
        $rep = (string) ($e['replace'] ?? '');
        if ($find === '') { Response::error(400, 'BAD_EDIT', 'edits[' . $i . '].find 가 비어 있습니다.'); }
        $n = substr_count($html, $find);
        if ($n === 0) {
            Response::error(400, 'EDIT_NOT_FOUND', 'edits[' . $i . '] 의 find 를 보관된 시안에서 찾지 못했습니다(앞 항목이 이미 바꿨을 수 있습니다). 시안 원문의 글자를 공백까지 그대로 복사해 주세요: ' . mb_substr($find, 0, 80), ['index' => $i]);
        }
        if ($n > 1 && empty($e['all'])) {
            Response::error(400, 'EDIT_AMBIGUOUS', 'edits[' . $i . '] 의 find 가 시안에 ' . $n . '번 나옵니다. 앞뒤 글자를 더 붙여 한 군데만 맞게 하거나, 전부 바꿀 거면 all: true 를 주세요: ' . mb_substr($find, 0, 80), ['index' => $i, 'count' => $n]);
        }
        $html = empty($e['all']) ? substr_replace($html, $rep, (int) strpos($html, $find), strlen($find)) : str_replace($find, $rep, $html);
    }
    return $html;
}

/**
 * 받아쓰기 줄이기(2026-10-02) — AI 가 매 장마다 똑같이 다시 쓰던 부분을 서버가 채운다.
 *   <script data-hb-behavior></script>        → 동작 스크립트(15KB)를 넣는다
 *   <style data-hb-base></style>              → 기본 CSS(api/data/hb-base.css: 토큰·틀·서브 공통 틀)를 넣는다
 *   <!--hb:use 이름-->  (base_token 과 함께)   → 기준 시안(보통 메인)의 그 부분을 넣는다
 *        기준 시안에 <!--hb:part 이름-->…<!--/hb:part--> 로 표시한 구간. 표시가 없으면
 *        style(모든 <style>)·header(첫 <header>)·footer(마지막 <footer>) 는 태그로 찾는다.
 * 왜: 운영 시안 16장 실측 — 한 장 46~80KB 중 동작 스크립트 15.5KB(20~33%), 서브는 머리·바닥·공통 CSS 16KB 가 메인과 같았다.
 */
/** 비어 있는 <style data-hb-base></style> 자리를 전부 홈박스 기본 CSS 로 채운다(이미 채운 자리는 그대로). */
function homebox_mockup_fill_base(string $html): string
{
    $bslot = '/<style\b[^>]*\bdata-hb-base\b[^>]*>\s*<\/style>/i';
    if (preg_match($bslot, $html)) {
        $css = (string) @file_get_contents(dirname(__DIR__) . '/data/hb-base.css');
        $html = (string) preg_replace_callback($bslot, static fn () => "<style data-hb-base=\"1\">\n" . $css . "\n</style>", $html);
    }
    return $html;
}

function homebox_mockup_expand(string $html, int $keyId, string $baseToken): string
{
    $slot = '/<script\b[^>]*\bdata-hb-behavior\b[^>]*>\s*<\/script>/i';
    if (preg_match($slot, $html)) {
        $js = (string) @file_get_contents(dirname(__DIR__) . '/data/hb-behavior.js');
        $html = (string) preg_replace_callback($slot, static fn () => "<script data-hb-behavior=\"1\">\n" . $js . "\n</script>", $html, 1);
    }
    // 기본 CSS(2026-10-03): <style data-hb-base></style> 한 줄 → 토큰·틀·서브 공통 틀 CSS 를 채운다(시안의 :root 변수 선언은 이 뒤에 둔다)
    $html = homebox_mockup_fill_base($html);
    if (!preg_match_all('/<!--\s*hb:use\s+([A-Za-z0-9_-]+)\s*-->/', $html, $m)) { return $html; }
    if ($baseToken === '') { Response::error(400, 'BASE_REQUIRED', '<!--hb:use …--> 를 쓰려면 base_token(먼저 판정한 메인 시안의 token)을 함께 보내세요.'); }
    $base = Db::row('SELECT html FROM mockup_pages WHERE token = ? AND api_key_id = ?', [$baseToken, $keyId]);
    if ($base === null) { Response::error(404, 'BASE_NOT_FOUND', 'base_token 시안을 찾지 못했습니다(만료됐거나 다른 키로 만든 것).'); }
    $src = (string) $base['html'];
    foreach (array_unique($m[1]) as $name) {
        $part = null;
        $q = preg_quote($name, '/');
        if (preg_match('/<!--\s*hb:part\s+' . $q . '\s*-->(.*?)<!--\s*\/hb:part\s*-->/s', $src, $pm)) { $part = $pm[1]; }
        elseif ($name === 'style' && preg_match_all('/<style\b[^>]*>.*?<\/style>/is', $src, $sm)) { $part = implode("\n", $sm[0]); }
        elseif ($name === 'header' && preg_match('/<header\b.*?<\/header>/is', $src, $hm)) { $part = $hm[0]; }
        elseif ($name === 'footer' && preg_match_all('/<footer\b.*?<\/footer>/is', $src, $fm)) { $part = (string) end($fm[0]); }
        if ($part === null) { Response::error(400, 'PART_NOT_FOUND', '기준 시안에 "' . $name . '" 부분이 없습니다. 기준 시안에서 <!--hb:part ' . $name . '-->…<!--/hb:part--> 로 표시했거나, style·header·footer 중 하나여야 합니다.'); }
        $html = (string) preg_replace_callback('/<!--\s*hb:use\s+' . $q . '\s*-->/', static fn () => $part, $html);
    }
    return homebox_mockup_fill_base($html);
}

$router->post('/api/internal/mockup-pages', static function (): void {
    Auth::requireAdmin();
    $b = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $keyId = (int) ($b['api_key_id'] ?? 0);
    $mode = (string) ($b['mode'] ?? 'publish');
    $title = mb_substr(trim((string) ($b['title'] ?? '')), 0, 120);
    $refId = mb_substr(trim((string) ($b['ref_id'] ?? '')), 0, 255);
    $token = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($b['token'] ?? ''));
    $edits = is_array($b['edits'] ?? null) ? $b['edits'] : [];
    $newHtml = isset($b['html']) ? (string) $b['html'] : null;
    if ($keyId <= 0) { Response::error(400, 'BAD_REQUEST', '키 정보가 없습니다.'); }
    Db::exec('DELETE FROM mockup_pages WHERE expires_at < NOW(3)');

    $own = null;
    if ($token !== '') {
        $own = Db::row('SELECT id, html, published, check_pass, title, base_token FROM mockup_pages WHERE token = ? AND api_key_id = ?', [$token, $keyId]);
        if ($own === null) {
            Response::error(404, 'NOT_FOUND', '시안 token 을 찾지 못했습니다(만료됐거나 다른 키로 만든 것). html 을 보내 새로 판정하세요.');
        }
    }

    // ---- 게시: 토큰만. 마지막 판정이 통과여야 한다(판정은 MCP 가 쥔다).
    if ($mode === 'publish' && $newHtml === null && !$edits) {
        if ($own === null) { Response::error(400, 'BAD_REQUEST', 'check_mockup 이 돌려준 token 을 보내세요.'); }
        if ((int) ($own['check_pass'] ?? 0) !== 1) {
            Response::error(409, 'NOT_PASSED', '이 시안은 아직 check_mockup 을 통과하지 못했습니다. fixes 를 고쳐 check_mockup(token, edits) 으로 다시 판정하고, 통과하면 게시하세요.');
        }
        Db::exec('UPDATE mockup_pages SET published = 1, title = IF(? = \'\', title, ?), expires_at = NOW(3) + INTERVAL ' . MOCKUP_DAYS . ' DAY WHERE id = ?', [$title, $title, (int) $own['id']]);
        $row = Db::row('SELECT expires_at, bytes FROM mockup_pages WHERE id = ?', [(int) $own['id']]);
        Response::json(['token' => $token, 'path' => '/api/p/' . $token, 'published' => true, 'expires_at' => $row['expires_at'] ?? null, 'bytes' => (int) ($row['bytes'] ?? 0)], 200, ['Cache-Control' => 'no-store']);
    }

    // ---- 초안 보관(판정 전): 새 HTML 또는 보관본 + 고친 부분
    if ($newHtml !== null) { $newHtml = homebox_mockup_expand($newHtml, $keyId, (string) preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($b['base_token'] ?? ''))); }
    $html = $newHtml ?? (string) ($own['html'] ?? '');
    if ($html === '') { Response::error(400, 'BAD_REQUEST', 'html 이 없습니다. 처음 판정할 때는 완성한 HTML 문서 전체를, 다시 판정할 때는 token 과 edits 를 보내세요.'); }
    if ($edits) { $html = homebox_mockup_edits($html, $edits); }
    $bytes = strlen($html);
    if ($bytes < 50 || stripos($html, '<') === false) { Response::error(400, 'BAD_REQUEST', 'HTML 이 비어 있습니다. 완성한 HTML 문서 전체를 보내세요.'); }
    if ($bytes > MOCKUP_MAX_BYTES) {
        Response::error(413, 'TOO_LARGE', '한 장에 2MB 까지 받습니다. 이미지를 data URI 로 넣지 말고 홈박스 샘플 주소를 그대로 쓰세요.', ['bytes' => $bytes]);
    }
    if ($own !== null) {
        $changed = $html !== (string) $own['html'];
        Db::exec('UPDATE mockup_pages SET html = ?, bytes = ?, title = IF(? = \'\', title, ?), ref_id = IF(? = \'\', ref_id, ?),'
            . ($changed ? ' published = 0, check_pass = NULL, check_score = NULL,' : '')
            . ' updated_at = NOW(3), expires_at = NOW(3) + INTERVAL ' . MOCKUP_DAYS . ' DAY WHERE id = ?',
            [$html, $bytes, $title, $title, $refId, $refId, (int) $own['id']]);
    } else {
        $today = (int) (Db::row('SELECT COUNT(*) AS n FROM mockup_pages WHERE api_key_id = ? AND created_at >= CURDATE()', [$keyId])['n'] ?? 0);
        if ($today >= MOCKUP_PER_DAY) {
            Response::error(429, 'RATE_LIMITED', '시안은 키당 하루 ' . MOCKUP_PER_DAY . '건까지 새로 만들 수 있습니다. 같은 시안을 다시 판정할 때는 받은 token 과 edits 만 보내세요.');
        }
        $token = rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=');
        Db::exec('INSERT INTO mockup_pages (token, api_key_id, title, html, bytes, published, ref_id, expires_at) VALUES (?, ?, ?, ?, ?, 0, ?, NOW(3) + INTERVAL ' . MOCKUP_DAYS . ' DAY)',
            [$token, $keyId, $title, $html, $bytes, $refId !== '' ? $refId : null]);
    }
    // 같은 시안 묶음(메인 + 그 메인을 base_token 으로 만든 서브들)의 판정 기록 — 서브 틀(본문 폭·옆 메뉴·서브 비주얼)이 장마다 같은지 MCP 가 대조한다(2026-10-03)
    $bt = (string) preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($b['base_token'] ?? ''));
    if ($bt === '') { $bt = (string) ($own['base_token'] ?? ''); }
    $peers = [];
    if ($bt !== '' && $bt !== $token) {
        Db::exec('UPDATE mockup_pages SET base_token = ? WHERE token = ? AND api_key_id = ?', [$bt, $token, $keyId]);
        foreach (Db::rows('SELECT token, check_result FROM mockup_pages WHERE api_key_id = ? AND (token = ? OR base_token = ?) AND token <> ? AND check_result IS NOT NULL ORDER BY checked_at LIMIT 12', [$keyId, $bt, $bt, $token]) as $r) {
            $cr = json_decode((string) $r['check_result'], true);
            if (!is_array($cr)) { continue; }
            if ($r['token'] === $bt) { if (isset($cr['frame']['left'], $cr['frame']['right'])) { $peers[] = ['frame' => ['left' => $cr['frame']['left'], 'right' => $cr['frame']['right']]]; } }
            elseif (is_array($cr['design']['shell'] ?? null)) { $peers[] = ['shell' => $cr['design']['shell']]; }
        }
    }
    Response::json(['token' => $token, 'bytes' => $bytes, 'published' => false, 'html' => $html, 'peers' => $peers, 'pref_tips' => \Homebox\Preferences::compact(\Homebox\Preferences::tipsFor($html, 6))] /* 디자이너 선호 조언(2026-10-03, 감점 없음) */, 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/internal/mockup-pages/{token}/check', static function (array $p): void {
    Auth::requireAdmin();
    $b = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $token = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($p['token'] ?? ''));
    $res = is_array($b['result'] ?? null) ? $b['result'] : [];
    Db::exec('UPDATE mockup_pages SET check_score = ?, check_pass = ?, check_count = check_count + 1, check_result = ?, ref_id = IF(? = \'\', ref_id, ?), checked_at = NOW(3) WHERE token = ? AND api_key_id = ?', [
        max(0, min(100, (int) ($b['score'] ?? 0))), !empty($b['pass']) ? 1 : 0,
        json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (string) ($b['ref_id'] ?? ''), (string) ($b['ref_id'] ?? ''), $token, (int) ($b['api_key_id'] ?? 0),
    ]);
    // 갤러리(2026-10-03): 기준을 넘으면 학습 자료로 보관(썸네일은 판정 캡처), 아니면 폐기 표시
    // 개선 체크리스트(2026-10-03): 판정이 고치라고 한 것을 종류별로 쌓는다 — 많이 걸리는 것이 묶음·지시를 고칠 1순위. 실패해도 판정은 그대로.
    try { \Homebox\Checklist::fromJudge($res, 'check_mockup ' . $token, (string) ($b['ref_id'] ?? '') ?: null, (int) ($b['score'] ?? 0)); } catch (\Throwable $e) { error_log('[homebox-checklist] ' . $e->getMessage()); }
    homebox_gallery_store((string) $token, (int) ($b['api_key_id'] ?? 0), max(0, min(100, (int) ($b['score'] ?? 0))), isset($b['thumb']) ? (string) $b['thumb'] : null, (string) ($b['device'] ?? 'pc'));
    Response::json(['ok' => true], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/p/{token}', static function (array $p): void {
    $token = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($p['token'] ?? ''));
    $row = $token === '' ? null : Db::row('SELECT id, html, published FROM mockup_pages WHERE token = ? AND expires_at > NOW(3)', [$token]);
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('Referrer-Policy: no-referrer');
    if ($row === null || (int) $row['published'] !== 1) {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        $msg = $row === null ? '시안 주소가 만료됐거나 없습니다. 시안 주소는 만든 뒤 30일 동안 열립니다.' : '아직 홈박스 판정(check_mockup)을 통과하지 못한 시안입니다. 통과해서 게시하면 이 주소에서 열립니다.';
        echo '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>시안을 볼 수 없습니다</title>'
            . '<p style="font:16px/1.6 sans-serif;padding:48px">' . $msg . '</p>';
        exit;
    }
    Db::exec('UPDATE mockup_pages SET views = views + 1 WHERE id = ?', [(int) $row['id']]);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: private, max-age=30');
    header("Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals; form-action 'none'");
    echo $row['html'];
    exit;
});
