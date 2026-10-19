<?php
declare(strict_types=1);

namespace Pp\Assets;

use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Triage;

/**
 * powerAssets 조회 서비스 — 목록·검색·세트·최근·파일 주소.
 * 출처: powerPlus server/src/AssetService.php(목록·검색·세트) 를 새 스키마(asset_items + asset_tags 행 + Access::can)로 다시 씀.
 * 모든 조회가 Access::whereVisible 을 지난다(설계서 §12.1 — 출구마다 따로 걸지 않는다). 동의어·오타 교정 사전은 S2 에서 이식.
 */
final class Service
{
    public const CATEGORIES = ['icon', 'photo', 'illust', 'diagram', 'logo', 'ppt', 'mockup_sample'];

    /**
     * 자산 이미지 화소 상한(가로×세로) — 업로드 판정은 이 한 곳(2026-10-18 사용자 결정 "상한을 낮춤", 전수조사 B).
     * GD 는 화소당 4B 를 쓴다: 8천만 화소면 디코딩만 320MB 라 memory_limit 256M 에서 Fatal(빈 500 + 고아 파일). 4천만 = 160MB + 썸네일.
     */
    public const MAX_PIXELS = 40_000_000;
    /** 오류 글에 싣는 예시 크기(= MAX_PIXELS) */
    public const MAX_PIXELS_EXAMPLE = [8000, 5000];

    /** 화소 상한을 넘으면 사용자에게 보일 글, 아니면 null — 디코딩·저장 전에 부른다. DB 없이 시험할 수 있게 순수 함수 */
    public static function pixelLimitError(int $w, int $h): ?string
    {
        if ($w * $h <= self::MAX_PIXELS) {
            return null;
        }
        [$ew, $eh] = self::MAX_PIXELS_EXAMPLE;
        return sprintf('이미지가 너무 큽니다(%d×%d, %s만 화소). 최대 %s만 화소(예 %d×%d) 이하로 줄여서 올려 주세요.',
            $w, $h, number_format((int) round($w * $h / 10000)), number_format(intdiv(self::MAX_PIXELS, 10000)), $ew, $eh);
    }

    /** 주제 목록에서 뺄 모양·화풍 낱말(스타일이지 주제가 아니다). */
    private const STYLE_WORDS = [
        'graphic', '그래픽', 'vector', '벡터', 'flat', '플랫', '평면', '입체', '3d', 'icon', '아이콘', 'illustration', '일러스트',
        'symbol', '심볼', 'pictogram', '픽토그램', 'translucent', '반투명', 'glass', '유리', 'pastel', '파스텔', 'isometric', '아이소메트릭', 'outline', '아웃라인', 'glassmorphism', '글래스모피즘', '초록', 'green',
        'minimal', '미니멀', 'simple', '단순', 'clean', 'modern', '모던', 'blue', '파랑', 'calm', '차분한', 'professional', 'public', 'business', 'office', 'service', 'system', 'digital',
    ];

    /** 검색 낱말 → 장표 낱장 종류(slide_page). 관련도 정렬에서 그 종류를 앞으로 올린다. */
    private const SLIDE_PAGE_WORDS = [
        '표지' => 'cover', '커버' => 'cover', 'cover' => 'cover',
        '목차' => 'toc', 'toc' => 'toc',
        '간지' => 'divider', 'divider' => 'divider',
        '질의응답' => 'qa', 'q&a' => 'qa', 'qa' => 'qa',
        '본문' => 'content', '내용' => 'content',
    ];
    /**
     * 검색 기록·통계에 남기지 않을 검색어 — 글자·숫자가 없는 것(이모지·기호만), 태그·스크립트 꼴,
     * SQL 주입 꼴(시험·공격 흔적). 검색 자체는 그대로 하고 기록만 뺀다.
     */
    public static function isJunkQuery(string $q): bool
    {
        $q = trim($q);
        if ($q === '' || !preg_match('/[\p{L}\p{N}]/u', $q)) {
            return true;
        }
        // 인코딩이 깨져 물음표로 바뀐 말("????", "???گ???") — 물음표가 절반 넘으면 기록하지 않는다
        if (substr_count($q, '?') * 2 > mb_strlen($q) || str_contains($q, "\u{FFFD}")) {
            return true;
        }
        if (preg_match('/[<>{}`;]|--|\/\*/u', $q)) {
            return true;
        }
        return (bool) preg_match('/\b(drop|alter|truncate)\s+table\b|\bdelete\s+from\b|\binsert\s+into\b|\bunion\s+(all\s+)?select\b|\bselect\b.+\bfrom\b|\bupdate\s+\w+\s+set\b|\bor\s+\d+\s*=\s*\d+|\bjavascript:/i', $q);
    }

    /** 목업 샘플(글자 박힌 그래픽)은 MCP 키·관리자만 — 웹 powerAssets 에선 검색·목록·상세 어디에도 안 나온다(사용자 2026-10-07). */
    public static function canSample(Actor $a): bool
    {
        // 애드인 로그인 키는 MCP 키가 아니다 — 목업 샘플을 열지 않는다
        if ($a->via === 'key' && (($a->key['name'] ?? '') === self::ADDIN_KEY)) {
            return $a->isAdmin();
        }
        return $a->via === 'key' || $a->isAdmin();
    }

    /** 애드인 로그인 때 발급하는 키 이름 — 마이페이지 키 목록에도 이 이름으로 보인다 */
    public const ADDIN_KEY = 'powerAssets 애드인';

    public const CATEGORY_KO = ['icon' => '아이콘', 'photo' => '사진', 'illust' => '일러스트', 'diagram' => '다이어그램', 'logo' => '로고', 'ppt' => '장표', 'mockup_sample' => '목업 샘플'];
    private const FILE_KINDS = ['thumb', 'original', 'slide', 'card'];

