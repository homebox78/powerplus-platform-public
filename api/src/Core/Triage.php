<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 플랫폼 곳곳의 "고르기" 판단을 Jev(빠른 판단 모델)에 묻는 한 곳.
 * 모든 함수는 실패하면 null(또는 빈 배열)을 돌려주고, 부른 쪽은 원래 규칙·사용자가 고른 값으로 계속한다 — 판단은 보조다.
 * 넘기는 글에서는 이메일·전화번호를 지운다(scrub). 판단 결과는 core_decisions 에 남는다(같은 질문은 다시 묻지 않는다).
 */
final class Triage
{
    /** 플랫폼이 할 수 있는 일 — powerMCP 판정·통합 검색 탭 고르기가 같이 쓴다. 키 = 결과 값 */
    public const CAPABILITIES = [
        'assets'       => 'powerAssets: 아이콘·사진·일러스트·다이어그램·로고·제안서 장표 같은 디자인 자산을 찾고 PowerPoint 에 넣는다',
        'deck_make'    => 'powerDeck: 자료(PDF·한글·엑셀·PPT)를 정리해 제안서·발표 장표를 기획하고 디자인하고 대본을 쓴다',
        'deck_polish'  => 'powerDeck: 이미 만든 초안 PPT 를 정리된 디자인으로 다듬는다',
        'deck_status'  => 'powerDeck: 내가 맡긴 장표 작업의 진행 상태·결과물을 확인한다',
        'mock_page'    => 'powerMock: 홈페이지(관공서·공공기관·대학·기업) 메인·서브 화면 목업이나 시안을 만들고 판정한다',
        'mock_wire'    => 'powerMock: 홈페이지 화면 구성(와이어프레임)과 섹션 배치를 기획한다',
        'mock_ref'     => 'powerMock: 실제 기관 사이트의 디자인 패턴·섹션 구성·디자인 데이터를 참고 자료로 본다',
        'guide_tokens' => 'powerGuide: 색·글꼴·간격 디자인 토큰과 디자인 시스템 규칙을 내려받는다',
        'guide_parts'  => 'powerGuide: KRDS 기반 React·Vue 부품 코드와 접근성·KRDS 지침을 본다',
        'none'         => '위 어디에도 맞지 않는다(예: 일반 코딩·번역·법률 상담·영상 제작·서버 운영)',
    ];

    /** 이메일·전화번호를 지운다 — Jev 에 개인 정보를 넘기지 않는다 */
    public static function scrub(string $s, int $max = 4000): string
    {
        $s = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu', '[이메일]', $s) ?? $s;
        $s = preg_replace('/\b0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}\b/u', '[전화]', $s) ?? $s;
        return mb_substr(trim($s), 0, $max);
    }

    /** 문의 — 실제 주제·관련 모듈·급함·스팸. 결과는 core_contacts.ai 에 붙인다 */
    public static function contact(string $pid, string $topic, ?string $module, string $message, ?string $org): ?array
    {
        $state = '문의 종류(작성자가 고름): ' . $topic . "\n관련 서비스(작성자가 고름): " . ($module ?? '없음')
            . ($org ? "\n소속: " . self::scrub($org, 100) : '') . "\n\n내용:\n" . self::scrub($message);
        $a = Jev::ask('contact', $state, [
            'topic' => ['type' => 'choice', 'instructions' => '내용으로 볼 때 실제 문의 종류', 'criteria' => [
                'general' => '사용법·기능·요금 등 일반 질문', 'team' => '팀·회사 단위 도입, 좌석·견적', 'data' => '자료 정정·추가 요청',
                'bug' => '오류·장애 신고', 'partner' => '사업 제휴·협력 제안', 'removal' => '저작권·개인정보 삭제 요청',
            ]],
            'module' => ['type' => 'choice', 'instructions' => '내용이 가리키는 서비스', 'criteria' => [
                'assets' => '디자인 자산·PowerPoint 애드인', 'deck' => '장표 변환·제안서', 'mock' => '홈페이지 목업·MCP 시안',
                'guide' => '디자인 시스템·부품·KRDS', 'account' => '로그인·계정·결제', 'none' => '특정 서비스 아님',
            ]],
            'urgent' => ['type' => 'noul', 'instructions' => '서비스가 안 되거나 마감이 걸려 빨리 답해야 하는 문의인가'],
            'spam' => ['type' => 'noul', 'instructions' => '광고·스팸·의미 없는 글인가'],
        ], 'contact:' . $pid);
        if (!$a) {
            return null;
        }
        $out = [
            'topic' => self::pick($a['topic'] ?? null), 'module' => self::pick($a['module'] ?? null),
            'urgent' => round((float) ($a['urgent']['noul'] ?? 0), 2), 'spam' => round((float) ($a['spam']['noul'] ?? 0), 2),
        ];
        try {
            Db::exec('UPDATE core_contacts SET ai = ? WHERE public_id = ?', [json_encode($out, JSON_UNESCAPED_UNICODE), $pid]);
        } catch (\Throwable) {
        }
        return $out;
    }

