<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 샘플 이미지 라이브러리 (2026-09-25) — 목업의 사진·배너 자리에 넣는 공용 이미지.
 * 홈박스가 직접 만든 가상 인물·풍경이라 수집 화면과 달리 서명 없이 공개로 준다(원본 미노출 원칙은 수집물에만 적용).
 * 목록·파일 = powerAssets(2026-10-11부터, fromAssets). 옛 sample-images.json·homebox-public/samples 사본은 없앴다.
 */
final class Samples
{
    /** 섹션 유형 → 쓸 kind (앞일수록 우선) */
    public const FOR_SECTION = [
        'main_visual' => ['hero-city', 'hero-nature', 'sub-visual', 'hero-illust', 'hero-keyvisual'], // hero-keyvisual = powerAssets 키비주얼(공공기관·부처·기업·협회 대상만, 2026-10-14)
        'sub_visual' => ['sub-visual', 'hero-city', 'hero-nature'],
        'greeting_vision' => ['leader', 'leader-cutout'],
        'news_tabs' => ['news-thumb', 'leader-field'],
        'board_gallery' => ['news-thumb', 'leader-field', 'citizen'],
        'photo_news' => ['news-thumb', 'leader-field'],
        'sns_video' => ['video-thumb', 'leader-field', 'news-thumb', 'citizen'],
        'banner_zone' => ['banner', 'strip-banner'],
        'promo_banner' => ['banner', 'strip-banner'],
        'hero' => ['hero-nature', 'hero-city', 'banner', 'hero-keyvisual'], // 본문 중간의 폭 가득 큰 사진 (2026-09-26)
        'popup_zone' => ['popup', 'popup-wide', 'popup-tall', 'notice-square', 'card-news', 'poster'],
        'info_cards' => ['citizen', 'place', 'icon-color', 'icon-iso', 'icon-flat', 'icon-glass', 'icon-gradient', 'icon-blue', 'icon-*'],
        'quick_links' => ['icon-set', 'icon-color', 'icon-iso', 'icon-flat', 'icon-glass', 'icon-gradient', 'icon-blue', 'icon-*'], // 바로가기 아이콘 (2026-10-02) · icon-* = powerAssets 아이콘 세트 전부(2026-10-14)
        'content' => ['citizen', 'place', 'leader-field'],
        'stats' => ['infographic'],
        'sns_feed' => ['card-news', 'notice-square', 'news-thumb'],
        'event' => ['poster', 'tour', 'news-thumb', 'citizen'],
        'empty_state' => ['spot-illust'], // 빈 결과·점검 중·신청 완료 안내 (2026-10-01)
        'location_map' => ['building-illust', 'spot-illust', 'place'],
        'timeline' => ['archive-photo'], // 연혁 (7차 2026-10-01)
        'text_band' => ['pattern-bg'], // 비전·띠 문구 배경
        'photo_gallery' => ['news-thumb', 'tour', 'place', 'citizen'],
        'tour_cards' => ['tour', 'place', 'hero-nature'], // tour = 12차 관광·축제
        'symbol' => ['symbol-illust'], // 상징 페이지(섹션 유형이 아니라 페이지 유형 — get_sample_images section=symbol)
    ];


    /**
     * 가상 기관 → 묶음 (2026-09-26). 글자가 든 샘플(배너·팝업·포스터…)엔 기관명이 박혀 있다 —
     * 목업 기관과 같은 기관 → 같은 묶음 → 다른 묶음 순으로 고른다(미래혁신부 목업에 "한빛시" 배너가 먼저 들어가지 않게).
     */
    public const ORG_GROUP = [
        '한빛도' => 'local', '한빛광역시' => 'local', '한빛시' => 'local', '새솔군' => 'local', '푸른구' => 'local', '한빛시의회' => 'local',
        '한빛시교육청' => 'edu',
        '미래혁신부' => 'gov', '미래데이터청' => 'gov', '국민미래위원회' => 'gov',
        '한국미래복지공단' => 'corp', '한국미래에너지공사' => 'corp', '한국미래진흥원' => 'corp',
        // 관공서 밖 종류(2026-10-11) — SampleContent::persona 의 가상 기관과 같은 이름
        '한빛대학교' => 'univ', '한빛고등학교' => 'school', '한빛종합사회복지관' => 'welfare',
        '한빛문화재단' => 'foundation', '한빛장학재단' => 'foundation', '한빛과학재단' => 'foundation',
        '한국미래산업협회' => 'assoc', '한빛아트센터' => 'culture',
        '한빛솔루션' => 'biz', '한빛마켓' => 'biz', '한빛디자인랩' => 'biz', '한빛스튜디오' => 'biz',
        '한빛평생교육원' => 'academy',
    ];

