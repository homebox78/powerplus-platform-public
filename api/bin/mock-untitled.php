<?php
/**
 * '제목 없는 시안' 정리(서버 CLI 전용) — 사용자 지시(2026-10-15): "제목 없는 시안으로 된 것들은 중복된 건 삭제하고 남길 건 더 개선".
 *   php8.4 api/bin/mock-untitled.php dedupe [--dry]   같은 소유자·같은 레퍼런스(ref_id)로 여러 장이면 점수 높은(같으면 최근) 한 장만 남기고 숨김 삭제
 *   php8.4 api/bin/mock-untitled.php title  [--dry]   남은 것에 제목 = 시안 안 <title>(없으면 첫 h1) + 페이지 종류
 *   php8.4 api/bin/mock-untitled.php list             남은 제목 없는 시안 token 목록(일괄 수정용)
 * 숨김 삭제 = deleted_at + 게시 해제 + 갤러리 hidden — 행은 남아 되돌릴 수 있다(deleted_at=NULL, 갤러리 shared).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;

$cmd = $argv[1] ?? '';
$dry = in_array('--dry', $argv, true);
$untitled = "(m.title IS NULL OR TRIM(m.title) = '' OR m.title LIKE '제목 없는%')";
$live = 'm.deleted_at IS NULL AND m.discarded_at IS NULL AND m.passed = 1';

if ($cmd === 'dedupe') {
    $rows = Db::rows("SELECT m.id, m.token, m.owner_user_id, m.ref_id, m.score, m.created_at FROM mock_mockups m WHERE {$live} AND {$untitled} AND m.ref_id IS NOT NULL ORDER BY m.owner_user_id, m.ref_id, m.score DESC, m.created_at DESC");
    $seen = [];
    $gone = [];
    foreach ($rows as $r) {
        $k = $r['owner_user_id'] . '|' . $r['ref_id'];
        if (!isset($seen[$k])) {
            $seen[$k] = $r['token'];
            continue;
        }
        $gone[] = $r;
        if (!$dry) {
            Db::exec('UPDATE mock_mockups SET deleted_at = NOW(3), published_at = NULL WHERE id = ?', [(int) $r['id']]);
            Db::exec("UPDATE mock_gallery SET status = 'hidden' WHERE mockup_id = ?", [(int) $r['id']]);
        }
    }
    foreach ($gone as $g) {
        echo "숨김: {$g['token']} (점수 {$g['score']}, 남김 {$seen[$g['owner_user_id'] . '|' . $g['ref_id']]})\n";
    }
    echo ($dry ? '[DRY] ' : '') . '제목 없는 시안 ' . count($rows) . '장 중 중복 ' . count($gone) . "장 숨김 삭제\n";
    exit(0);
}

if ($cmd === 'title') {
    $label = ['main' => '메인', 'board_list' => '게시판 목록', 'board_view' => '게시글 상세', 'board_gallery' => '사진 갤러리', 'greeting' => '인사말', 'content' => '콘텐츠',
        'location' => '오시는 길', 'history' => '연혁', 'org_chart' => '조직도', 'faq' => '자주 묻는 질문', 'form' => '신청', 'procedure' => '절차 안내', 'sitemap' => '사이트맵'];
    $n = 0;
    foreach (Db::rows("SELECT m.id, m.page, m.html FROM mock_mockups m WHERE {$live} AND {$untitled}") as $r) {
        $h = (string) $r['html'];
        $t = '';
        if (preg_match('/<title[^>]*>(.*?)<\/title>/is', $h, $mm)) {
            $t = trim(html_entity_decode(strip_tags($mm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        }
        if ($t === '' && preg_match('/<h1[^>]*>(.*?)<\/h1>/is', $h, $mm)) {
            $t = trim(html_entity_decode(strip_tags($mm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        }
        $t = trim((string) preg_replace('/\s+/u', ' ', $t));
        $t = trim((string) preg_replace('/\s*[|·\-–—]\s*$/u', '', $t));
        $pg = $label[(string) $r['page']] ?? '';
        if ($pg !== '' && !str_contains($t, $pg)) {
            $t = trim($t . ' ' . $pg);
        }
        if ($t === '') {
            $t = '시안 ' . ($pg ?: '#' . $r['id']);
        }
        $t = mb_substr($t, 0, 120);
        $n++;
        echo "{$r['id']}\t{$t}\n";
        if (!$dry) {
            Db::exec('UPDATE mock_mockups SET title = ? WHERE id = ?', [$t, (int) $r['id']]);
            Db::exec('UPDATE mock_gallery SET title = ? WHERE mockup_id = ?', [$t, (int) $r['id']]);
        }
    }
    echo ($dry ? '[DRY] ' : '') . "제목 붙임 {$n}장\n";
    exit(0);
}

if ($cmd === 'list') {
    foreach (Db::rows("SELECT m.token, m.owner_user_id, m.page, m.score, IF(m.published_at IS NULL, 0, 1) AS pub FROM mock_mockups m WHERE {$live} AND {$untitled} ORDER BY m.owner_user_id, m.ref_id") as $r) {
        echo implode("\t", [$r['token'], $r['owner_user_id'], $r['page'], $r['score'], $r['pub']]) . "\n";
    }
    exit(0);
}

fwrite(STDERR, "사용: dedupe|title [--dry] | list(제목 붙이기 전에)\n");
exit(1);