    /** 커뮤니티 글 — 광고·비방 확률, 더 맞는 게시판. 결과는 comm_posts.ai 에 붙인다(숨김은 관리자가 결정) */
    public static function post(string $pid, string $category, string $title, string $body): ?array
    {
        $state = '게시판(작성자가 고름): ' . $category . "\n제목: " . self::scrub($title, 200) . "\n\n본문:\n" . self::scrub($body, 3000);
        $a = Jev::ask('post', $state, [
            'category' => ['type' => 'choice', 'instructions' => '글 내용에 가장 맞는 게시판', 'criteria' => [
                'qna' => '사용법 질문', 'showcase' => '만든 시안·장표·목업 공유', 'free' => '자유 이야기',
            ]],
            'ad' => ['type' => 'noul', 'instructions' => '광고·홍보·스팸 글인가'],
            'abuse' => ['type' => 'noul', 'instructions' => '욕설·비방·개인 공격이 있는가'],
        ], 'post:' . $pid);
        if (!$a) {
            return null;
        }
        $out = ['category' => self::pick($a['category'] ?? null), 'ad' => round((float) ($a['ad']['noul'] ?? 0), 2), 'abuse' => round((float) ($a['abuse']['noul'] ?? 0), 2)];
        try {
            Db::exec('UPDATE comm_posts SET ai = ? WHERE public_id = ?', [json_encode($out, JSON_UNESCAPED_UNICODE), $pid]);
        } catch (\Throwable) {
        }
        return $out;
    }

    /** 통합 검색 — 검색어가 가장 바라는 탭(assets·community·deck·mockups) */
    public static function searchTab(string $q): ?string
    {
        return Jev::choose('search_tab', '검색어: ' . self::scrub($q, 100), '검색어로 찾으려는 것', [
            'assets' => '아이콘·사진·일러스트·로고·장표 같은 디자인 자산',
            'community' => '사용법 질문·공지·작업 공유 글',
            'deck' => '내가 만든 장표 변환 작업',
            'mockups' => '홈페이지 목업·시안',
        ], 0.7);
    }

    /** 자료 요청 — 종류를 비워 보냈을 때 자산 분류 추정 */
    public static function requestKind(string $title, ?string $detail): ?string
    {
        return Jev::choose('request_kind', '요청 제목: ' . self::scrub($title, 200) . ($detail ? "\n설명: " . self::scrub($detail, 1000) : ''), '요청한 자료의 종류', [
            'icon' => '아이콘', 'photo' => '사진', 'illust' => '일러스트·삽화', 'diagram' => '다이어그램·도표·차트',
            'logo' => '기관·회사 로고', 'ppt' => '제안서·발표 장표 템플릿',
        ], 0.6);
    }

    /** powerAssets 애드인 — 에셋 종류(검색어 또는 슬라이드 글로 무엇을 찾는지) */
    public const ASSET_KINDS = [
        'icon' => '아이콘(작은 기호·표시·버튼 그림)', 'photo' => '사진(사람·장소·사물을 찍은 실사)',
        'illust' => '일러스트·삽화(그린 그림·캐릭터·장면)', 'diagram' => '다이어그램·도표·흐름도·차트',
        'ppt' => '장표 템플릿(표지·목차·간지·본문 슬라이드)',
    ];

    /** 애드인 검색어 → 종류(확신 0.7 이상만, 아니면 null = 전체에서 찾기) */
    public static function assetKind(string $q): ?string
    {
        return Jev::choose('addin_route', '검색어: ' . self::scrub($q, 100), '이 검색어로 찾으려는 자료의 종류', self::ASSET_KINDS, 0.7);
    }

    /** 애드인 슬라이드 글 → 이 슬라이드에 넣기 좋은 자료 종류 */
    public static function slideKind(string $text): ?string
    {
        return Jev::choose('addin_slide', '슬라이드 글: ' . self::scrub($text, 1200), '이 슬라이드에 넣으면 가장 어울리는 자료의 종류', self::ASSET_KINDS, 0.5);
    }