    /** 관공서가 아닌 묶음 — 대상 태그 없는 글자 그래픽(관공서 문구)을 받지 않는다 */
    private const NON_PUBLIC = ['univ', 'school', 'welfare', 'foundation', 'assoc', 'culture', 'biz', 'academy'];

    /** 목업용으로 만든 아이콘 종류 — 그 밖의 icon-… 은 powerAssets 아이콘 세트(세트 이름 = 종류 = 스타일) */
    public const ICON_KINDS = ['icon-set', 'icon-color', 'icon-iso', 'icon-flat', 'icon-glass', 'icon-gradient', 'icon-blue'];

    /** 묶음이 받아 주는 사진 대상 — 학교·교육원은 교육청용(edu) 사진도 쓴다 */
    private const TARGET_FAMILY = ['univ' => ['univ', 'edu'], 'school' => ['school', 'edu'], 'academy' => ['academy', 'edu']];

    private static ?array $all = null;
    /** 지금 조립 중인 목업의 가상 기관 */
    private static string $org = '';
    /** 사용 이력 범위(키·세션) 와 그 범위에서 최근 쓴 샘플 id → 쓴 시각 */
    private static string $scope = '';
    private static array $recent = [];
    /** 이 목업에서 고른 아이콘 스타일 — 한 시안 안에서 아이콘 스타일을 섞지 않는다 */
    private static string $iconStyle = '';

    /**
     * 아이콘 스타일(그림 가족 × 색). kind 가 곧 스타일이지만 한 kind 안에 다른 그림이 섞인 곳은 더 나눈다
     * (바로가기 세트의 선형·투톤, 평면 파스텔의 9차·14차, 컬러 입체의 3차·8차). 아이콘이 아니면 null.
     * 같은 스타일 = 같은 색·같은 그림 스타일 — 같은 날 만든 것이라도 다르면 다른 스타일이다(사용자 지시 2026-10-05).
     */
    public static function styleOf(array $it): ?string
    {
        $k = (string) ($it['kind'] ?? '');
        if (!str_starts_with($k, 'icon')) { return null; }
        $tags = (array) ($it['tags'] ?? []);
        $src = (string) ($it['source'] ?? '');
        return match ($k) {
            'icon-set' => $k . (in_array('투톤', $tags, true) ? '-duotone' : '-line'),
            'icon-flat' => $k . (str_contains($src, 'PROMPTS-14') ? '-14' : '-9'),
            'icon-color' => $k . (str_contains($src, 'PROMPTS-8') ? '-8' : '-3'),
            default => $k,
        };
    }

    /**
     * 목업 조립 시작 — 가상 기관과 사용 이력을 잡는다.
     * 시안을 여러 장 받으면(같은 키로 get_main_mockup·get_page_code 를 연달아) 앞 시안에서 쓴 이미지를 뒤로 미뤄
     * 같은 배너·사진이 반복되지 않게 한다(사용자 지시 2026-09-26). 다 쓰면 가장 오래전에 쓴 것부터 다시 쓴다.
     */
    public static function context(string $org): void
    {
        self::$org = $org;
        self::$iconStyle = '';
        $who = (string) ($_SERVER['HTTP_X_HOMEBOX_KEY'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_GET['key'] ?? '');
        if ($who === '' && session_status() === PHP_SESSION_ACTIVE) { $who = 'sid:' . session_id(); }
        if ($who === '') { $who = 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'cli'); }
        self::$scope = substr(hash('sha256', 'samples|' . $who), 0, 24);
        $f = self::usageFile();
        $j = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
        $cut = time() - 3 * 86400;
        self::$recent = array_filter(is_array($j) ? $j : [], static fn ($t) => is_int($t) && $t >= $cut);
    }

    /** 목업에 실제로 넣은 샘플을 이력에 남긴다 (최근 300개) */
    public static function remember(array $ids): void
    {
        if (self::$scope === '' || $ids === []) { return; }
        $now = time();
        foreach ($ids as $id) { if (is_string($id) && $id !== '') { unset(self::$recent[$id]); self::$recent[$id] = $now; } }
        if (count(self::$recent) > 300) { self::$recent = array_slice(self::$recent, -300, null, true); }
        $f = self::usageFile();
        @mkdir(dirname($f), 0775, true);
        @file_put_contents($f, json_encode(self::$recent), LOCK_EX);
    }