    /**
     * @param array{category?:string,q?:string,set?:string,sort?:string,addin?:bool,ids?:string[],tag?:string,slide_kind?:string,slide_page?:string} $f
     * @return array{rows:array,total:int,hidden:int,corrected:?array<string,string>}
     */
    public static function list(Actor $a, array $f, int $limit, int $offset): array
    {
        [$visSql, $visParams] = Access::whereVisible($a, 'i');
        $where = ['i.deleted_at IS NULL'];
        $params = [];
        $sampleOk = self::canSample($a) && empty($f['addin']);
        $cat = (string) ($f['category'] ?? '');
        // 모르는 분류·권한 밖 목업 샘플은 조용히 무시하지 않는다(화면 라벨이 ""/"3" 으로 깨지던 원인, 2026-10-09) — 400 으로 돌려준다
        if ($cat !== '' && !in_array($cat, self::CATEGORIES, true)) {
            throw HttpError::invalid('없는 종류입니다.', '아이콘·사진·일러스트·다이어그램·로고·장표 중 하나');
        }
        if ($cat === 'mockup_sample' && !$sampleOk) {
            throw HttpError::forbidden('목업 샘플은 MCP 키·관리자만 볼 수 있습니다.');
        }
        if ($cat !== '') {
            $where[] = 'i.category = ?';
            $params[] = $cat;
        } else {
            // 목업 샘플은 카테고리를 콕 집은 MCP·관리자 요청에만(§18 mockup_sample)
            $where[] = "i.category <> 'mockup_sample'";
            // 이 종류는 빼고 — 둘러보기 '에셋' 탭이 '전체'에서 로고(수천 개)를 뺀다(로고는 '로고' 탭, 사용자 2026-10-18)
            $except = (string) ($f['except'] ?? '');
            if ($except !== '' && in_array($except, self::CATEGORIES, true)) {
                $where[] = 'i.category <> ?';
                $params[] = $except;
            }
        }
        $notes = [];
        // 이모지·기호·스크립트 같은 검색어는 찾지 않는다 — 예전엔 낱말을 하나씩 빼며 엉뚱한 55건을 돌려주고 원문을 relaxed 로 되비췄다(2026-10-12 MCP 시험 r1-a1)
        $qRaw = trim((string) ($f['q'] ?? ''));
        if ($qRaw !== '' && self::isJunkQuery($qRaw)) {
            return ['rows' => [], 'total' => 0, 'hidden' => 0, 'corrected' => null, 'relaxed' => null, 'notes' => ['검색어로 쓸 수 있는 글자가 없어 찾지 않았습니다. 낱말로 다시 찾아 주세요.']];
        }
        if (!empty($f['set'])) {
            // 없는 세트를 조용히 0건으로 두면 고객 AI 가 "그 스타일 에셋이 없다"로 오해했다(2026-10-12 MCP 시험 r1-a2)
            if (!Db::val('SELECT 1 FROM asset_sets WHERE public_id = ?', [(string) $f['set']])) {
                throw HttpError::notFound('세트');
            }
            $where[] = 's.public_id = ?';
            $params[] = $f['set'];
        }
        // 애드인 즐겨찾기·최근 — id 묶음으로 콕 집어(최대 200)
        if (isset($f['ids']) && is_array($f['ids'])) {
            $ids = array_slice(array_values(array_filter($f['ids'], 'is_string')), 0, 200);
            $where[] = $ids ? 'i.public_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')' : '1 = 0';
            array_push($params, ...$ids);
        }
        // 애드인 장표 그룹(패키지·표지·목차…)
        if (!empty($f['slide_kind']) && in_array($f['slide_kind'], ['package', 'single'], true)) {
            $where[] = 'i.slide_kind = ?';
            $params[] = $f['slide_kind'];
        }
        if (!empty($f['slide_page']) && preg_match('/^[a-z]{2,12}$/', (string) $f['slide_page'])) {
            $where[] = 'i.slide_page = ?';
            $params[] = $f['slide_page'];
        }
        // 로고 분류(중앙부처·지자체·식품·음료…) — style_group 'logo-<분류>', 목록은 Deck\Logos::TOPICS 한 곳
        if (!empty($f['logo_topic'])) {
            if (!isset(\Pp\Deck\Logos::TOPICS[(string) $f['logo_topic']])) {
                throw HttpError::invalid('없는 로고 분류입니다.', implode('·', array_keys(\Pp\Deck\Logos::TOPICS)));
            }
            \Pp\Deck\Logos::ensureTopics();
            $where[] = "i.category = 'logo' AND i.style_group = ?";
            $params[] = 'logo-' . $f['logo_topic'];
        }
        // 애드인 주제 칩 — 태그 정확 일치
        if (!empty($f['tag'])) {
            $where[] = "EXISTS (SELECT 1 FROM asset_tags tg WHERE tg.item_id = i.id AND tg.axis = 'kw' AND tg.tag = ?)";
            $params[] = mb_strtolower((string) $f['tag']);
        }
        // 로고는 기관·회사 이름 — 이름에 검색어가 통째로(띄어쓰기 무시) 든 로고가 있으면 그것만. 긴 이름("장애인기업종합지원센터")을
        // 낱말로 쪼개 넓혀 찾으면 수백·수천 개가 걸렸다(2026-10-19 전수 조사)
        if ($cat === 'logo' && $qRaw !== '' && mb_strlen($qRaw) >= 2) {
            // 한↔영 짝(카카오↔kakao)도 이름으로 함께 — 어느 쪽으로 찾든 같은 묶음
            $flatQ = mb_strtolower(preg_replace('/\s+/u', '', $qRaw) ?? $qRaw);
            $alts = array_values(array_unique([$flatQ, ...Lexicon::brandPair($flatQ)]));
            $likes = array_map(static fn(string $w): string => '%' . self::escapeLike($w) . '%', $alts);
            [$vS, $vP] = Access::whereVisible($a, 'i');
            $nameHit = '(' . implode(' OR ', array_fill(0, count($likes), "REPLACE(LOWER(COALESCE(i.name,'')), ' ', '') LIKE ?")) . ')';
            if ((int) Db::val("SELECT COUNT(*) FROM asset_items i WHERE i.category = 'logo' AND i.deleted_at IS NULL AND {$nameHit} AND {$vS}", array_merge($likes, $vP)) > 0) {
                $where[] = $nameHit;
                array_push($params, ...$likes);
                $f['q'] = '';
                $f['sort'] = '__namelen';   // 이름이 짧은(검색어와 똑같은) 로고 먼저
            }
        }
        // 오타 교정(Lexicon) — 아는 낱말은 안 고치고, 고친 것은 corrected 로 돌려줘 화면이 "'코드'로 고쳐서 찾았어요"를 띄운다.
        // 띄어 쓴 복합어("데이터 베이스")는 먼저 붙여 본다(glue) — 안 붙이면 "베이스"가 "케이스"로 잘못 고쳐졌다(2026-10-10 MCP 시험).
        // 분류 낱말(사진·로고·아이콘…)은 찾을 말이 아니라 종류 — 빼서 그 종류를 앞으로 올리고, 그 말 하나뿐이면 그 종류로 거른다.
        // 어미·조사는 떼고("회의하는 사람들"→회의·사람), 동의어는 함께 찾는다(지피유↔gpu, 서울시↔서울특별시) — 2026-10-12 사용자 지적.
        $catHint = null;
        $raw = [];
        $place = [];
        // 낱말 6개 제한은 분류·자리 낱말을 뺀 뒤에 건다 — 먼저 자르면 긴 문장 끝의 "아이콘" 이 잘려 사진이 섞였다(O-23)
        foreach (self::tokens((string) ($f['q'] ?? ''), 12) as $t) {
            if (isset(Lexicon::CATEGORY_WORDS[$t])) {
                $catHint ??= Lexicon::CATEGORY_WORDS[$t];
                continue;
            }
            // 자리·문맥 낱말(옆·문장·어울리는…)과 개수("8개를")는 찾을 대상이 아니다 — 오타 교정·쪼개기 전에 따로 둔다(문장→문자, 스타일로→사일로, O-23)
            if (in_array($t, Lexicon::PLACE_WORDS, true) || in_array(Lexicon::stem($t), Lexicon::PLACE_WORDS, true) || preg_match('/^\d+(개|장|가지|건|종|점)?(를|을|만|씩|쯤|정도)?$/u', $t)) {
                $place[] = $t;
                continue;
            }
            // 쓰임새 말("보고서 표지에", "제안서 표지")은 장표를 찾는 게 아니면 대상이 아니다 — '보고서' 태그가 진한 것만 앞섰다(O-23).
            // "보고서 아이콘" 처럼 홀로 쓴 쓰임새 말은 주제일 수 있어 둔다: 조사가 붙었거나(표지에·보고서용) 쓰임새 말이 이어질 때만 뺀다.
            if ($cat !== 'ppt') {
                $u = preg_match('/^(.+?)(에|에서|용|용으로|으로)$/u', $t, $um) && in_array($um[1], Lexicon::USAGE_WORDS, true);
                if ($u || (in_array($t, Lexicon::USAGE_WORDS, true) && $raw && in_array(end($raw), Lexicon::USAGE_WORDS, true))) {
                    if ($raw && in_array(end($raw), Lexicon::USAGE_WORDS, true)) {
                        $place[] = array_pop($raw);
                    }
                    $place[] = $t;
                    continue;
                }
            }
            // 붙여 쓴 복합어는 아는 말 조각으로("기후위기제안서" 0건 → 기후위기·제안서, "esg경영" → esg·경영, 2026-10-12 MCP 시험 r1-a1)
            foreach (Lexicon::split(Lexicon::stem($t)) as $p) {
                $raw[] = $p;
            }
        }
        // 분류 낱말("로고"·"사진")은 종류로 거른다 — 가점만 주면 "서울시청 로고" 에 아이콘·사진이 섞였다(2026-10-12 MCP 시험 r1-a1)
        if ($catHint !== null && $cat === '') {
            $where[] = 'i.category = ?';
            $params[] = $catHint;
            $catHint = null;
        } elseif ($catHint !== null && $catHint !== $cat) {
            $ko = array_search($catHint, Lexicon::CATEGORY_WORDS, true);
            $notes[] = "검색어의 '" . ($ko ?: $catHint) . "'은 종류를 뜻하는 말이라 빼고 찾았습니다. 지금 고른 종류는 " . (self::CATEGORY_KO[$cat] ?? $cat) . '입니다. ' . (self::CATEGORY_KO[$catHint] ?? $catHint) . '을(를) 보려면 category=' . $catHint . ' 로 다시 찾으세요.';
            $catHint = null;
        }
        // 자리 낱말만 있었으면("옆") 그대로 찾는다
        if (!$raw) {
            $raw = $place;
        }
        $raw = array_slice(array_values(array_unique($raw)), 0, 6);
        [$toks, $corrected] = Lexicon::correctTokens(Lexicon::glue(array_values(array_unique($raw))));
        // 표기만 다른 같은 말은 대표 표기로(smart city·smart-city → 스마트시티, O-40) — 어느 표기로 찾아도 같은 순서
        $toks = array_values(array_unique(array_map(Lexicon::canon(...), $toks)));
        // 한 글자 낱말은 정확한 태그·이름만(부분 일치는 "차"가 차트·절차·자동차까지 1,400건을 긁었다) — 그걸로 0건일 때만 부분 일치로 넓힌다(옛 powerPlus 규칙)
        $condFor = static function (string $tok, bool $loose): array {
            if (mb_strlen($tok) === 1 && !$loose) {
                return ["(LOWER(COALESCE(i.name,'')) = ? OR EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.tag = ?))", [$tok, $tok]];
            }
            $ors = [];
            $ps = [];
            // 같은 글자의 다른 뜻 태그("환경" 의 환경설정·운영환경)로만 걸리지 않게
            $noise = Lexicon::SENSE_NOISE[$tok] ?? [];
            $noiseSql = $noise ? ' AND t.tag NOT IN (' . implode(',', array_fill(0, count($noise), '?')) . ')' : '';
            foreach (Lexicon::variants($tok) as $v) {
                // 3자 이하 영문·숫자는 낱말 단위로 — "lh" 가 silhouette·health 에 걸려 18건이 나왔다(2026-10-12 MCP 시험 r1-a1)
                if (preg_match('/^[a-z0-9]{1,3}$/', $v)) {
                    $re = '(^|[^a-z0-9])' . $v . '([^a-z0-9]|$)';
                    $ors[] = "LOWER(COALESCE(i.name,'')) REGEXP ? OR LOWER(COALESCE(i.alt,'')) REGEXP ? OR EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.tag REGEXP ?)";
                    array_push($ps, $re, $re, $re);
                    continue;
                }
                $like = '%' . self::escapeLike($v) . '%';
                $ors[] = "LOWER(COALESCE(i.name,'')) LIKE ? OR LOWER(COALESCE(i.alt,'')) LIKE ? OR EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.tag LIKE ?{$noiseSql})";
                array_push($ps, $like, $like, $like, ...$noise);
            }
            return ['(' . implode(' OR ', $ors) . ')', $ps];
        };
        $build = static function (bool $loose, ?array $use = null) use ($toks, $where, $params, $condFor): array {
            $w = $where;
            $p = $params;
            foreach ($use ?? $toks as $tok) {
                [$c, $cp] = $condFor($tok, $loose);
                $w[] = $c;
                array_push($p, ...$cp);
            }
            return ['FROM asset_items i LEFT JOIN asset_sets s ON s.id = i.set_id WHERE ' . implode(' AND ', $w), $p];
        };
        [$base, $qp] = $build(false);
        $total = (int) Db::val("SELECT COUNT(*) {$base} AND {$visSql}", array_merge($qp, $visParams));
        $hasOne = (bool) array_filter($toks, static fn(string $t): bool => mb_strlen($t) === 1);
        if ($total === 0 && $hasOne) {
            [$base, $qp] = $build(true);
            $total = (int) Db::val("SELECT COUNT(*) {$base} AND {$visSql}", array_merge($qp, $visParams));
        }
        // 낱말을 전부 AND 로 묶으면 하나만 안 맞아도 0건이 됐다("서울시 청사 야경 사진" 0건, 2026-10-12 MCP 시험 r1).
        // 0건이면 한 낱말씩 빼 본 조합과 한 낱말짜리를 견주어, 주제 낱말을 가장 많이 남기는 조합을 쓴다. 뺀 낱말은 relaxed 로 돌려준다.
        // 예전엔 "결과가 가장 많이 남는" 조합이라 흔한 말(제안서·기간)만 남고 핵심어(보안·민원처리)가 버려졌다(O-23·R24, 2026-10-15).
        // 무게: 주제 낱말 3, 쓰임새·색·일반어(제안서·파란·기간·단축…) 1 — 무게가 같을 때만 결과 수로 가른다.
        $relaxed = null;
        $isGeneric = static fn(string $t): bool => in_array($t, self::PICK_STOP, true) || in_array($t, Lexicon::COLOR_WORDS, true)
            || ($cat !== 'ppt' && in_array($t, Lexicon::USAGE_WORDS, true));
        // 다 맞는 것이 몇 개뿐이어도 넓힌다("ESG 경영" 3건, 2026-10-12 MCP 시험 r1-a1) — 점수가 낱말 전부로 매겨져 다 맞는 것이 앞에 선다
        $strict = $total;
        if ($total < 5 && count($toks) > 1) {
            $tryKeep = static function (array $keep) use ($build, $visSql, $visParams): array {
                [$b2, $q2] = $build(false, $keep);
                return [(int) Db::val("SELECT COUNT(*) {$b2} AND {$visSql}", array_merge($q2, $visParams)), $b2, $q2];
            };
            $weight = static function (array $keep) use ($isGeneric): int {
                $w = 0;
                foreach ($keep as $t) {
                    $w += $isGeneric($t) ? 1 : 3;
                }
                return $w;
            };
            $best = null;
            foreach ([count($toks) - 1, 1] as $size) {
                foreach ($toks as $i => $_) {
                    $keep = $size === 1 ? [$toks[$i]] : array_values(array_diff_key($toks, [$i => 1]));
                    $w = $weight($keep);
                    // 한 낱말짜리는 무게가 최대 3 — 이미 그보다 무거운 조합을 찾았으면 셀 필요 없다
                    if ($best !== null && $w < $best[4]) {
                        continue;
                    }
                    [$n, $b2, $q2] = $tryKeep($keep);
                    if ($n > $strict && ($best === null || $w > $best[4] || ($w === $best[4] && $n > $best[0]))) {
                        $best = [$n, $b2, $q2, $keep, $w];
                    }
                }
                if ($best && $best[4] > 3) {
                    break;   // 한 낱말짜리(무게 3 이하)가 이길 수 없다
                }
                if (count($toks) === 2) {
                    break;   // 둘이면 한 낱말 빼기 = 한 낱말짜리라 다시 볼 필요 없음
                }
            }
            if ($best) {
                [$total, $base, $qp] = $best;
                $relaxed = array_values(array_diff($toks, $best[3]));
                $notes[] = $strict > 0
                    ? "낱말을 모두 가진 에셋이 {$strict}개뿐이라 '" . implode("', '", $relaxed) . "' 없이도 찾았습니다. 모두 맞는 것이 앞에 있습니다."
                    : "낱말을 모두 가진 에셋이 없어 '" . implode("', '", $relaxed) . "' 없이 찾았습니다.";
            }
        }
        $all = (int) Db::val("SELECT COUNT(*) {$base}", $qp);
        $order = match ($f['sort'] ?? 'newest') {
            'popular' => '(SELECT COUNT(*) FROM asset_uses u WHERE u.item_id = i.id) DESC, i.created_at DESC',
            'name' => 'i.name IS NULL, i.name ASC, i.id ASC',
            '__namelen' => 'CHAR_LENGTH(i.name), i.name, i.id',
            default => 'i.created_at DESC, i.id DESC',
        };
        // 검색어가 있으면 관련도 먼저: 태그가 낱말과 똑같음(3) > 이름·설명에 들어 있음(2) — 요청한 정렬은 같은 점수 안에서.
        // 관련도 없이 최신순만 쓰면 "국토교통부" 로고 검색에 부동산원 로고가 먼저 나왔다(2026-10-10 MCP 시험).
        $score = [];
        $sp = [];
        if ($catHint !== null && $cat === '') {
            $score[] = '(i.category = ?) * 10';   // 분류 낱말은 분명한 뜻 — 주제 점수(최대 약 11)에 묻히지 않게
            $sp[] = $catHint;
        }
        foreach ($toks as $tok) {
            // 넓히며 뺀 일반어(보고서·기간…)는 순서에도 쓰지 않는다 — 남긴 핵심어보다 일반어 태그가 진한 것이 앞서던 것(O-23)
            // 색 낱말은 남긴다(1점) — "파란 톤" 은 넓힌 뒤에도 바라는 꾸밈이다
            if ($relaxed && in_array($tok, $relaxed, true) && $isGeneric($tok) && !in_array($tok, Lexicon::COLOR_WORDS, true)) {
                continue;
            }
            $like = '%' . self::escapeLike($tok) . '%';
            foreach (array_slice(Lexicon::variants($tok), 1) as $v) {
                $score[] = "(EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.tag = ?)) * 2 + (LOWER(COALESCE(i.name,'')) LIKE ?) * 2";
                array_push($sp, $v, '%' . self::escapeLike($v) . '%');
            }
            if (in_array($tok, Lexicon::COLOR_WORDS, true)) {
                // 색 낱말은 1점만 — 주제 낱말이 순서를 정하게
                $score[] = "(EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.tag = ?))";
                $sp[] = $tok;
                continue;
            }
            $score[] = "(EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.tag = ?)) * 3 + (LOWER(COALESCE(i.name,'')) LIKE ? OR LOWER(COALESCE(i.alt,'')) LIKE ?) * 3 + (LOWER(COALESCE(i.name,'')) = ?) * 2";
            array_push($sp, $tok, $like, $like, $tok);
            // 주제가 진짜인 에셋은 그 낱말이 든 태그가 여럿(행정서비스·공공행정…) — 묶음 공통으로 붙은 태그 하나보다 앞으로(최대 3)
            $score[] = "LEAST(3, (SELECT COUNT(*) FROM asset_tags t WHERE t.item_id = i.id AND t.tag <> ? AND t.tag LIKE ?))";
            array_push($sp, $tok, $like);
            // 같은 글자의 다른 뜻("환경" 의 환경설정·코딩)을 가리키는 맥락 태그가 붙은 것은 뒤로 — 검색어에 그 맥락어가 있으면 그대로(O-40)
            $off = array_values(array_diff(Lexicon::SENSE_OFF[$tok] ?? [], $toks));
            if ($off && count($off) === count(Lexicon::SENSE_OFF[$tok])) {
                $score[] = "-(EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.axis = 'kw' AND t.tag IN (" . implode(',', array_fill(0, count($off), '?')) . '))) * 8';
                array_push($sp, ...$off);
            }
            // 장표 낱장 종류 낱말(표지·목차·간지…)은 그 종류를 앞으로
            if (isset(self::SLIDE_PAGE_WORDS[$tok])) {
                $score[] = '(i.slide_page = ?) * 4';
                $sp[] = self::SLIDE_PAGE_WORDS[$tok];
            }
        }
        $orderSql = $score ? '(' . implode(' + ', $score) . ') DESC, ' . $order : $order;
        $rows = Db::rows(
            "SELECT i.*, s.public_id AS set_pid, s.name AS set_name {$base} AND {$visSql} ORDER BY {$orderSql} LIMIT {$limit} OFFSET {$offset}",
            array_merge($qp, $visParams, $sp),
        );
        $kw = self::keywords(array_map(static fn(array $r): int => (int) $r['id'], $rows));
        $out = array_map(static fn(array $r): array => self::named(self::hydrate($r) + ['keywords' => $kw[(int) $r['id']] ?? []]), $rows);
        // SEC-004: 권한 밖 수(사내 전용 포함)는 관리자·임직원에게만 — 밖에는 0(잠금 안내 없음)
        $hidden = self::seesTotals($a) ? max(0, $all - $total) : 0;
        return ['rows' => $out, 'total' => $total, 'hidden' => $hidden, 'corrected' => $corrected ?: null, 'relaxed' => $relaxed, 'notes' => $notes];
    }

    /**
     * 자주 사용하는 로고(나만) — 최근 180일 내 사용(내려받기·애드인 삽입·powerDeck 로고 찾기, 1회 = 3점)
     * + 내가 검색한 말이 로고 이름과 같은 횟수(1회 = 1점). 사용자 2026-10-18 "내가 자주 검색하는 로고는 로고 검색란 하단에".
     */
    public static function frequentLogos(Actor $a, int $limit = 12): array
    {
        if ($a->id() === null) {
            return [];
        }
        $rows = Db::rows(
            "SELECT i.public_id, SUM(x.pt) AS score FROM (
                 SELECT u.item_id, 3 AS pt FROM asset_uses u WHERE u.user_id = ? AND u.created_at >= NOW() - INTERVAL 180 DAY
                 UNION ALL
                 SELECT i2.id, 1 FROM asset_search_logs l JOIN asset_items i2 ON i2.category = 'logo' AND i2.deleted_at IS NULL AND i2.name = l.q
                 WHERE l.user_id = ? AND l.day >= CURDATE() - INTERVAL 180 DAY
             ) x JOIN asset_items i ON i.id = x.item_id AND i.category = 'logo' AND i.deleted_at IS NULL
             GROUP BY i.id ORDER BY score DESC, MAX(i.id) DESC LIMIT " . max(1, min(30, $limit)),
            [$a->id(), $a->id()],
        );
        if (!$rows) {
            return [];
        }
        $rank = array_flip(array_column($rows, 'public_id'));
        $items = self::list($a, ['category' => 'logo', 'ids' => array_keys($rank), 'addin' => true], 30, 0)['rows'];
        usort($items, static fn(array $x, array $y): int => $rank[$x['id']] <=> $rank[$y['id']]);
        return $items;
    }

    /**
     * 이름·대체 글이 빈 에셋(이관분 다수)은 대표 키워드 앞 2개로 채운다 — 빈 이름은 MCP 응답·보고서 카드가 빈칸이었다(2026-10-12 MCP 시험).
     * 지어낸 이름임을 name_auto 로 알린다. DB 는 그대로.
     */
    private static function named(array $r): array
    {
        $kws = array_values(array_filter((array) ($r['keywords'] ?? []), static fn($k): bool => is_string($k) && $k !== ''));
        $auto = implode(' ', array_slice($kws, 0, 2));
        if (trim((string) ($r['name'] ?? '')) === '' && $auto !== '') {
            $r['name'] = $auto;
            $r['name_auto'] = true;
        }
        if (array_key_exists('alt', $r) && trim((string) ($r['alt'] ?? '')) === '' && $auto !== '') {
            $r['alt'] = $auto;
        }
        return $r;
    }

    /**
     * 카드에 보일 대표 키워드 — 에셋마다 한글 키워드 중 전체에서 드문 것 4개(사용자 2026-10-07 "대표 키워드 4개 정도").
     * 태그에는 순서가 저장돼 있지 않아, 흔한 낱말(파랑·아이콘·3D)보다 그 에셋만의 낱말을 고르려고 드문 순으로 정한다. 한 번만 쓰인 낱말은 오타일 수 있어 뒤로 미룬다.
     * @param int[] $ids
     * @return array<int, string[]>
     */
    private static function keywords(array $ids, int $n = 4): array
    {
        if (!$ids) {
            return [];
        }
        $in = implode(',', array_fill(0, count($ids), '?'));
        $rows = Db::rows(
            "SELECT t.item_id, t.tag, (SELECT COUNT(*) FROM asset_tags c WHERE c.tag = t.tag AND c.axis = 'kw') AS n
             FROM asset_tags t WHERE t.item_id IN ({$in}) AND t.axis = 'kw' AND t.lang = 'ko'",
            $ids,
        );
        $by = [];
        foreach ($rows as $r) {
            $by[(int) $r['item_id']][] = [(string) $r['tag'], (int) $r['n']];
        }
        $out = [];
        foreach ($by as $id => $tags) {
            usort($tags, static fn(array $a, array $b): int => [($a[1] < 2) ? 1 : 0, $a[1]] <=> [($b[1] < 2) ? 1 : 0, $b[1]]);
            $out[$id] = array_slice(array_column($tags, 0), 0, $n);
        }
        return $out;
    }

    public static function find(Actor $a, string $publicId): array
    {
        $row = Db::row('SELECT i.*, s.public_id AS set_pid, s.name AS set_name FROM asset_items i LEFT JOIN asset_sets s ON s.id = i.set_id WHERE i.public_id = ? AND i.deleted_at IS NULL', [$publicId]);
        if (!$row) {
            throw HttpError::notFound('에셋');
        }
        Access::assert($a, $row);
        if ($row['category'] === 'mockup_sample' && !self::canSample($a)) {
            throw HttpError::notFound('에셋');
        }
        $tags = Db::rows('SELECT tag, lang, axis FROM asset_tags WHERE item_id = ? ORDER BY axis, lang, tag', [$row['id']]);
        $out = self::hydrate($row);
        $out['tags'] = ['ko' => [], 'en' => [], 'meta' => []];
        foreach ($tags as $t) {
            if ($t['axis'] === 'kw') {
                $out['tags'][$t['lang']][] = $t['tag'];
            } else {
                $out['tags']['meta'][] = $t['axis'] . ':' . $t['tag'];
            }
        }
        $out['original_url'] = self::fileUrl($row['public_id'], 'original');
        if ($row['category'] === 'ppt') {
            $out['slide_url'] = self::fileUrl($row['public_id'], 'slide');
        }
        $out['uses'] = (int) Db::val('SELECT COUNT(*) FROM asset_uses WHERE item_id = ?', [$row['id']]);
        return $out;
    }

    /**
     * 문맥에 맞는 에셋 고르기 — powerDeck 초안 다듬기(asset_find.py pick)·powerMCP 가 쓴다.
     * 검색어가 없으면 문맥 글에서 실제 태그에 있는 낱말을 뽑아 찾고, 후보(최대 20)를 Jev 에 물어 하나를 고른다.
     * Jev 가 꺼졌거나 실패하면 규칙(검색어 일치 순 첫 후보) — by 로 알 수 있다.
     * @param array{text?:string, category?:string, queries?:string[], exclude?:string[], set?:string} $in
     */
    public static function pick(Actor $a, array $in): array
    {
        $text = trim(mb_substr((string) ($in['text'] ?? ''), 0, 2000));
        $cat = in_array($in['category'] ?? '', self::CATEGORIES, true) ? (string) $in['category'] : 'icon';
        $max = max(1, min(40, (int) ($in['limit'] ?? 20)));
        // 세트 고정 — set(세트 id) 또는 style_group. 여러 번 부르면 스타일이 5세트로 섞였다(2026-10-12 MCP 시험 x1)
        $setArg = trim((string) ($in['set'] ?? $in['style_group'] ?? ''));
        $set = null;
        if ($setArg !== '') {
            $s = Db::row('SELECT public_id, name FROM asset_sets WHERE public_id = ? OR name = ? LIMIT 1', [$setArg, $setArg]);
            if (!$s) {
                return ['pick' => null, 'picked' => null, 'set' => null, 'reason' => "세트 '{$setArg}' 가 없습니다. assets_sets 로 세트 id 를 확인하세요.", 'by' => null, 'confidence' => null, 'queries' => [], 'candidates' => []];
            }
            $set = ['id' => (string) $s['public_id'], 'name' => (string) $s['name'], 'name_ko' => self::setLabel((string) $s['name'])];
        }
        $queries = array_values(array_slice(array_filter(array_map(static fn($q): string => trim(mb_substr((string) $q, 0, 40)), (array) ($in['queries'] ?? [])), 'strlen'), 0, 4));
        $auto = false;
        if (!$queries && $text !== '') {
            $auto = true;
            $queries = self::pickQueries($text);
        }
        if (!$queries) {
            $why = $text === '' ? '글(text)도 검색어(queries)도 없어 고를 수 없습니다. 장표 문장이나 queries 를 넘기세요.'
                : '글에서 에셋 태그와 맞는 낱말을 찾지 못했습니다. queries 에 주제 낱말(예: 교육, 서버)을 넘기세요.';
            return ['pick' => null, 'picked' => null, 'set' => $set, 'reason' => $why, 'by' => null, 'confidence' => null, 'queries' => [], 'candidates' => []];
        }
        $exclude = array_flip(array_map('strval', (array) ($in['exclude'] ?? [])));
        $seen = [];
        $rows = [];
        $hitQs = [];
        foreach ($queries as $q) {
            $f = ['category' => $cat, 'q' => $q, 'addin' => true];
            if ($set) {
                // 세트를 정했으면 그 세트에서만 — 한 장표 안 아이콘 톤 통일
                $f['set'] = $set['id'];
            }
            $got = self::list($a, $f, 10, 0)['rows'];
            if ($got) {
                $hitQs[] = $q;
            }
            foreach ($got as $r) {
                if (!isset($seen[$r['id']]) && !isset($exclude[$r['id']])) {
                    $seen[$r['id']] = true;
                    $rows[] = $r;
                }
            }
            if (count($rows) >= $max) {
                break;
            }
        }
        $rows = array_slice($rows, 0, $max);
        // 썸네일은 절대 주소 — 고객 AI 가 상대 경로로는 그림을 못 열었다(2026-10-12 MCP 시험 x1)
        $base = rtrim((string) Config::get('app.url', 'https://powerplus.hom2box.com'), '/');
        foreach ($rows as &$r) {
            if (!empty($r['thumb_url']) && str_starts_with((string) $r['thumb_url'], '/')) {
                $r['thumb_url'] = $base . $r['thumb_url'];
            }
        }
        unset($r);
        $cands = [];
        foreach ($rows as $r) {
            $cands[$r['id']] = trim(($r['name'] ?: '') . ' · ' . implode(', ', $r['keywords'] ?? []), ' ·');
        }
        $pick = null;
        $by = null;
        $conf = null;
        if ($text !== '' && ($j = Triage::assetPick($text, $cands)) !== null && $j['confidence'] >= 0.3) {
            [$pick, $by, $conf] = [$j['id'], 'ai', round($j['confidence'], 2)];
        } elseif ($rows) {
            // 규칙 확신 = 결과가 나온 검색어 비율(예전엔 null 이라 고객 AI 가 믿을지 판단하지 못했다)
            [$pick, $by, $conf] = [$rows[0]['id'], 'rule', round(count($hitQs) / max(1, count($queries)) * 0.6, 2)];
        }
        // 고른 것의 이름·이유를 글로 — id 만 주면 고객 AI 가 왜 골랐는지 설명하지 못했다(2026-10-12 MCP 시험 pick-no-reason·pick-null-alt)
        $picked = null;
        $reason = $rows ? null : '검색어 ' . implode(', ', $queries) . ' 로 찾은 후보가 없습니다. queries 를 다른 낱말로 넘겨 보세요.';
        foreach ($rows as $r) {
            if ($r['id'] !== $pick) {
                continue;
            }
            $kws = array_values(array_slice((array) ($r['keywords'] ?? []), 0, 8));
            $label = trim((string) ($r['name'] ?? '')) ?: trim((string) ($r['alt'] ?? '')) ?: implode(' · ', array_slice($kws, 0, 3));
            $hit = array_values(array_filter($kws, static fn(string $k): bool => $text !== '' && mb_strlen($k) >= 2 && mb_stripos($text, $k) !== false));
            $hitQ = array_values(array_filter($queries, static fn(string $q): bool => in_array(mb_strtolower($q), array_map('mb_strtolower', $kws), true)));
            $picked = ['id' => $pick, 'label' => $label, 'keywords' => $kws, 'thumb_url' => $r['thumb_url'] ?? null,
                'set' => !empty($r['set']) ? $r['set'] + ['name_ko' => self::setLabel((string) ($r['set']['name'] ?? ''))] : null];
            if (!$set && !empty($picked['set'])) {
                $set = $picked['set'];
            }
            $reason = ($by === 'ai' ? '글 뜻과 가장 가까운 후보로 판단(확신 ' . $conf . ')' : '검색어 첫 결과(규칙)')
                . ($hit ? ' — 글의 ' . implode(', ', array_map(static fn($k) => "'{$k}'", $hit)) . ' 와 키워드가 겹침' : ($hitQ ? ' — 검색어 ' . implode(', ', $hitQ) . ' 와 키워드가 겹침' : ''))
                . '. 후보 ' . count($rows) . '개 중.';
        }
        $hint = $set ? "다음 호출에도 set={$set['id']} 를 넘기면 같은 스타일 세트에서 고릅니다." : null;
        return ['pick' => $pick, 'picked' => $picked, 'set' => $set, 'hint' => $hint, 'reason' => $reason, 'by' => $by, 'confidence' => $conf,
            'queries' => $queries, 'queries_auto' => $auto, 'candidates' => $rows];
    }

    /** 고르기 검색어로 쓰지 않을 낱말 — 조사·동사·일반어("있다,방문,비율,시간" 이 검색어가 됐다, 2026-10-12 MCP 시험 x1). */
    private const PICK_STOP = [
        '있다', '없다', '한다', '된다', '하는', '되는', '있는', '없는', '위한', '통한', '대한', '관련', '경우', '이상', '이하', '이내',
        '집합', '대상', '제공', '훈련', '방지', '투입', '구축', '단축', '자동', '기간', '이전', '이후', '통제', '방문', '비율', '시간',
        '운영', '추진', '확대', '강화', '개선', '지원', '활용', '도입', '수행', '실시', '계획', '방안', '현황', '결과', '목표', '전략',
        '단계', '기반', '중심', '효과', '내용', '부분', '전체', '모든', '각종', '기타', '주요', '필요', '가능', '사용', '이용', '진행',
        '최대', '최소', '평균', '증가', '감소', '연간', '월간', '일일', '매일', '매월', '올해', '내년', '작년', '현재', '향후',
    ];

    /** 글 → 고르기 검색어(최대 4). 제목(첫 줄)의 낱말 먼저, 불용어 빼고, 실제 태그에 있고 너무 흔하지 않은 것만. */
    private static function pickQueries(string $text): array
    {
        $lines = preg_split('/\R/u', $text) ?: [$text];
        $josa = '/(으로|에서|에게|까지|부터|이며|하고|및|은|는|이|가|을|를|의|에|와|과|로|도|만)$/u';
        $cand = [];
        foreach ($lines as $li => $line) {
            preg_match_all('/[\p{Hangul}A-Za-z0-9]{2,}/u', $line, $m);
            foreach ($m[0] as $w) {
                foreach ([$w, preg_replace($josa, '', $w) ?? $w] as $x) {
                    $x = mb_strtolower($x);
                    if (mb_strlen($x) < 2 || mb_strlen($x) > 20 || preg_match('/^\d+/', $x) || in_array($x, self::PICK_STOP, true)) {
                        continue;
                    }
                    // 첫 줄(제목) 낱말이 주제 — 앞 순위
                    $cand[$x] ??= $li === 0 ? 0 : 1;
                }
                if (count($cand) >= 60) {
                    break 2;
                }
            }
        }
        if (!$cand) {
            return [];
        }
        $list = array_keys($cand);
        $ph = implode(',', array_fill(0, count($list), '?'));
        // 너무 흔한 낱말(아이콘·파랑 같은 스타일 말)은 뜻이 없다
        $rows = Db::rows("SELECT tag, COUNT(*) AS c FROM asset_tags WHERE axis = 'kw' AND tag IN ($ph) GROUP BY tag HAVING c < 400", $list);
        usort($rows, static fn(array $x, array $y): int => [$cand[$x['tag']] ?? 1, (int) $x['c']] <=> [$cand[$y['tag']] ?? 1, (int) $y['c']]);
        return array_slice(array_map(static fn(array $r): string => (string) $r['tag'], $rows), 0, 4);
    }

    /** 애드인 설치 파일 정보 — 설정 assets.setup(url·version·size·published) 가 있으면 그것, 없으면 옛 powerPlus 릴리스 v1.0.4. */
    public static function setupInfo(): array
    {
        $c = (array) Config::get('assets.setup', []);
        // 설치 파일은 이 플랫폼이 /addin/ 에서 내준다 — 빌드 결과(scripts/build-installer.mjs)가 쓴 정보를 기본으로, 설정이 있으면 설정이 이긴다.
        $f = dirname(__DIR__, 2) . '/data/addin-setup.json';
        $b = is_file($f) ? (array) json_decode((string) file_get_contents($f), true) : [];
        $c += $b;
        return [
            'url' => (string) ($c['url'] ?? '/addin/powerAssets_Setup.exe'),
            'version' => (string) ($c['version'] ?? '1.1.0'),
            'size' => (int) ($c['size'] ?? 0),
            'published' => (string) ($c['published'] ?? ''),
            'requires' => ['Windows 10/11', 'PowerPoint 2019·2021 또는 Microsoft 365', '인터넷 연결'],
            'unsupported' => 'PowerPoint 2016 이하(작업창이 열리지 않습니다 — 설치 마법사가 안내)',
        ];
    }

    /** 카테고리별 건수 — 보이는 것과 전체(플랜 올리면 열리는 수). */
    public static function categories(Actor $a): array
    {
        [$visSql, $visParams] = Access::whereVisible($a, 'i');
        $vis = Db::rows("SELECT i.category, COUNT(*) n FROM asset_items i WHERE i.deleted_at IS NULL AND {$visSql} GROUP BY i.category", $visParams);
        $all = Db::rows('SELECT category, COUNT(*) n FROM asset_items i WHERE deleted_at IS NULL GROUP BY category');
        $v = array_column($vis, 'n', 'category');
        $t = array_column($all, 'n', 'category');
        $out = [];
        foreach (self::CATEGORIES as $c) {
            if ($c === 'mockup_sample' && !self::canSample($a)) {
                continue;
            }
            // 권한 밖이라 한 장도 못 보는 분류(비회원·free 의 장표)는 모달에 "장표 0" 으로 노출하지 않는다 — 숨긴 수는 HiddenNote 한 곳에서만(2026-10-09)
            if ((int) ($v[$c] ?? 0) === 0 && (int) ($t[$c] ?? 0) > 0) {
                continue;
            }
            // SEC-004: total(권한 밖 포함 전체 수)은 관리자·임직원만 진짜 값, 밖에는 볼 수 있는 수와 같게
            $cnt = (int) ($v[$c] ?? 0);
            $out[] = ['id' => $c, 'label' => self::CATEGORY_KO[$c], 'count' => $cnt, 'total' => self::seesTotals($a) ? (int) ($t[$c] ?? 0) : $cnt];
        }
        return $out;
    }

    /** 권한 밖(사내 전용 등)을 포함한 전체 수를 봐도 되는 사람 — 관리자·임직원(SEC-004) */
    private static function seesTotals(Actor $a): bool
    {
        return $a->isStaff() || $a->isAdmin();
    }

    /** 세트 코드 낱말 → 한글(웹 apps/web/app/lib/assets.ts SET_WORD_KO 와 같은 표). MCP 응답에 영문 코드만 가던 것(2026-10-12 MCP 시험). */
    private const SET_WORD_KO = [
        'flat' => '플랫', 'business' => '비즈니스', 'doc' => '문서', 'concept' => '개념', 'hero' => '히어로', 'keyvisual' => '키비주얼', 'climate' => '기후', 'glass' => '유리',
        'iso' => '아이소', '3d' => '입체', 'color' => '컬러', 'blue' => '파랑', 'green' => '초록', 'yellow' => '노랑', 'navy' => '남색',
        'mint' => '민트', 'lightblue' => '하늘', 'softblue' => '연파랑', 'pastel' => '파스텔', 'clay' => '클레이', 'soft' => '부드러운', 'pale' => '연한', 'gloss' => '광택',
        'matte' => '무광', 'line' => '선', 'mono' => '단색', 'duotone' => '투톤', 'filled' => '채움', 'light' => '밝은', 'mixed' => '혼합', 'misc' => '기타', 'photo' => '사진',
        'realistic' => '실사', 'tech' => '기술', 'device' => '기기', 'drop' => '물방울', 'badge' => '배지', 'pedestal' => '받침', 'people' => '사람', 'scene' => '장면',
        'standard' => '기본', 'cheer' => '응원', 'fullbody' => '전신', 'control' => '관제', 'building' => '건물', 'faceless' => '얼굴 없는', 'half' => '반신',
        'char' => '캐릭터', 'front' => '정면', 'cute' => '귀여운', 'kr' => '한국', 'biz' => '비즈니스', 'western' => '서양', 'banner' => '배너', 'objects' => '사물', 'semi' => '세미',
        'si' => 'SI', 'deck' => '장표', 'handdrawn' => '손그림', 'gradient' => '그라데이션',
        'pict' => '픽토그램', 'white' => '흰색', 'solid' => '솔리드', 'point' => '포인트', 'circle' => '원형', 'fill' => '채움', 'isometric' => '아이소메트릭', 'bold' => '굵은 선',
        'offset' => '어긋난 채움', 'app' => '앱', 'tile' => '타일', 'thin' => '가는 선', 'overlap' => '반투명 겹침', 'office' => '오피스', 'portrait' => '인물',
        'industry' => '산업', 'field' => '현장', 'finance' => '금융', 'law' => '법률', 'digital' => '디지털', 'city' => '도시', 'infra' => '인프라',
        'life' => '생활', 'welfare' => '복지', 'education' => '교육', 'health' => '보건', 'safety' => '안전', 'character' => '캐릭터',
        'nature' => '자연', 'landscape' => '풍경', 'leisure' => '여가', 'culture' => '문화',
    ];

    public static function setLabel(string $code): string
    {
        $words = array_filter(explode('-', (string) preg_replace('/^(icon|illust|photo|diagram|logo)-/', '', $code)), 'strlen');
        $out = [];
        foreach ($words as $w) {
            $k = self::SET_WORD_KO[strtolower($w)] ?? $w;
            if (!in_array($k, $out, true)) {
                $out[] = $k;
            }
        }
        return $out ? implode(' · ', $out) : $code;
    }

    /** 같은 스타일 세트 — 보이는 에셋이 1개 이상인 세트만, 표지는 세트 안 첫 에셋. */
    public static function sets(Actor $a, ?string $category, int $limit = 60): array
    {
        [$visSql, $visParams] = Access::whereVisible($a, 'i');
        $params = $visParams;
        $catSql = '';
        if ($category && in_array($category, self::CATEGORIES, true)) {
            $catSql = ' AND s.category = ?';
            $params[] = $category;
        }
        $rows = Db::rows(
            "SELECT s.public_id, s.name, s.style, s.category, s.item_count,
                    COUNT(i.id) AS visible_count,
                    (SELECT c.public_id FROM asset_items c WHERE c.id = s.cover_item_id) AS cover_pid,
                    SUBSTRING_INDEX(GROUP_CONCAT(i.public_id ORDER BY i.created_at DESC, i.id DESC), ',', 1) AS first_pid,
                    MAX(i.created_at) AS last_at,
                    SUM(i.created_at >= NOW() - INTERVAL 24 HOUR) AS recent_n
             FROM asset_sets s JOIN asset_items i ON i.set_id = s.id AND i.deleted_at IS NULL AND {$visSql}
             WHERE i.category <> 'mockup_sample'{$catSql}
             GROUP BY s.id ORDER BY last_at DESC, s.item_count DESC LIMIT {$limit}",
            $params,
        );
        $sees = self::seesTotals($a);
        return array_map(static fn(array $r): array => [
            'id' => $r['public_id'],
            'name' => $r['name'],
            'name_ko' => self::setLabel((string) $r['name']),
            'style' => $r['style'],
            'category' => $r['category'],
            'count' => (int) $r['visible_count'],
            'total' => $sees ? (int) $r['item_count'] : (int) $r['visible_count'],
            // 세트 = 최근에 에셋을 넣은 순, 대표 그림 = 그 세트에 가장 최근 넣은 에셋 — 새 아이콘이 세트 화면에 바로 보이게(사용자 2026-10-12)
            'cover_url' => self::fileUrl($r['cover_pid'] ?: $r['first_pid'], 'thumb'),
            'recent' => (int) $r['recent_n'],
            'updated_at' => $r['last_at'],
        ], $rows);
    }

    /** 파일 응답: Access 를 거친 뒤 로컬 storage 를 읽거나, 아직 옛 서버에 있는 파일이면 그쪽 공개 주소로 보낸다. */
    /** 회원 = 로그인한 사람 또는 키(애드인·powerMCP). 비회원은 원본을 못 받고 그림엔 워터마크가 붙는다(사용자 2026-10-07). */
    public static function isMember(Actor $a): bool
    {
        // 장표 엔진(워커 키)도 회원 — 아이콘·로고 원본을 장표에 넣는다(옛 powerPlus 공개 API 대체, 2026-10-07)
        return $a->via === 'key' || $a->kind === 'worker' || $a->id() !== null;
    }

    /**
     * 파일 내보내기 — 항상 이 주소에서 바이트를 직접 준다(다른 서버로 넘기지 않는다: 저장 위치·파일 이름이 밖에 보이지 않게, 사용자 2026-10-07).
     * 비회원: 장표 원본(slide)은 로그인 필요, 그림은 워터마크를 입힌 판(원본은 긴 변 1200 으로 줄임).
     */
    public static function sendFile(Actor $a, string $publicId, string $kind): never
    {
        if (!in_array($kind, self::FILE_KINDS, true)) {
            throw HttpError::notFound('파일');
        }
        $item = Db::row('SELECT id, category, visibility, owner_user_id, org_id FROM asset_items WHERE public_id = ? AND deleted_at IS NULL', [$publicId]);
        if (!$item) {
            throw HttpError::notFound('에셋');
        }
        Access::assert($a, $item);
        if ($item['category'] === 'mockup_sample' && !self::canSample($a)) {
            throw HttpError::notFound('에셋');
        }
        $member = self::isMember($a);
        if (!$member && $kind === 'slide') {
            throw new HttpError('LOGIN_REQUIRED', '로그인하면 내려받을 수 있습니다.', 401);
        }
        $f = Db::row('SELECT f.bucket, f.path, f.mime FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = ? AND af.kind = ?', [$item['id'], $kind]);
        if (!$f) {
            throw HttpError::notFound('파일');
        }
        $mime = (string) $f['mime'];
        $isImage = in_array($mime, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], true);
        if (!$member && !$isImage) {
            throw new HttpError('LOGIN_REQUIRED', '로그인하면 내려받을 수 있습니다.', 401);
        }
        $local = self::localFile($f);

        header('Vary: Cookie, Authorization');
        header('X-Content-Type-Options: nosniff');
        if (!$member) {
            $wm = self::watermarked($local, $mime, $publicId, $kind);
            header('Content-Type: ' . $wm['mime']);
            header('Cache-Control: private, max-age=3600');
            header('Content-Disposition: inline; filename="' . $publicId . '-preview.' . $wm['ext'] . '"');
            header('Content-Length: ' . (string) filesize($wm['path']));
            readfile($wm['path']);
            exit;
        }
        $ext = self::extOf($mime, (string) $f['path']);
        header('Content-Type: ' . $mime);
        header('Cache-Control: private, max-age=86400');
        // 파일 이름은 공개 번호로 — 저장소 안 실제 이름은 내보내지 않는다
        header('Content-Disposition: ' . ($kind === 'thumb' ? 'inline' : 'attachment') . '; filename="' . $publicId . ($kind === 'original' ? '' : '-' . $kind) . '.' . $ext . '"');
        header('Content-Length: ' . (string) filesize($local));
        readfile($local);
        exit;
    }

    /** 로컬 storage 의 파일 경로. 옛 서버(/powerPlus·/homebox)는 2026-10-07 내렸다 — 파일은 전부 플랫폼 storage 에 있다. */
    private static function localFile(array $f): string
    {
        $local = rtrim((string) Config::get('storage.dir'), '/\\') . '/' . $f['bucket'] . '/' . $f['path'];
        if (!is_file($local)) {
            throw HttpError::notFound('파일');
        }
        return $local;
    }

    private static function extOf(string $mime, string $path): string
    {
        return match ($mime) {
            'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/svg+xml' => 'svg',
            default => strtolower(pathinfo($path, PATHINFO_EXTENSION)) ?: 'bin',
        };
    }

    /**
     * 비회원용 워터마크 판을 미리 만든다(PERF-004, api/bin/prewarm-wm.php 가 부른다).
     * 이미 최신 판이 있으면 바로 돌아온다. 그림이 아니거나 파일이 없으면 null.
     * @return array{made:bool,path:string}|null
     */
    public static function prewarm(string $publicId, int $itemId, string $kind): ?array
    {
        $f = Db::row('SELECT f.bucket, f.path, f.mime FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = ? AND af.kind = ?', [$itemId, $kind]);
        if (!$f || !in_array((string) $f['mime'], ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], true)) {
            return null;
        }
        $local = rtrim((string) Config::get('storage.dir'), '/\\') . '/' . $f['bucket'] . '/' . $f['path'];
        if (!is_file($local)) {
            return null;
        }
        $alpha = in_array((string) $f['mime'], ['image/png', 'image/webp', 'image/gif'], true);
        $out = rtrim((string) Config::get('storage.dir'), '/\\') . '/wm2/' . $kind . '/' . $publicId . '.' . ($alpha ? 'png' : 'jpg');
        $fresh = is_file($out) && filemtime($out) >= filemtime($local);
        if (!$fresh) {
            try {
                self::watermarked($local, (string) $f['mime'], $publicId, $kind);
            } catch (\Throwable) {
                return null;
            }
        }
        return ['made' => !$fresh, 'path' => $out];
    }

    /**
     * 비회원용 워터마크 판 — storage/wm/<kind>/<public_id>.<png|jpg> 에 한 번 만들어 둔다(원본이 바뀌면 다시).
     * 투명 그림(아이콘·로고)은 PNG 로 투명을 살리고, 사진은 JPEG. 원본은 긴 변 1200 으로 줄인다.
     * @return array{path:string,mime:string,ext:string}
     */
    private static function watermarked(string $src, string $mime, string $publicId, string $kind): array
    {
        $alpha = in_array($mime, ['image/png', 'image/webp', 'image/gif'], true);
        $ext = $alpha ? 'png' : 'jpg';
        $dir = rtrim((string) Config::get('storage.dir'), '/\\') . '/wm2/' . $kind; // wm2: 2026-10-11 안내 띠 제거·작고 흐린 워터마크(옛 캐시 무시)
        $out = $dir . '/' . $publicId . '.' . $ext;
        if (is_file($out) && filemtime($out) >= filemtime($src)) {
            return ['path' => $out, 'mime' => $alpha ? 'image/png' : 'image/jpeg', 'ext' => $ext];
        }
        $im = @imagecreatefromstring((string) file_get_contents($src));
        if (!$im) {
            throw new HttpError('LOGIN_REQUIRED', '로그인하면 볼 수 있습니다.', 401);
        }
        $w = imagesx($im);
        $h = imagesy($im);
        $max = $kind === 'thumb' ? 720 : 1200;
        if (max($w, $h) > $max) {
            $r = $max / max($w, $h);
            $nw = max(1, (int) round($w * $r));
            $nh = max(1, (int) round($h * $r));
            $dst = imagecreatetruecolor($nw, $nh);
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
            imagecopyresampled($dst, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
            imagedestroy($im);
            $im = $dst;
            [$w, $h] = [$nw, $nh];
        } elseif (!imageistruecolor($im)) {
            imagepalettetotruecolor($im);
        }
        imagealphablending($im, true);
        imagesavealpha($im, true);
        self::stampMark($im, $w, $h);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $tmp = $out . '.part' . getmypid();
        $ok = $alpha ? imagepng($im, $tmp, 6) : imagejpeg($im, $tmp, 82);
        imagedestroy($im);
        if (!$ok || !@rename($tmp, $out)) {
            @unlink($tmp);
            $out = tempnam(sys_get_temp_dir(), 'ppw');
            $im2 = imagecreatefromstring((string) file_get_contents($src));
            // 저장 실패 시 한 번 더 만들어 임시 파일로
            $im2 ? (self::stampMark($im2, imagesx($im2), imagesy($im2)) || true) && ($alpha ? imagepng($im2, $out) : imagejpeg($im2, $out, 82)) : null;
        }
        return ['path' => $out, 'mime' => $alpha ? 'image/png' : 'image/jpeg', 'ext' => $ext];
    }

    /** 대각선으로 반복되는 작고 흐린 "powerPlus" 글자. 밝은·어두운 그림 모두에서 보이게 흰 글자 + 어두운 그림자. */
    private static function stampMark(\GdImage $im, int $w, int $h): bool
    {
        $font = null;
        foreach ([(string) Config::get('assets.watermark_font', ''), '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'] as $cand) {
            if ($cand !== '' && is_file($cand)) {
                $font = $cand;
                break;
            }
        }
        $text = 'powerPlus';
        $size = max(7, (int) round(min($w, $h) / 22));
        $white = imagecolorallocatealpha($im, 255, 255, 255, 108);
        $shade = imagecolorallocatealpha($im, 0, 0, 0, 118);
        if ($font !== null && function_exists('imagettftext')) {
            $box = imagettfbbox($size, 30, $font, $text);
            $tw = abs($box[4] - $box[0]) + $size * 2;
            $th = abs($box[5] - $box[1]) + $size * 2;
            for ($y = -$th; $y < $h + $th; $y += $th) {
                for ($x = -$tw + (($y / max(1, $th)) % 2) * (int) ($tw / 2); $x < $w + $tw; $x += $tw) {
                    imagettftext($im, $size, 30, (int) $x + 1, (int) $y + 1, $shade, $font, $text);
                    imagettftext($im, $size, 30, (int) $x, (int) $y, $white, $font, $text);
                }
            }
        } else {
            for ($y = 4; $y < $h; $y += 40) {
                for ($x = 4 + (($y / 40) % 2) * 50; $x < $w; $x += 100) {
                    imagestring($im, 3, $x + 1, $y + 1, $text, $shade);
                    imagestring($im, 3, $x, $y, $text, $white);
                }
            }
        }
        return true;
    }

    /**
     * 비슷한 에셋 — 키워드 태그(axis=kw)가 많이 겹치는 순, 같은 카테고리 가점. 출처: powerPlus McpServer similar_assets(태그 중첩) 를 asset_tags 행으로.
     */
    public static function similar(Actor $a, string $publicId, int $limit = 12): array
    {
        $base = self::find($a, $publicId); // 접근 판정 포함
        $id = (int) Db::val('SELECT id FROM asset_items WHERE public_id = ?', [$publicId]);
        [$visSql, $visParams] = Access::whereVisible($a, 'i');
        $limit = max(1, min(48, $limit));
        $rows = Db::rows(
            "SELECT i.*, s.public_id AS set_pid, s.name AS set_name, COUNT(*) AS overlap
             FROM asset_tags t0
             JOIN asset_tags t ON t.tag = t0.tag AND t.axis = 'kw' AND t.item_id <> t0.item_id
             JOIN asset_items i ON i.id = t.item_id AND i.deleted_at IS NULL
             LEFT JOIN asset_sets s ON s.id = i.set_id
             WHERE t0.item_id = ? AND t0.axis = 'kw' AND {$visSql}
             GROUP BY i.id
             ORDER BY COUNT(*) + IF(i.category = ?, 3, 0) DESC, i.created_at DESC
             LIMIT {$limit}",
            array_merge([$id], $visParams, [$base['category']]),
        );
        return array_map(static fn(array $r): array => self::hydrate($r) + ['overlap' => (int) $r['overlap']], $rows);
    }

    /** 카테고리 안 세부 주제 — 보이는 에셋에 많이 붙은 키워드 태그(검색어로 쓴다). 출처: powerPlus list_topics(주제 key) 를 태그 빈도로 대신. */
    public static function topics(Actor $a, ?string $category, int $limit = 30): array
    {
        [$visSql, $visParams] = Access::whereVisible($a, 'i');
        $params = $visParams;
        $cat = '';
        if ($category && in_array($category, self::CATEGORIES, true)) {
            $cat = ' AND i.category = ?';
            $params[] = $category;
        } else {
            $cat = " AND i.category <> 'mockup_sample'";
        }
        $limit = max(1, min(100, $limit));
        // 거의 모든 에셋에 붙은 말(파랑·아이콘·business…)은 주제가 아니다 — 그 분류 에셋의 20% 넘게 붙은 태그는 뺀다(2026-10-10 MCP 시험)
        $count = max(1, (int) Db::val("SELECT COUNT(*) FROM asset_items i WHERE i.deleted_at IS NULL AND {$visSql}{$cat}", $params));
        $cap = (int) ceil($count * 0.2);
        $fetch = $limit * 3;
        $rows = Db::rows(
            "SELECT t.tag, t.lang, COUNT(*) AS n FROM asset_tags t JOIN asset_items i ON i.id = t.item_id AND i.deleted_at IS NULL
             WHERE t.axis = 'kw' AND {$visSql}{$cat} GROUP BY t.tag, t.lang HAVING n <= {$cap} ORDER BY n DESC LIMIT {$fetch}",
            $params,
        );
        // 모양·화풍 낱말(그래픽·벡터·입체·플랫…)은 주제가 아니라 스타일이다 — 주제 목록에서 뺀다
        $rows = array_values(array_filter($rows, static fn(array $r): bool => !in_array(mb_strtolower((string) $r['tag']), self::STYLE_WORDS, true)));
        $rows = array_slice($rows, 0, $limit);
        return array_map(static fn(array $r): array => ['tag' => $r['tag'], 'lang' => $r['lang'], 'count' => (int) $r['n']], $rows);
    }

    /** 검색어 추천 — 등록된 태그에서 앞글자 일치(없으면 포함), 검색어가 비면 최근 30일 인기 검색어. 출처: powerPlus suggest_keywords. */
    public static function suggest(Actor $a, string $q, int $limit = 15): array
    {
        $limit = max(1, min(50, $limit));
        $q = mb_strtolower(trim($q));
        if ($q === '') {
            $rows = Db::rows("SELECT q, COUNT(*) AS n FROM asset_search_logs WHERE day >= CURDATE() - INTERVAL 30 DAY AND results > 0 GROUP BY q ORDER BY n DESC LIMIT {$limit}");
            return ['source' => 'popular', 'items' => array_map(static fn(array $r): array => ['keyword' => $r['q'], 'count' => (int) $r['n']], $rows)];
        }
        [$visSql, $visParams] = Access::whereVisible($a, 'i');
        $like = self::escapeLike($q);
        $sql = "SELECT t.tag, COUNT(*) AS n FROM asset_tags t JOIN asset_items i ON i.id = t.item_id AND i.deleted_at IS NULL
                WHERE t.axis = 'kw' AND t.tag LIKE ? AND {$visSql} GROUP BY t.tag ORDER BY (t.tag LIKE ?) DESC, n DESC LIMIT {$limit}";
        $rows = Db::rows($sql, array_merge(['%' . $like . '%'], $visParams, [$like . '%']));
        // 띄어쓰기만 다른 같은 말("스마트 시티"·"스마트시티")은 한 줄로 — 건수는 더한다(2026-10-12 MCP 시험)
        $merged = [];
        foreach ($rows as $r) {
            $k = preg_replace('/[\s\-_]+/u', '', mb_strtolower((string) $r['tag'])) ?? (string) $r['tag'];
            if (isset($merged[$k])) {
                $merged[$k]['count'] += (int) $r['n'];
            } else {
                $merged[$k] = ['keyword' => $r['tag'], 'count' => (int) $r['n']];
            }
        }
        $out = ['source' => 'tags', 'items' => array_values($merged)];
        // 글자 일치가 적으면 그 말이 붙은 에셋에 함께 붙은 말(관련어)을 더 준다 — '스마트시티' 가 자기 자신 1건만 돌려주던 것(2026-10-12 MCP 시험 suggest-exact-only)
        if (count($rows) < 5) {
            $have = array_flip(array_map(static fn(array $r): string => mb_strtolower((string) $r['tag']), $rows));
            $out['related'] = array_values(array_filter(self::related($a, $q, null, $limit + count($have)), static fn(array $r): bool => !isset($have[mb_strtolower($r['keyword'])])));
            $out['related'] = array_slice($out['related'], 0, $limit);
            $out['hint'] = 'items 는 글자가 겹치는 키워드, related 는 같은 에셋에 함께 붙은 관련어입니다.';
        }
        return $out;
    }

    /**
     * 관련어 — 검색어(포함 일치)가 붙은 에셋들에 함께 붙은 키워드를 많은 순으로(그 분류 20% 넘게 붙은 흔한 말·화풍 낱말 제외).
     * 주제 탐색(topics q=)과 검색어 추천의 관련어에 쓴다.
     */
    public static function related(Actor $a, string $q, ?string $category, int $limit = 20): array
    {
        $q = mb_strtolower(trim($q));
        if ($q === '') {
            return [];
        }
        [$visSql, $visParams] = Access::whereVisible($a, 'i');
        $cat = ($category && in_array($category, self::CATEGORIES, true)) ? ' AND i.category = ?' : " AND i.category <> 'mockup_sample'";
        $catP = ($category && in_array($category, self::CATEGORIES, true)) ? [$category] : [];
        $like = '%' . self::escapeLike($q) . '%';
        $ids = Db::rows("SELECT DISTINCT t.item_id AS id FROM asset_tags t JOIN asset_items i ON i.id = t.item_id AND i.deleted_at IS NULL
                         WHERE t.axis = 'kw' AND t.tag LIKE ? AND {$visSql}{$cat} LIMIT 3000", array_merge([$like], $visParams, $catP));
        if (!$ids) {
            return [];
        }
        $idList = array_map(static fn(array $r): int => (int) $r['id'], $ids);
        $ph = implode(',', array_fill(0, count($idList), '?'));
        $cap = max(3, (int) ceil(count($idList) * 0.6));
        $rows = Db::rows("SELECT tag, COUNT(*) AS n FROM asset_tags WHERE axis = 'kw' AND item_id IN ($ph) AND tag NOT LIKE ? GROUP BY tag HAVING n >= 2 AND n <= {$cap} ORDER BY n DESC LIMIT " . ($limit * 3), array_merge($idList, [$like]));
        $rows = array_values(array_filter($rows, static fn(array $r): bool => !in_array(mb_strtolower((string) $r['tag']), self::STYLE_WORDS, true)));
        return array_map(static fn(array $r): array => ['keyword' => $r['tag'], 'count' => (int) $r['n']], array_slice($rows, 0, $limit));
    }

    public static function fileUrl(?string $publicId, string $kind): ?string
    {
        return $publicId ? "/api/v1/assets/items/{$publicId}/file/{$kind}" : null;
    }

    private static function hydrate(array $r): array
    {
        return [
            'id' => $r['public_id'],
            'category' => $r['category'],
            'category_ko' => self::CATEGORY_KO[$r['category']] ?? $r['category'],
            'name' => $r['name'],
            'alt' => $r['alt'],
            'w' => $r['w'] !== null ? (int) $r['w'] : null,
            'h' => $r['h'] !== null ? (int) $r['h'] : null,
            'visibility' => $r['visibility'],
            'style_group' => $r['style_group'],
            'slide_kind' => $r['slide_kind'],
            'slide_page' => $r['slide_page'],
            'set' => !empty($r['set_pid']) ? ['id' => $r['set_pid'], 'name' => $r['set_name']] : null,
            'ai_generated' => (bool) $r['ai_generated'],
            'created_at' => $r['created_at'],
            'thumb_url' => self::fileUrl($r['public_id'], 'thumb'),
        ];
    }

    /** 검색어 → 소문자 낱말(2자 이상, 최대 6개). 태그는 소문자로 저장돼 있다. */
    public static function tokens(string $q, int $max = 6): array
    {
        $q = mb_strtolower(trim($q));
        if ($q === '') {
            return [];
        }
        $toks = preg_split('/[\s,\/]+/u', $q) ?: [];
        // "a.i" 처럼 점 찍은 약어는 점을 뗀다(A.I 0건 → AI 와 같게)
        $toks = array_map(static fn(string $t): string => Lexicon::unDot($t), $toks);
        $toks = array_values(array_unique(array_filter($toks, static fn(string $t): bool => mb_strlen($t) >= 1)));
        return array_slice($toks, 0, $max);
    }

    private static function escapeLike(string $s): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $s);
    }
}