    /** 애드인 슬라이드 글 → 후보 낱말(실제 태그에 있는 것만) 중 대표 낱말 하나 */
    public static function slideKeyword(string $text, array $words): ?string
    {
        if (count($words) < 2) {
            return $words[0] ?? null;
        }
        $crit = [];
        foreach (array_values($words) as $i => $w) {
            $crit['w' . $i] = $w;
        }
        $k = Jev::choose('addin_slide', '슬라이드 글: ' . self::scrub($text, 1200), '이 슬라이드 내용을 가장 잘 나타내는, 그림을 찾을 때 쓸 낱말', $crit, 0.3);
        return $k === null ? null : $crit[$k];
    }

    /**
     * 장표 아이콘 고르기 — 슬라이드(자리 옆 글) 문맥에 가장 맞는 후보 하나.
     * @param array<string,string> $cands 후보 id => "이름 · 키워드…"
     * @return array{id:string, confidence:float}|null
     */
    public static function assetPick(string $context, array $cands): ?array
    {
        if (count($cands) < 2) {
            return null;
        }
        $crit = [];
        $map = [];
        foreach ($cands as $id => $label) {
            $k = 'c' . count($crit);
            $crit[$k] = mb_substr($label, 0, 160);
            $map[$k] = $id;
        }
        $a = Jev::ask('deck_icon', '슬라이드 문맥: ' . self::scrub($context, 1500), ['pick' => [
            'type' => 'choice',
            'instructions' => '이 문맥의 그림 자리에 넣었을 때 뜻이 가장 정확히 맞는 아이콘·그림',
            'criteria' => $crit,
        ]]);
        $p = $a['pick'] ?? null;
        if (!is_array($p) || !isset($map[(string) ($p['choice'] ?? '')])) {
            return null;
        }
        return ['id' => $map[(string) $p['choice']], 'confidence' => (float) ($p['confidence'] ?? 0)];
    }

    /** 목업 판정 고칠 점 → 체크리스트 분야(규칙이 못 고른 것만) */
    public static function checklistArea(string $fix): ?string
    {
        return Jev::choose('checklist_area', '목업 판정의 고칠 점: ' . mb_substr($fix, 0, 500), '이 지적이 속한 분야', [
            'layout' => '배치·간격·폭·높이·반응형', 'visual' => '색·면·대비', 'type' => '글자 크기·굵기·제목',
            'behavior' => '캐러셀·탭·메뉴·검색 동작', 'content' => '내용·이미지·기관 정보',
        ], 0.6);
    }

    /** 장표 기획의 분위기(mood) 값이 정해진 7개가 아닐 때 가장 가까운 값 */
    public static function mood(string $mood, string $title, array $moods): ?string
    {
        $criteria = array_combine($moods, $moods);
        return Jev::choose('deck_mood', '장 분위기(자유 기술): ' . mb_substr($mood, 0, 100) . "\n장 제목: " . mb_substr($title, 0, 200), '정해진 분위기 중 가장 가까운 것', $criteria, 0.5);
    }

    /**
     * powerMCP — 사용자 요청을 플랫폼으로 할 수 있는가. 고른 기능·확률·확신도를 준다.
     * @return array{capability:string,supported:bool,confidence:float,probabilities:array<string,float>,description:string}|null
     */
    /**
     * 판정 모델보다 먼저 보는 낱말 규칙 — 모델이 자주 틀리던 요청을 고정한다(MCP 품질 시험 3차).
     *  - 로고를 새로 만들어 달라 → 지원 안 함(대안: powerAssets 로고 검색)
     *  - 엑셀 표 자체를 정리·편집 → 지원 안 함(장표로 만드는 말이 없을 때만)
     *  - 내 장표 작업 상태·진행 → deck_status
     *  - 무엇을 할지 없는 "해 줘" → 되묻기
     */
    public static function scopeRules(string $request): ?array
    {
        $r = mb_strtolower(trim($request));
        $mk = static fn (string $cap, bool $ok, float $conf): array => [
            'capability' => $cap, 'supported' => $ok, 'confidence' => $conf,
            'probabilities' => [$cap => $conf], 'description' => self::CAPABILITIES[$cap], 'rule' => true,
        ];
        $deckWord = '/장표|제안서|발표|ppt|슬라이드|피피티/u';
        if (preg_match('/로고/u', $r) && preg_match('/만들|제작|디자인해|그려|생성|새로/u', $r) && !preg_match('/찾|검색|넣|고르/u', $r)) {
            return $mk('none', false, 0.9);
        }
        if (preg_match('/엑셀|스프레드시트|excel|xlsx/u', $r) && preg_match('/정리|편집|수식|함수|피벗|합계|정렬|서식/u', $r) && !preg_match($deckWord, $r)) {
            return $mk('none', false, 0.85);
        }
        if (preg_match('/(내|제|우리|맡긴|진행 ?중인).{0,12}(장표|작업|제안서)/u', $r) && preg_match('/상태|진행|어디까지|됐|끝났|결과|확인|현황/u', $r)) {
            return $mk('deck_status', true, 0.9);
        }
        $core = preg_replace('/[\s.!?~,]+|이거|그거|이것|그것|저거|좀|그냥|빨리|제발|부탁|해\s*줘|해\s*주세요|해\s*줄래|도와\s*줘|만들어\s*줘|알아서|뭐든/u', '', $r);
        if (mb_strlen((string) $core) < 2) {
            $s = $mk('none', false, 0.2);
            $s['vague'] = true;
            return $s;
        }
        return null;
    }