    private static function usageFile(): string
    {
        return sys_get_temp_dir() . '/homebox-sample-usage/' . self::$scope . '.json';
    }

    /** 샘플에 박힌 가상 기관(태그 기준) */
    public static function orgOf(array $it): ?string
    {
        foreach ((array) ($it['tags'] ?? []) as $t) { if (isset(self::ORG_GROUP[$t])) { return $t; } }
        return null;
    }

    /** 가상 기관의 묶음 — 업종별 공사·공단(한국미래물관리공사…)은 표에 없어도 corp */
    public static function group(string $org): ?string
    {
        return self::ORG_GROUP[$org] ?? (preg_match('/^한국미래.+(공사|공단|진흥원)$/u', $org) ? 'corp' : null);
    }

    /** 0 = 같은 기관·기관명 없는 이미지 · 1 = 같은 묶음 · 2 = 다른 묶음 */
    private static function orgRank(array $it): int
    {
        if (self::$org === '' || empty($it['has_text'])) { return 0; }
        $o = self::orgOf($it);
        if ($o === null || $o === self::$org) { return 0; }
        return (self::ORG_GROUP[$o] ?? '') === (self::group(self::$org) ?? '?') ? 1 : 2;
    }

    /**
     * 사진의 대상 기관 묶음(6차 2026-10-01) — 태그 "대상:gov|corp|edu" 가 붙은 사진은 지금 시안의 가상 기관이
     * 그 묶음일 때만 쓴다(병원·항만·연수원 사진이 시청 시안에 들어가지 않게). 태그 없는 사진·기관 미정이면 통과.
     */
    private static function targetOk(array $it, ?string $org = null): bool
    {
        $org ??= self::$org;
        $want = [];
        foreach ((array) ($it['tags'] ?? []) as $t) { if (str_starts_with((string) $t, '대상:')) { $want[] = substr((string) $t, strlen('대상:')); } }
        if ($org === '') { return true; }
        $g = self::group($org);
        // 글자가 박힌 그래픽(배너·팝업·카드뉴스·포스터)은 대상 태그가 없으면 관공서용 문구다('9월은 재산세 납부의 달').
        // 관공서 밖 종류(대학·학교·복지관·재단·협회·문화·기업·교육원)는 그 종류용(대상 태그 일치)만 받는다 — 없으면 글자 없는 사진·그림으로 채운다(2026-10-12 MCP 시험).
        if ($want === [] && !empty($it['has_text']) && ($it['kind'] ?? '') !== 'signature' && $g !== null && in_array($g, self::NON_PUBLIC, true)) { return false; }
        if ($want === []) { return true; }
        return $g === null || array_intersect(self::TARGET_FAMILY[$g] ?? [$g], $want) !== [];
    }

    /** 0 = 지금 기관 묶음을 위해 만든 사진(대상 태그 일치) · 1 = 공용 — 공사 시안에 공사 사진이 먼저 오게 */
    private static function targetRank(array $it): int
    {
        $g = self::group(self::$org);
        if ($g === null) { return 1; }
        return in_array('대상:' . $g, (array) ($it['tags'] ?? []), true) ? 0 : 1;
    }

    /** 재현 묶음에서 먼저 실을 순서 — 0 = 이 기관 묶음용(대상 태그 일치) 또는 이 기관 이름이 든 것, 1 = 공용 (2026-10-11 20차 샘플이 앞 장에 밀려 안 실리던 것) */
    public static function prefer(array $it, string $org): int
    {
        $g = self::group($org);
        if ($g !== null && in_array('대상:' . $g, (array) ($it['tags'] ?? []), true)) { return 0; }
        return $org !== '' && self::orgOf($it) === $org ? 0 : 1;
    }

    /** 재현 묶음 등 목록 전체를 줄 때 같은 대상 기준으로 거른다 */
    public static function suits(array $it, string $org): bool { return self::targetOk($it, $org); }

    /** @return array<int, array<string, mixed>> */
    public static function all(): array
    {
        // 원본은 powerAssets 하나뿐 — 옛 data/sample-images.json 사본으로 떨어지지 않는다(사용자 2026-10-11 "모든 목업은 파워에셋을 통해서").
        self::$all ??= self::fromAssets() ?? [];
        return self::$all;
    }

