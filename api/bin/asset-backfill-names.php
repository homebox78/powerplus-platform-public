<?php
/**
 * 에셋 이름·대체 글(alt)이 빈 행을 키워드로 채우기(서버 CLI 전용, 2026-10-16 데이터 보강 — 사용자 "1"(키워드 자동 채움) 선택).
 * 옛 파워플러스 이관분 등 이름 약 6,350·설명 약 4,690 이 비어 있었다. 화면은 Service::named() 가 대표 키워드 2개로 그때그때 지어 보여 줬지만
 * DB 가 비어 있어 MCP 응답·시안 alt·보고서 카드에 빈약하게 나갔다.
 * 규칙(Service::keywords 와 같은 드문 키워드 순서):
 *   이름 = 드문 한글 키워드 2개 + 분류(「돋보기 체크 아이콘」) / alt = 드문 키워드 4개를 · 로 + 분류(「돋보기·체크·문서·검토 아이콘」)
 *   로고는 이름(기관명)이 있으니 alt = 「<이름> 로고」. 목업 샘플은 분류 말을 붙이지 않는다(kind 가 따로 있다).
 *   이름만 비고 alt 가 있으면 이름 = alt(40자까지) — 사람이 쓴 문장이 키워드 조합보다 낫다.
 * 범위: 공개(public) 에셋 + 목업 샘플(mockup_sample). 사내 장표(ppt internal)는 건드리지 않는다. 이미 있는 값은 그대로(멱등).
 *   미리보기: php8.4 /var/www/platform/api/bin/asset-backfill-names.php --dry [--show 20]
 *   실행:     php8.4 /var/www/platform/api/bin/asset-backfill-names.php
 * 웹에서는 실행되지 않는다(CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;

$dry = in_array('--dry', $argv, true);
$show = 0;
foreach ($argv as $i => $a) {
    if ($a === '--show' && isset($argv[$i + 1])) {
        $show = max(0, (int) $argv[$i + 1]);
    }
}

const CAT_KO = ['icon' => '아이콘', 'illust' => '일러스트', 'photo' => '사진', 'diagram' => '다이어그램', 'logo' => '로고', 'mockup_sample' => ''];

$rows = Db::rows(
    "SELECT id, category, name, alt FROM asset_items
      WHERE deleted_at IS NULL
        AND (visibility = 'public' OR category = 'mockup_sample')
        AND category IN ('icon','illust','photo','diagram','logo','mockup_sample')
        AND (name IS NULL OR TRIM(name) = '' OR alt IS NULL OR TRIM(alt) = '')
      ORDER BY id"
);

$names = 0;
$alts = 0;
$noKw = 0;
$shown = 0;
foreach (array_chunk($rows, 400) as $chunk) {
    $ids = array_map(static fn(array $r): int => (int) $r['id'], $chunk);
    $in = implode(',', array_fill(0, count($ids), '?'));
    // 드문 키워드 먼저(전체에서 적게 쓰인 낱말이 그 에셋만의 말) — 한 번만 쓰인 낱말은 오타일 수 있어 뒤로(Service::keywords 와 같은 규칙)
    $tagRows = Db::rows(
        "SELECT t.item_id, t.tag, (SELECT COUNT(*) FROM asset_tags c WHERE c.tag = t.tag AND c.axis = 'kw') AS n
           FROM asset_tags t WHERE t.item_id IN ({$in}) AND t.axis = 'kw' AND t.lang = 'ko'",
        $ids
    );
    $by = [];
    foreach ($tagRows as $t) {
        $by[(int) $t['item_id']][] = [(string) $t['tag'], (int) $t['n']];
    }
    foreach ($chunk as $r) {
        $id = (int) $r['id'];
        $cat = (string) $r['category'];
        $suffix = CAT_KO[$cat] ?? '';
        $tags = $by[$id] ?? [];
        usort($tags, static fn(array $a, array $b): int => [($a[1] < 2) ? 1 : 0, $a[1]] <=> [($b[1] < 2) ? 1 : 0, $b[1]]);
        // 분류 말과 같은 키워드(「아이콘」·「사진」)는 이름에 두 번 나오지 않게 뺀다
        $kws = array_values(array_filter(array_column($tags, 0), static fn(string $k): bool => $k !== '' && $k !== $suffix));
        $name = trim((string) ($r['name'] ?? ''));
        $alt = trim((string) ($r['alt'] ?? ''));
        $newName = null;
        $newAlt = null;
        if ($name === '') {
            // 사람이 쓴 설명(alt)이 이미 있으면 그 문장이 키워드 조합보다 낫다(목업 샘플 「한빛시 시」 같은 조합이 나왔다)
            if ($alt !== '') {
                $newName = mb_strlen($alt) > 40 ? rtrim(mb_substr($alt, 0, 40)) . '…' : $alt;
            } elseif ($kws) {
                $newName = trim(implode(' ', array_slice($kws, 0, 2)) . ($suffix !== '' ? ' ' . $suffix : ''));
            } else {
                $noKw++;
            }
        }
        if ($alt === '') {
            if ($cat === 'logo' && $name !== '') {
                $newAlt = $name . ' 로고';
            } elseif ($kws) {
                $newAlt = trim(implode('·', array_slice($kws, 0, 4)) . ($suffix !== '' ? ' ' . $suffix : ''));
            }
        }
        if ($newName === null && $newAlt === null) {
            continue;
        }
        if ($show > 0 && $shown < $show) {
            $shown++;
            echo "  #{$id} {$cat} 이름[" . ($newName ?? $name) . "] alt[" . ($newAlt ?? $alt) . "]\n";
        }
        if (!$dry) {
            // 다른 곳에서 그사이 채웠으면 덮지 않는다
            if ($newName !== null) {
                Db::exec("UPDATE asset_items SET name = ? WHERE id = ? AND (name IS NULL OR TRIM(name) = '')", [mb_substr($newName, 0, 200), $id]);
            }
            if ($newAlt !== null) {
                Db::exec("UPDATE asset_items SET alt = ? WHERE id = ? AND (alt IS NULL OR TRIM(alt) = '')", [mb_substr($newAlt, 0, 300), $id]);
            }
        }
        $names += $newName !== null ? 1 : 0;
        $alts += $newAlt !== null ? 1 : 0;
    }
}

echo ($dry ? '[미리보기] ' : '') . '대상 ' . count($rows) . "개 · 이름 채움 {$names} · alt 채움 {$alts} · 키워드 없어 이름 못 지음 {$noKw}\n";