    public static function scope(string $request): ?array
    {
        $rule = self::scopeRules($request);
        if ($rule !== null) {
            return $rule;
        }
        $a = Jev::ask('mcp_scope', '사용자 요청: ' . self::scrub($request, 2000), [
            'cap' => ['type' => 'choice', 'instructions' => '이 요청을 처리할 수 있는 기능', 'criteria' => self::CAPABILITIES],
        ]);
        $p = $a['cap'] ?? null;
        if (!is_array($p) || !isset(self::CAPABILITIES[(string) ($p['choice'] ?? '')])) {
            return null;
        }
        $cap = (string) $p['choice'];
        $conf = (float) ($p['confidence'] ?? 0);
        $probs = array_map('floatval', (array) ($p['probabilities'] ?? []));
        arsort($probs);
        return [
            'capability' => $cap, 'supported' => $cap !== 'none' && $conf >= 0.5, 'confidence' => round($conf, 2),
            'probabilities' => array_map(static fn ($v) => round($v, 2), array_slice($probs, 0, 4, true)),
            'description' => self::CAPABILITIES[$cap],
        ];
    }

    /** 기능별로 되묻는 말 — 애매할 때 후보 두 개를 두고 고르게 한다 */
    private const ASK = [
        'assets'       => '이미 만든 장표·화면에 넣을 아이콘·사진 같은 자산을 찾으시나요?',
        'deck_make'    => '자료(PDF·한글·엑셀)를 주고 제안서·발표 장표를 새로 만드시나요?',
        'deck_polish'  => '이미 만든 PPT 초안을 정리된 디자인으로 다듬으시나요?',
        'deck_status'  => '맡겨 둔 장표 작업이 어디까지 됐는지 보시나요?',
        'mock_page'    => '홈페이지 화면(메인·서브) 시안을 만드시나요?',
        'mock_wire'    => '홈페이지 화면 구성(와이어프레임)부터 기획하시나요?',
        'mock_ref'     => '실제 기관 사이트의 디자인을 참고 자료로 보시나요?',
        'guide_tokens' => '색·글꼴·간격 같은 디자인 토큰이 필요하신가요?',
        'guide_parts'  => 'React·Vue 부품 코드나 접근성 지침이 필요하신가요?',
    ];

    /**
     * 판정 결과에 되묻기·대안을 덧붙인다(LLM 호출 없음).
     *  - needs_clarification: 확신이 0.7 미만이거나 1·2위 차이가 0.3 미만이면 true, questions 에 되물을 말
     *  - 지원하지 않는 요청(none)이면 alternatives 에 플랫폼으로 대신 할 수 있는 일
     */
    public static function clarify(string $request, array $s): array
    {
        $probs = (array) ($s['probabilities'] ?? []);
        $vals = array_values($probs);
        $gap = count($vals) >= 2 ? (float) $vals[0] - (float) $vals[1] : 1.0;
        $conf = (float) ($s['confidence'] ?? 0);
        $need = !empty($s['vague']) || (empty($s['rule']) && ($conf < 0.7 || $gap < 0.3));
        $q = [];
        if (!empty($s['vague'])) {
            $q[] = '무엇을 해 드릴까요? 예: "기후위기 제안서 장표 10장", "시청 홈페이지 메인 시안", "민원 아이콘 찾기"';
        }
        if ($need) {
            foreach (array_keys($probs) as $c) {
                if (isset(self::ASK[$c]) && count($q) < 2) {
                    $q[] = self::ASK[$c];
                }
            }
            if ($q === []) {
                $q[] = '어떤 결과물이 필요하신가요? (장표·홈페이지 시안·디자인 자산·부품 코드 중)';
            }
            $q[] = '결과물의 용도(제안 발표·제출 문서·웹 화면)와 마감을 알려 주시면 더 정확히 안내합니다.';
        }
        $s['needs_clarification'] = $need;
        $s['questions'] = $q;
        $s['alternatives'] = ($s['capability'] ?? '') === 'none' || empty($s['supported']) ? self::alternatives($request) : [];
        return $s;
    }