    /**
     * 원본 = powerAssets(사용자 2026-10-11 "파워목업 MCP 제작 시 파워에셋에서 가져오게").
     * 플랫폼 /api/v1/assets/mock-samples 를 5분 파일 캐시로 읽는다. 못 읽으면 지난 캐시, 그것도 없으면 null(샘플 없음).
     * @return list<array<string,mixed>>|null
     */
    private static function fromAssets(): ?array
    {
        $src = (string) \Config::get('app.samples_url', 'https://powerplus.hom2box.com/api/v1/assets/mock-samples');
        if ($src === '' || $src === 'off') { return null; }
        $cache = rtrim(sys_get_temp_dir(), '/\\') . '/mockref-samples-' . substr(md5($src), 0, 8) . '.json';
        $read = static function () use ($cache): ?array {
            $j = is_file($cache) ? json_decode((string) file_get_contents($cache), true) : null;
            return is_array($j) && $j !== [] ? $j : null;
        };
        if (is_file($cache) && filemtime($cache) > time() - 300) {
            $c = $read();
            if ($c !== null) { return $c; }
        }
        $ctx = stream_context_create(['http' => ['timeout' => 8, 'header' => "Accept: application/json\r\n", 'ignore_errors' => true]]);
        $raw = @file_get_contents($src, false, $ctx);
        $j = is_string($raw) ? json_decode($raw, true) : null;
        $items = $j['data']['items'] ?? $j['items'] ?? null;
        if (is_array($items) && $items !== []) {
            @file_put_contents($cache, json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
            return $items;
        }
        return $read();
    }

    public static function url(string $file): string
    {
        return $file; // powerAssets 가 준 절대 주소(/api/v1/assets/samples/{id}/original|thumb)
    }

    /** 공개용 한 줄 — 파일 경로를 URL 로, 원본 파일명은 뺀다 */
    /**
     * 가상 기관 로고 — 기관 이름이 태그에 정확히 있는 것만. 반복 방지·seed 를 타지 않는다
     * (로고는 같은 기관이면 늘 같아야 한다. find() 로 고르면 '안 쓴 것 먼저' 때문에 남의 로고가 나왔다 — ledger E7).
     * $shape = 'wide'(가로형, 헤더·푸터) | 'tall'(세로형) | 'mascot' | 'slogan'. 없으면 null.
     */
    public static function emblem(string $org, string $shape = 'wide'): ?array
    {
        $best = null;
        foreach (self::all() as $it) {
            if ($it['kind'] !== 'emblem' || !in_array($org, (array) $it['tags'], true)) { continue; }
            $tags = (array) $it['tags'];
            $isMascot = in_array('마스코트', $tags, true); $isSlogan = in_array('슬로건', $tags, true);
            $ok = match ($shape) {
                'mascot' => $isMascot, 'slogan' => $isSlogan,
                'tall' => !$isMascot && !$isSlogan && $it['aspect'] < 1.2,
                default => !$isMascot && !$isSlogan && $it['aspect'] > 2.5,
            };
            if ($ok && ($best === null || in_array('가로형', $tags, true))) { $best = $it; }
        }
        return $best === null ? null : self::view($best);
    }

    public static function view(array $it): array
    {
        $safe = $it['text_safe'] ?? null;
        if (is_array($safe)) {
            $safe['scrim'] = ($safe['busy'] ?? 0) > 35; // 글자 쪽이 복잡하면 어둡게 깔 것
        }
        return [
            'id' => $it['id'], 'kind' => $it['kind'], 'kind_label' => $it['kind_label'], 'use_for' => $it['use_for'],
            'url' => self::url((string) $it['file']), 'thumb_url' => self::url((string) $it['thumb']),
            'w' => $it['w'], 'h' => $it['h'], 'aspect' => $it['aspect'], 'alt' => $it['alt'], 'tags' => $it['tags'],
            'has_text' => $it['has_text'], 'temporary' => $it['temporary'], 'note' => $it['note'], 'text_safe' => $safe,
            'style' => self::styleOf($it),
        ];
    }

    /**
     * 조건 검색. kinds 순서대로, 태그가 많이 맞는 것 먼저, 임시(temporary)는 뒤로. seed 가 같으면 같은 결과(목업 재현성).
     * @param string[] $kinds @param string[] $tags
     * @return array<int, array<string, mixed>>
     */
    public static function find(array $kinds, array $tags = [], int $limit = 6, int $seed = 0, array $exclude = []): array
    {
        $rows = [];
        foreach (self::all() as $it) {
            $ki = $kinds === [] ? 0 : array_search($it['kind'], $kinds, true);
            // 'icon-*' = powerAssets 아이콘 세트 아무것이나(세트마다 스타일이 달라 아래 스타일 고르기가 한 세트로 묶는다)
            if ($ki === false && str_starts_with((string) $it['kind'], 'icon-') && in_array('icon-*', $kinds, true)) { $ki = array_search('icon-*', $kinds, true); }
            if ($ki === false || in_array($it['id'], $exclude, true)) {
                continue;
            }
            $hit = 0;
            foreach ($tags as $t) {
                $t = trim((string) $t);
                if ($t === '') { continue; }
                foreach ($it['tags'] as $x) { if (str_contains((string) $x, $t) || str_contains($t, (string) $x)) { $hit++; break; } }
                if (str_contains((string) $it['alt'], $t)) { $hit++; }
            }
            if ($tags !== [] && $hit === 0 && $kinds === []) {
                continue;
            }
            // 기관 맞춤 → 최근 시안에서 안 쓴 것 먼저(쓴 것은 오래된 순) → 태그가 맞은 수 → 임시본 뒤로 → seed 로 섞기
            // (kind 순서로 줄 세우면 한 장뿐인 kind 가 매번 뽑힌다)
            //  반복 방지가 기관 맞춤보다 먼저 — 기관 순위를 앞에 두면 같은 기관 배너 3장이 시안마다 반복된다
            // 다른 가상 기관 이름이 글자로 박힌 이미지는 빼 버린다 — 순위만 뒤로 두면 모자랄 때 들어와 푸른구 페이지에 '새솔군 농업 현황'이 나왔다 (2026-09-30 MCP 시험 r2)
            if (self::orgRank($it) > 0 || !self::targetOk($it)) {
                continue;
            }
            $used = self::$recent[$it['id']] ?? 0;
            $rows[] = ['it' => $it, 'k' => [$used > 0 ? 1 : 0, self::targetRank($it), self::orgRank($it), $used, -$hit, $it['temporary'] ? 1 : 0, crc32($seed . $it['id'])]];
        }
        usort($rows, static fn ($a, $b) => $a['k'] <=> $b['k']);
        // 아이콘은 한 스타일만 — 바로가기 6칸에 유리 입체·평면·아이소가 섞여 들어가던 것(사용자 지적 2026-10-05).
        // 이 목업에서 이미 고른 스타일이 있으면 그것, 없으면 순위가 가장 높은 아이콘의 스타일(자리 수만큼 있는 것).
        $cnt = [];
        foreach ($rows as $r) { $s = self::styleOf($r['it']); if ($s !== null) { $cnt[$s] = ($cnt[$s] ?? 0) + 1; } }
        if ($cnt !== []) {
            $pick = self::$iconStyle !== '' && isset($cnt[self::$iconStyle]) ? self::$iconStyle : '';
            // 이미 고른 스타일이 이 자리 후보에 없으면, 사진으로 채울 수 있는 자리는 아이콘을 아예 빼고(다른 스타일로 새지 않게)
            $hasPhoto = false;
            foreach ($rows as $r) { if (self::styleOf($r['it']) === null) { $hasPhoto = true; break; } }
            if ($pick === '' && self::$iconStyle !== '' && $hasPhoto) { $pick = self::$iconStyle; }
            if ($pick === '') {
                foreach ($rows as $r) {
                    $s = self::styleOf($r['it']);
                    if ($s !== null && $cnt[$s] >= min($limit, max($cnt))) { $pick = $s; break; }
                }
            }
            self::$iconStyle = $pick;
            $rows = array_values(array_filter($rows, static fn ($r) => ($s = self::styleOf($r['it'])) === null || $s === $pick));
        }
        return array_map(static fn ($r) => $r['it'], array_slice($rows, 0, max(1, $limit)));
    }

    /** 섹션 유형에 맞는 이미지 n장 (섹션 코드의 사진 자리용) */
    public static function forSection(string $type, array $tags, int $n, int $seed): array
    {
        return self::find(self::FOR_SECTION[$type] ?? ['citizen', 'place'], $tags, $n, $seed);
    }
}