    /** 지원하지 않는 요청에 플랫폼으로 대신 할 수 있는 일(낱말 규칙) */
    private static function alternatives(string $request): array
    {
        $r = mb_strtolower($request);
        $out = [];
        $has = static fn (string $re): bool => preg_match($re, $r) === 1;
        if ($has('/영상|동영상|비디오|video|유튜브|애니메이션|mp4/u')) {
            $out[] = ['what' => '영상 대신 장표와 장별 이미지', 'how' => 'powerDeck 으로 장표를 만든 뒤 산출물 묶음(zip: 완성 PPTX·장별 렌더 PNG)을 받아 영상 편집 도구에 넣습니다. PDF 는 PowerPoint 에서 내보냅니다.', 'start' => 'https://powerplus.hom2box.com/deck'];
            $out[] = ['what' => '발표 대본', 'how' => 'powerDeck 대본 단계에서 장마다 읽을 원고를 받아 내레이션 원고로 씁니다(MCP: deck_get_script_kit).', 'start' => 'https://powerplus.hom2box.com/deck'];
        }
        if ($has('/번역|translate|영문|영어로/u')) {
            $out[] = ['what' => '번역 결과로 장표 만들기', 'how' => '번역은 사용 중인 AI 로 하고, 번역문을 자료로 올려 powerDeck 으로 장표를 만듭니다.', 'start' => 'https://powerplus.hom2box.com/deck'];
        }
        if ($has('/코드|코딩|개발|프로그램|api|서버|배포|db|데이터베이스/u')) {
            $out[] = ['what' => '화면 부품 코드', 'how' => 'powerGuide 의 KRDS 기반 React·Vue 부품 77종 코드를 가져다 씁니다(MCP: guide_get_component).', 'start' => 'https://powerplus.hom2box.com/guide/components'];
            $out[] = ['what' => '홈페이지 시안 HTML', 'how' => 'powerMock 으로 화면 시안을 받아 개발 기준 화면으로 씁니다(MCP: mock_get_replica_kit).', 'start' => 'https://powerplus.hom2box.com/mock'];
        }
        if ($has('/로고/u')) {
            $out[] = ['what' => '기관 로고 찾기', 'how' => '로고를 새로 그리지는 않습니다. powerAssets 에 등록된 기관 로고 545종에서 찾아 씁니다(MCP: assets_search, category=logo).', 'start' => 'https://powerplus.hom2box.com/assets/browse?category=logo'];
        }
        if ($has('/엑셀|스프레드시트|excel|xlsx/u')) {
            $out[] = ['what' => '엑셀 자료로 장표 만들기', 'how' => '엑셀 표 편집은 하지 않습니다. 엑셀 파일을 자료로 올리면 powerDeck 이 표·수치를 읽어 장표로 만듭니다.', 'start' => 'https://powerplus.hom2box.com/deck'];
        }
        if ($has('/디자인|그림|이미지|아이콘|포스터|배너|사진/u')) {
            $out[] = ['what' => '디자인 자산 찾기', 'how' => 'powerAssets 에서 아이콘·사진·일러스트를 찾아 씁니다(MCP: assets_search).', 'start' => 'https://powerplus.hom2box.com/assets'];
        }
        if ($out === []) {
            $out[] = ['what' => '제안서·발표 장표', 'how' => '자료를 올리면 기획·시안·대본까지 만듭니다.', 'start' => 'https://powerplus.hom2box.com/deck'];
            $out[] = ['what' => '홈페이지 화면 시안', 'how' => '기관 종류만 알려 주면 메인·서브 시안을 만듭니다.', 'start' => 'https://powerplus.hom2box.com/mock'];
            $out[] = ['what' => '디자인 자산', 'how' => '아이콘·사진·일러스트를 찾아 PowerPoint 에 넣습니다.', 'start' => 'https://powerplus.hom2box.com/assets'];
        }
        return array_slice($out, 0, 3);
    }

    private static function pick(mixed $ans): ?array
    {
        if (!is_array($ans) || !isset($ans['choice'])) {
            return null;
        }
        return ['value' => (string) $ans['choice'], 'confidence' => round((float) ($ans['confidence'] ?? 0), 2)];
    }
}
