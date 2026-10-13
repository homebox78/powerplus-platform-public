<?php
/**
 * powerMock 기획 와이어프레임 — 홈페이지 화면 한 장의 줄(row)·칸(col, 12칸 격자) 구성.
 *
 * 생각의 출처: powerDeck WireLayout(AI 는 좌표를 쓰지 않고 줄·칸만 정하고, 계산·검사는 서버가 한다).
 * 장표는 16:9 한 판이지만 홈페이지는 세로로 길게 쌓이므로 상자 좌표 대신 "위에서 아래로 줄을 쌓는" 모양으로 바꿨다.
 * 칸 종류(k)는 홈박스 섹션 유형(packages/shared/taxonomy.json section_types) 이름을 그대로 쓴다 — 그래야 이 와이어가
 * 시안 재료(get_replica_kit·assemble_screen)·섹션 패턴(get_section_pattern)과 같은 말로 이어진다.
 *
 * 초안(draft)은 결정적이다(LLM 0): api/data/wire-patterns.json(db/scripts/build-wire-patterns.mjs 가 수집 레퍼런스 게시 화면에서
 * 화면 종류 × 기관 묶음별 채택률·순서·폭·높이를 센 값)과 화면 종류별 필수 섹션, 요청 글의 낱말(넣기·빼기)로 짠다.
 *
 * 모양: { version:1, screen, org, title?, lnb:bool, rows:[{ id, zone: top|body|bottom, cols:[{ span, k, t?, h? }] }] }
 *   - zone top = 머리(마스트헤드·헤더·서브 비주얼·경로·제목), body = 본문(LNB 가 있으면 그 오른쪽), bottom = 만족도·바닥
 *   - span 합은 줄마다 12, h 는 미리보기용 높이(px, 레퍼런스 중앙값)
 */
declare(strict_types=1);

namespace Pp\Mock;

use Pp\Core\Llm;

final class Wire
{
    public const VERSION = 1;

    /** 화면 종류 — label, 패턴 열쇠(수집 page_type), 본문 필수 섹션(순서대로, [k, 라벨?]) */
    public const SCREENS = [
        'main' => ['label' => '메인', 'desc' => '첫 화면 — 비주얼·바로가기·소식·배너', 'body' => []],
        'board_list' => ['label' => '게시판 목록', 'desc' => '공지·보도자료 같은 글 목록', 'body' => [['board_list', '검색·글 목록·쪽 번호']]],
        'board_gallery' => ['label' => '사진 게시판', 'desc' => '썸네일 카드 목록', 'body' => [['photo_gallery', '사진 카드 목록·쪽 번호']]],
        'board_view' => ['label' => '게시글 상세', 'desc' => '제목·본문·첨부·이전/다음 글', 'body' => [['board_view', '제목·작성 정보·본문·첨부']]],
        'form' => ['label' => '신청·등록 폼', 'desc' => '입력 단계·약관 동의·제출', 'body' => [['notice_box', '신청 전 안내'], ['form', '입력 항목·동의·제출']]],
        'content' => ['label' => '콘텐츠 안내', 'desc' => '제목·설명 블록·표로 된 안내', 'body' => [['content_block', '안내 블록'], ['info_table', '안내 표']]],
        'greeting' => ['label' => '인사말', 'desc' => '기관장 사진·인사 글·서명', 'body' => [['greeting_vision', '인사말(기관장 사진·인사 글·서명)']]],
        'org_chart' => ['label' => '조직도', 'desc' => '조직 그림·부서별 담당 업무', 'body' => [['org_chart', '조직도'], ['info_table', '부서·담당 업무·전화']]],
        'location' => ['label' => '찾아오시는 길', 'desc' => '지도·주소·교통편', 'body' => [['location_map', '지도'], ['contact_info', '주소·전화·교통편']]],
        'history' => ['label' => '연혁', 'desc' => '연도별 주요 일', 'body' => [['timeline', '연도별 연혁']]],
        'vision' => ['label' => '비전·목표', 'desc' => '비전·핵심 가치·전략', 'body' => [['content_block', '비전·핵심 가치']]],
        'procedure' => ['label' => '절차 안내', 'desc' => '단계 흐름·필요 서류', 'body' => [['step_flow', '처리 단계'], ['info_table', '필요 서류·수수료']]],
        'faq' => ['label' => '자주 묻는 질문', 'desc' => '분류·검색·질문 펼침', 'body' => [['content_tabs', '질문 분류'], ['faq_list', '질문·답 펼침']]],
        'search' => ['label' => '통합검색 결과', 'desc' => '검색창·분류 탭·결과 목록', 'body' => [['main_search', '검색창'], ['content_tabs', '결과 분류'], ['board_list', '검색 결과']]],
        'sitemap' => ['label' => '사이트맵', 'desc' => '전체 메뉴 펼침', 'body' => [['sitemap', '전체 메뉴']]],
        'info_disclosure' => ['label' => '정보공개', 'desc' => '공개 목록·청구 안내', 'body' => [['content_tabs', '공개 분류'], ['info_table', '공개 목록']]],
    ];

    public const ORGS = [
        'all' => '전체 기관',
        'local' => '지자체·지방의회',
        'central' => '중앙행정기관',
        'public' => '공공기관',
        'education' => '교육청·학교·교육기관',
        'university' => '대학교·전문대학',
        'civic' => '단체·협회·복지',
        'private' => '일반 기업·민간 홈페이지',
    ];

    /** 묶음 표본이 적을 때 빌려 올 묶음(가까운 순) */
    private const ORG_FALLBACK = ['university' => ['education'], 'civic' => ['public'], 'private' => ['public']];

    /**
     * 화면 짜임 스타일 — standard 는 레퍼런스 평균, reference 는 실제 레퍼런스 화면 하나의 줄 구성,
     * 나머지는 메인 화면 원형(수집 섹션 종류만 써서 짠 줄 구성). 원형 줄은 [[k, span, 라벨?], …].
     */
    public const STYLES = [
        'standard' => ['label' => '표준(레퍼런스 평균)', 'desc' => '같은 종류 화면 수백 장의 채택률·순서·폭 평균'],
        'reference' => ['label' => '실제 레퍼런스 구성', 'desc' => '수집 화면 하나의 줄 구성을 그대로 — variant 로 다른 화면'],
        'portal' => ['label' => '포털형(정보 많음)', 'desc' => '검색·바로가기·소식·팝업존을 촘촘히 — 관공서 메인 전형'],
        'llm' => ['label' => 'AI 검색 중심', 'desc' => '큰 검색창·AI 상담이 첫 화면 주인공, 아래로 바로가기·소식'],
        'landing' => ['label' => '랜딩 페이지', 'desc' => '큰 비주얼·핵심 문구·수치·소개 카드·행동 유도 띠'],
        'campus' => ['label' => '대학·캠퍼스', 'desc' => '비주얼·학사 바로가기·학사 일정·소식·캠퍼스 사진·영상'],
        'magazine' => ['label' => '매거진형(사진 중심)', 'desc' => '큰 사진·명소 카드·문구 띠·영상 — 문화·관광 성격'],
        'minimal' => ['label' => '단정한 기업형', 'desc' => '비주얼·회사 소개·사업 카드·소식 몇 줄 — 일반 홈페이지'],
    ];

    /** 스타일 원형 — 메인 화면 본문 줄(머리·바닥은 공통으로 붙음) */
    private const ARCHETYPES = [
        'portal' => [
            [['main_visual', 8], ['popup_zone', 4]],
            [['main_search', 12]],
            [['quick_links', 12]],
            [['news_tabs', 8], ['calendar', 4]],
            [['banner_zone', 12]],
            [['sns_video', 6], ['greeting_vision', 6]],
            [['news_ticker', 12]],
        ],
        'llm' => [
            [['main_search', 12, 'AI 통합 검색 — 질문하듯 묻는 큰 검색창·추천 질문', 360]],
            [['ai_chatbot', 8, 'AI 상담 대화 창(최근 질문·답)'], ['popup_zone', 4, '알림 팝업존']],
            [['quick_links', 12, '분야별·자주 찾는 민원 바로가기']],
            [['news_tabs', 8], ['calendar', 4]],
            [['stat_cards', 12, '이번 주 AI 상담·처리 현황 수치']],
            [['banner_zone', 12]],
        ],
        'landing' => [
            [['hero', 12, '큰 비주얼 + 핵심 문구 + 주 버튼']],
            [['stat_cards', 12, '핵심 수치 3~4개']],
            [['content_block', 4, '소개 카드 1'], ['content_block', 4, '소개 카드 2'], ['content_block', 4, '소개 카드 3']],
            [['photo_gallery', 6, '대표 이미지'], ['content_block', 6, '이야기·설명']],
            [['step_flow', 12, '이용 방법 단계']],
            [['faq_list', 12, '자주 묻는 질문']],
            [['text_band', 12, '행동 유도 띠 — 문구 + 신청·문의 버튼']],
        ],
        'campus' => [
            [['main_visual', 12, '캠퍼스 비주얼·슬로건']],
            [['quick_links', 12, '학사·입학·포털·도서관·학사일정 바로가기']],
            [['news_tabs', 8, '공지·학사·입학·장학 탭'], ['calendar', 4, '학사 일정']],
            [['stats', 12, '학교 현황 수치(학과·재학생·취업률)']],
            [['photo_gallery', 6, '캠퍼스 포토'], ['sns_video', 6, '홍보 영상·SNS']],
            [['banner_zone', 12, '입학·행사 배너']],
        ],
        'magazine' => [
            [['hero', 12, '전면 사진 + 큰 제목']],
            [['text_band', 12, '슬로건 문구 띠']],
            [['tour_cards', 12, '명소·행사 사진 카드']],
            [['sns_video', 8], ['news_tabs', 4, '소식 몇 줄']],
            [['photo_gallery', 12, '사진 모음']],
            [['banner_zone', 12]],
        ],
        'minimal' => [
            [['main_visual', 12, '비주얼 + 한 줄 소개']],
            [['content_block', 6, '회사 소개'], ['stat_cards', 6, '핵심 수치']],
            [['content_block', 4, '사업 카드 1'], ['content_block', 4, '사업 카드 2'], ['content_block', 4, '사업 카드 3']],
            [['news_tabs', 12, '소식 3~4줄']],
            [['text_band', 12, '문의·상담 유도 띠']],
        ],
    ];

    /**
     * 원형 변형 — variant 1·2 에서 갈아 끼울 줄(줄 번호 => 새 줄). 순서만 바꾸면 같은 화면이라 섹션 구성을 바꾼다.
     */
    private const ARCHETYPE_ALT = [
        'portal' => [
            1 => [5 => [['tour_cards', 8, '분야별 소개 카드'], ['greeting_vision', 4]], 6 => [['stats', 12, '주요 현황 수치']]],
            2 => [0 => [['main_visual', 12]], 3 => [['news_tabs', 8], ['popup_zone', 4, '알림판']], 5 => [['sns_video', 12, '영상·SNS 모음']], 6 => [['calendar', 12, '이달의 행사 일정']]],
        ],
        'llm' => [
            1 => [1 => [['ai_chatbot', 12, 'AI 상담 대화 창(최근 질문·답)']], 4 => [['news_ticker', 12, 'AI 추천 소식 띠']]],
            2 => [3 => [['news_tabs', 12]], 4 => [['stats', 12, '분야별 처리 현황']], 5 => [['sns_video', 12]]],
        ],
        'landing' => [
            1 => [3 => [['sns_video', 12, '소개 영상']], 5 => [['location_map', 6, '오시는 길'], ['contact_info', 6, '문의처']]],
            2 => [2 => [['tour_cards', 12, '주요 서비스 카드']], 4 => [['photo_gallery', 12, '후기·사례 사진']]],
        ],
        'campus' => [
            1 => [3 => [['tour_cards', 12, '학과·전공 소개 카드']], 4 => [['sns_video', 8, '홍보 영상'], ['popup_zone', 4, '입학 알림판']]],
            2 => [0 => [['main_visual', 8, '캠퍼스 비주얼'], ['popup_zone', 4, '입학·행사 알림판']], 3 => [['greeting_vision', 6, '총장 인사·비전'], ['stats', 6, '학교 현황 수치']], 5 => [['text_band', 12, '입학 상담 유도 띠']]],
        ],
        'magazine' => [
            1 => [2 => [['photo_gallery', 8, '명소 사진'], ['calendar', 4, '축제 일정']], 3 => [['news_tabs', 12, '소식']]],
            2 => [1 => [['quick_links', 12, '여행 정보 바로가기']], 4 => [['sns_video', 6], ['tour_cards', 6, '추천 코스']]],
        ],
        'minimal' => [
            1 => [1 => [['stat_cards', 12, '핵심 수치']], 3 => [['photo_gallery', 12, '사업 사례 사진']]],
            2 => [2 => [['step_flow', 12, '일하는 방식']], 4 => [['location_map', 6, '오시는 길'], ['contact_info', 6, '문의처']]],
        ],
    ];

    /**
     * 요청 글 낱말 → 스타일. 스타일을 직접 말한 낱말(STYLE_WORDS)이 기관 성격 낱말(STYLE_HINTS)보다 먼저다
     * — '대학 메인 사진 중심 매거진' 은 대학(campus)이 아니라 매거진.
     */
    private const STYLE_WORDS = [
        'llm' => ['llm', 'ai 검색', 'ai검색', '챗봇형', '챗봇 중심', 'gpt', '대화형', '질문하듯', '생성형'],
        'landing' => ['랜딩', '홍보 페이지', '원페이지', '원 페이지', '이벤트 페이지', '캠페인'],
        'magazine' => ['매거진', '감성', '사진 중심'],
        'minimal' => ['미니멀', '단정', '회사소개', '브랜드 사이트'],
        'portal' => ['포털', '정보 많', '촘촘'],
        'campus' => ['캠퍼스형', '캠퍼스 스타일'],
    ];
    private const STYLE_HINTS = [
        'campus' => ['대학', '캠퍼스', '학사', '입학', '전문대'],
        'magazine' => ['관광', '여행', '문화재단', '축제'],
        'minimal' => ['기업', '회사 홈페이지', '스타트업', '일반 홈페이지'],
    ];

    /** 요청 글 낱말 → 섹션 (넣기). '없이·빼고·제외' 가 붙으면 빼기 */
    private const WORDS = [
        'ai_chatbot' => ['챗봇', 'AI 상담', 'ai상담', '인공지능 상담'],
        'main_search' => ['검색'],
        'quick_links' => ['바로가기', '자주 찾는', '퀵메뉴', '아이콘 메뉴'],
        'news_tabs' => ['소식', '공지', '보도자료', '새소식'],
        'popup_zone' => ['팝업존', '팝업'],
        'banner_zone' => ['배너'],
        'calendar' => ['일정', '행사', '달력', '캘린더'],
        'sns_video' => ['SNS', '영상', '유튜브', '인스타'],
        'tour_cards' => ['관광', '여행', '명소', '축제'],
        'stats' => ['통계', '현황 수치', '숫자'],
        'greeting_vision' => ['인사말', '기관장', '시장', '군수', '구청장', '비전'],
        'news_ticker' => ['알림 띠', '롤링', '속보'],
        'hero' => ['큰 사진', '히어로'],
        'text_band' => ['슬로건', '문구 띠', '캐치프레이즈'],
        'photo_gallery' => ['사진', '갤러리', '포토'],
        'location_map' => ['지도', '오시는 길', '오시는길', '위치'],
        'faq_list' => ['FAQ', '자주 묻는'],
        'satisfaction' => ['만족도'],
        'notice_box' => ['안내 상자', '유의사항', '주의사항'],
        'step_flow' => ['절차', '단계'],
        'contact_info' => ['연락처', '문의처', '담당자'],
        'timeline' => ['연혁'],
        'info_table' => ['표'],
        'stat_cards' => ['지표 카드', '수치 카드'],
    ];

    /** 필수 섹션 대신 받아 주는 칸(옛 와이어·레퍼런스가 인사말을 안내 블록으로 그린 경우) */
    private const SUBST = ['greeting_vision' => ['content_block']];

    /** 한 화면에 한 번만 있어야 하는 칸 */
    private const ONCE = ['masthead', 'header', 'footer', 'main_visual', 'hero', 'breadcrumb', 'page_title', 'sub_visual', 'lnb', 'main_search', 'satisfaction', 'skip_nav', 'ai_chatbot', 'sitemap', 'form', 'board_view'];
    private const TOP = ['skip_nav', 'masthead', 'header', 'sub_visual', 'breadcrumb', 'page_title'];
    private const BOTTOM = ['satisfaction', 'footer'];
    private const DEFAULT_H = ['masthead' => 34, 'header' => 140, 'footer' => 300, 'breadcrumb' => 34, 'page_title' => 60, 'sub_visual' => 220, 'satisfaction' => 180,
        'main_visual' => 520, 'board_list' => 760, 'board_view' => 820, 'form' => 900, 'content_block' => 420, 'info_table' => 320, 'org_chart' => 520,
        'location_map' => 420, 'contact_info' => 200, 'timeline' => 620, 'step_flow' => 240, 'faq_list' => 560, 'photo_gallery' => 760, 'sitemap' => 900,
        'content_tabs' => 56, 'notice_box' => 120, 'main_search' => 100];

    private static ?array $data = null;

    public static function data(): array
    {
        if (self::$data === null) {
            self::$data = json_decode((string) @file_get_contents(dirname(__DIR__, 2) . '/data/wire-patterns.json'), true) ?: ['types' => [], 'patterns' => []];
        }
        return self::$data;
    }

    public static function typeName(string $k): string
    {
        return (string) (self::allTypes()[$k]['name'] ?? $k);
    }

    /** 섹션 이름 + 조사(받침 따라) — 괄호 설명은 떼고 붙인다 */
    private static function j(string $k, string $withBatchim, string $without): string
    {
        $name = trim((string) preg_replace('/\s*\(.*\)\s*$/u', '', self::typeName($k)));
        $last = mb_substr($name, -1);
        $code = mb_ord($last) - 0xAC00;
        $has = $code >= 0 && $code <= 11171 ? $code % 28 !== 0 : (bool) preg_match('/[0-9LMNRlmnr]$/', $last);
        return $name . ($has ? $withBatchim : $without);
    }

    /** 칸 종류 묶음 — 화면에서 이 순서로 보인다 */
    public const GROUPS = ['머리', '비주얼', '탐색', '게시판', '콘텐츠', '폼', '데이터', '안내', '부품', '바닥'];

    /** 수집 섹션 유형(taxonomy section_types) → 묶음 */
    private const SECTION_GROUP = [
        'masthead' => '머리', 'header' => '머리', 'skip_nav' => '머리', 'page_title' => '머리',
        'main_visual' => '비주얼', 'hero' => '비주얼', 'sub_visual' => '비주얼', 'popup_zone' => '비주얼', 'banner_zone' => '비주얼', 'text_band' => '비주얼',
        'main_search' => '탐색', 'quick_links' => '탐색', 'lnb' => '탐색', 'content_tabs' => '탐색', 'sitemap' => '탐색', 'floating_quick' => '탐색', 'breadcrumb' => '탐색',
        'news_tabs' => '게시판', 'news_ticker' => '게시판', 'board_list' => '게시판', 'board_view' => '게시판', 'faq_list' => '게시판', 'photo_gallery' => '게시판', 'sns_video' => '게시판',
        'greeting_vision' => '콘텐츠', 'tour_cards' => '콘텐츠', 'content_block' => '콘텐츠', 'timeline' => '콘텐츠', 'org_chart' => '콘텐츠', 'location_map' => '콘텐츠', 'step_flow' => '콘텐츠', 'calendar' => '콘텐츠',
        'form' => '폼', 'satisfaction' => '폼',
        'stats' => '데이터', 'stat_cards' => '데이터', 'info_table' => '데이터',
        'notice_box' => '안내', 'contact_info' => '안내', 'ai_chatbot' => '안내',
        'footer' => '바닥',
    ];

    /**
     * 키트 부품(packages/kit, /guide/components) 가운데 와이어 칸으로 의미 있는 것 — k = "kit_<부품 id>".
     * 섹션 유형과 겹치는 부품(헤더·푸터·공식 배너·건너뛰기·경로·사이드 메뉴·탭·표·단계 표시기·달력)은 섹션 유형 하나로 합쳐 여기 두지 않는다.
     * [이름, 묶음, 미리보기 높이(px)]
     */
    private const KIT_TYPES = [
        'kit_language_switcher' => ['언어 변경', '머리', 60],
        'kit_resize' => ['글자 크기 조절', '머리', 60],
        'kit_tts' => ['음성 읽기', '머리', 60],
        'kit_carousel' => ['캐러셀', '비주얼', 320],
        'kit_aspect_ratio' => ['이미지 자리', '비주얼', 280],
        'kit_input_group' => ['검색 칸', '탐색', 90],
        'kit_pagination' => ['쪽 번호', '탐색', 60],
        'kit_in_page_navigation' => ['콘텐츠 내 탐색', '탐색', 220],
        'kit_card' => ['카드 묶음', '콘텐츠', 280],
        'kit_accordion' => ['아코디언', '콘텐츠', 240],
        'kit_text_list' => ['텍스트 목록', '콘텐츠', 180],
        'kit_structured_list' => ['구조화 목록', '콘텐츠', 220],
        'kit_avatar' => ['인물 목록', '콘텐츠', 180],
        'kit_field' => ['입력 묶음', '폼', 260],
        'kit_combobox' => ['검색 선택 상자', '폼', 90],
        'kit_date_input' => ['날짜 입력', '폼', 90],
        'kit_radio_group' => ['선택 버튼 묶음', '폼', 120],
        'kit_checkbox' => ['동의 체크', '폼', 140],
        'kit_chip' => ['선택 칩', '폼', 80],
        'kit_textarea' => ['긴 글 입력', '폼', 180],
        'kit_file_upload' => ['파일 첨부', '폼', 240],
        'kit_input_otp' => ['인증번호 입력', '폼', 140],
        'kit_data_table' => ['정렬·필터 표', '데이터', 300],
        'kit_progress' => ['진행 막대', '데이터', 80],
        'kit_tag' => ['태그·배지 목록', '데이터', 70],
        'kit_alert' => ['알림 띠', '안내', 80],
        'kit_empty' => ['빈 상태', '안내', 220],
        'kit_help_panel' => ['도움 패널', '안내', 260],
        'kit_tutorial_panel' => ['따라하기 패널', '안내', 260],
        'kit_dialog' => ['모달 자리', '안내', 260],
        'kit_drawer' => ['바텀시트', '안내', 220],
        'kit_button_group' => ['버튼 줄', '부품', 60],
        'kit_toggle_group' => ['보기 전환', '부품', 60],
        'kit_separator' => ['구분선', '부품', 30],
        'kit_skeleton' => ['불러오는 중', '부품', 180],
        'kit_identifier' => ['운영기관 식별자', '바닥', 80],
    ];

    private static ?array $all = null;

    /** 수집 섹션 유형 + 키트 부품 — k => [name, scope, group, kit, h?] */
    private static function allTypes(): array
    {
        if (self::$all === null) {
            $all = [];
            foreach ((array) self::data()['types'] as $k => $t) {
                $all[$k] = ['name' => (string) $t['name'], 'scope' => (string) ($t['scope'] ?? 'common'), 'group' => self::SECTION_GROUP[$k] ?? '콘텐츠', 'kit' => false];
            }
            foreach (self::KIT_TYPES as $k => [$name, $group, $h]) {
                $all[$k] = ['name' => $name, 'scope' => 'common', 'group' => $group, 'kit' => true, 'h' => $h];
            }
            self::$all = $all;
        }
        return self::$all;
    }

    /** 고를 수 있는 칸 종류 [{k, name, scope, group, kit, h?}] — 미분류 제외, 묶음 순서(섹션 유형 먼저, 부품 뒤) */
    public static function types(): array
    {
        $order = array_flip(self::GROUPS);
        $out = [];
        $i = 0;
        foreach (self::allTypes() as $k => $t) {
            if ($k === 'unknown') {
                continue;
            }
            $row = ['k' => $k, 'name' => $t['name'], 'scope' => $t['scope'], 'group' => $t['group'], 'kit' => $t['kit']];
            if (isset($t['h'])) {
                $row['h'] = $t['h'];
            }
            $out[] = [$order[$t['group']] ?? 99, $t['kit'] ? 1 : 0, $i++, $row];
        }
        usort($out, static fn ($a, $b) => [$a[0], $a[1], $a[2]] <=> [$b[0], $b[1], $b[2]]);
        return array_map(static fn ($x) => $x[3], $out);
    }

    public static function options(): array
    {
        $screens = [];
        foreach (self::SCREENS as $id => $s) {
            $screens[] = ['id' => $id, 'label' => $s['label'], 'desc' => $s['desc'], 'samples' => (int) (self::pattern($id, 'all')['n'] ?? 0)];
        }
        $orgs = [];
        foreach (self::ORGS as $id => $l) {
            $orgs[] = ['id' => $id, 'label' => $l];
        }
        $styles = [];
        foreach (self::STYLES as $id => $s) {
            $styles[] = ['id' => $id, 'label' => $s['label'], 'desc' => $s['desc'], 'main_only' => isset(self::ARCHETYPES[$id])];
        }
        return ['screens' => $screens, 'orgs' => $orgs, 'styles' => $styles, 'types' => self::types(), 'groups' => self::GROUPS, 'version' => (string) (self::data()['version'] ?? '')];
    }

    private static function pattern(string $screen, string $org): array
    {
        $p = self::data()['patterns'];
        foreach (array_merge([$org], self::ORG_FALLBACK[$org] ?? []) as $o) {
            $own = $p["{$screen}|{$o}"] ?? null;
            if ($own && (int) $own['n'] >= 15) {
                return $own + ['key' => "{$screen}|{$o}"];
            }
        }
        return ($p["{$screen}|all"] ?? ['n' => 0, 'types' => [], 'pairs' => [], 'lnb' => ['adopt' => 0, 'span' => 3]]) + ['key' => "{$screen}|all"];
    }

    /** 요청 글에서 넣을·뺄 섹션 */
    public static function intents(string $req): array
    {
        $add = [];
        $remove = [];
        $bigK = [];
        $req = mb_strtolower($req);
        foreach (self::WORDS as $k => $words) {
            foreach ($words as $w) {
                $w = mb_strtolower($w);
                $pos = mb_strpos($req, $w);
                if ($pos === false) {
                    continue;
                }
                $tail = mb_substr($req, $pos + mb_strlen($w), 8);
                if (preg_match('/^\s*(은|는|을|를|이|가)?\s*(없이|빼고|빼|제외|말고|없는|필요\s*없)/u', $tail)) {
                    $remove[$k] = true;
                } else {
                    $add[$k] = true;
                    // '바로가기 강조'·'소식을 크게' — 그 칸을 크게
                    if (preg_match('/^\s*(은|는|을|를|이|가|도)?\s*(강조|크게|돋보이|돋보여|눈에\s*띄|넓게)/u', $tail)) {
                        $bigK[$k] = true;
                    }
                }
                break;
            }
        }
        foreach (array_keys($remove) as $k) {
            unset($add[$k]);
        }
        // '큰 검색창'·'검색창이 큰' 처럼 크기를 말하면 그 칸을 주인공 높이로
        $big = array_keys($bigK);
        if (preg_match('/(큰|크게|넓은|커다란)\s*(ai\s*)?(통합\s*)?검색|검색\s*(창|칸|바)?\s*(이|을|를)?\s*(큰|크게|넓게)/u', $req)) {
            $big[] = 'main_search';
        }
        $big = array_values(array_diff(array_unique($big), array_keys($remove)));
        return ['add' => array_keys($add), 'remove' => array_keys($remove), 'big' => $big];
    }

    /** 실제 레퍼런스 줄 구성 목록 — 그 묶음에 있으면 그것, 없으면 가까운 묶음, 그다음 전체 */
    public static function layouts(string $screen, string $org): array
    {
        $p = self::data()['patterns'];
        foreach (array_merge([$org], self::ORG_FALLBACK[$org] ?? [], ['all']) as $o) {
            $l = $p["{$screen}|{$o}"]['layouts'] ?? [];
            if ($l) {
                return ['key' => "{$screen}|{$o}", 'list' => $l];
            }
        }
        return ['key' => '', 'list' => []];
    }

    /** 요청 글 → 스타일(없으면 null) */
    public static function detectStyle(string $req): ?string
    {
        $r = mb_strtolower($req);
        foreach ([self::STYLE_WORDS, self::STYLE_HINTS] as $table) {
            foreach ($table as $s => $words) {
                foreach ($words as $w) {
                    if (mb_strpos($r, $w) !== false) {
                        return $s;
                    }
                }
            }
        }
        return null;
    }

    /**
     * 결정적 초안 — style: auto(요청 글로 고름)·standard·reference·원형(portal·llm·landing·campus·magazine·minimal).
     * variant: reference 는 레퍼런스 화면 번호(0부터), 원형은 줄 순서 섞기 정도. 같은 입력이면 늘 같은 결과.
     */
    public static function draft(string $screen, string $org = 'all', string $req = '', string $style = 'auto', int $variant = 0): array
    {
        if (!isset(self::SCREENS[$screen])) {
            $screen = 'main';
        }
        if (!isset(self::ORGS[$org])) {
            $org = 'all';
        }
        $asked = $style;
        if ($style === 'auto' || !isset(self::STYLES[$style])) {
            $style = self::detectStyle($req) ?? 'standard';
        }
        $isMain = $screen === 'main';
        $note = null;
        // 원형은 메인 화면용 — 서브 화면은 실제 레퍼런스 구성으로 다양성을 낸다
        if (!$isMain && isset(self::ARCHETYPES[$style])) {
            $note = '스타일 원형은 메인 화면용이라 서브 화면은 실제 레퍼런스 구성으로 짰습니다.';
            $style = 'reference';
        }
        $lay = self::layouts($screen, $org);
        if ($style === 'reference' && !$lay['list']) {
            $style = 'standard';
            $note = '이 화면·기관 묶음에는 레퍼런스 구성 표본이 없어 평균 초안으로 짰습니다.';
        }
        $variant = max(0, $variant);
        $count = $style === 'reference' ? count($lay['list']) : (isset(self::ARCHETYPES[$style]) ? 3 : 1);

        if ($style === 'standard') {
            $w = self::draftStandard($screen, $org, $req);
        } else {
            $pat = self::pattern($screen, $org);
            $intent = self::intents($req);
            if ($style === 'reference') {
                $ref = $lay['list'][$variant % $count];
                $srcRows = array_map(static fn (array $r): array => array_map(static fn (array $c): array => [$c['k'], (int) $c['span'], null, (int) ($c['h'] ?? 0)], $r), $ref['rows']);
                $w = self::fromRows($screen, $org, $pat, $srcRows, $intent, (bool) ($ref['lnb'] ?? false), false);
                $w['basis']['reference'] = ['screen_id' => (int) $ref['ref'], 'org_type' => (string) ($ref['ot'] ?? ''), 'pattern' => $lay['key']];
                $w['basis']['note'] = '수집 레퍼런스 화면 하나(' . ($variant % $count + 1) . '/' . $count . ')의 줄 구성을 따랐습니다. 기관 이름·글은 담지 않았습니다.';
            } else {
                $arch = self::ARCHETYPES[$style];
                // 변형: 1·2 = 섹션 구성을 갈아 끼우고, 1 은 두 번째·세 번째 줄 순서도, 2 는 줄 안 칸 좌우도 바꾼다
                $v = $variant % 3;
                foreach (self::ARCHETYPE_ALT[$style][$v] ?? [] as $ri => $row) {
                    if (isset($arch[$ri])) {
                        $arch[$ri] = $row;
                    }
                }
                if ($v === 1 && count($arch) > 3) {
                    [$arch[1], $arch[2]] = [$arch[2], $arch[1]];
                } elseif ($v === 2) {
                    $arch = array_map(static fn (array $r): array => count($r) === 2 ? array_reverse($r) : $r, $arch);
                }
                $srcRows = array_map(static fn (array $r): array => array_map(static fn (array $c): array => [$c[0], $c[1], $c[2] ?? null, (int) ($c[3] ?? 0)], $r), $arch);
                $w = self::fromRows($screen, $org, $pat, $srcRows, $intent, false, true);
                $w['basis']['note'] = self::STYLES[$style]['label'] . ' 원형으로 짠 초안입니다(칸 높이는 레퍼런스 중앙값).';
            }
        }
        $alts = [];
        foreach (self::STYLES as $id => $s) {
            if (!$isMain && isset(self::ARCHETYPES[$id])) {
                continue;
            }
            $alts[] = ['style' => $id, 'label' => $s['label'], 'desc' => $s['desc'], 'variants' => $id === 'reference' ? count($lay['list']) : (isset(self::ARCHETYPES[$id]) ? 3 : 1)];
        }
        $w['style'] = $style;
        $w['variant'] = $variant % max(1, $count);
        $w['basis']['style'] = ['asked' => $asked, 'used' => $style, 'label' => self::STYLES[$style]['label'], 'variant' => $w['variant'], 'variants' => $count];
        if ($note) {
            $w['basis']['style']['note'] = $note;
        }
        $w['basis']['alternatives'] = $alts;
        // 그 기관 묶음 레퍼런스가 모자라 다른 묶음 패턴을 썼으면 밝힌다(예: 단체·복지 → 공공기관)
        $pk = (string) (self::pattern($screen, $org)['key'] ?? '');
        $usedOrg = substr($pk, strpos($pk, '|') + 1);
        if ($usedOrg !== '' && $usedOrg !== $org) {
            $w['basis']['org_fallback'] = (self::ORGS[$org] ?? $org) . ' 레퍼런스가 모자라 ' . (self::ORGS[$usedOrg] ?? $usedOrg) . ' 패턴을 기준으로 짰습니다.';
        }
        if (trim((string) ($w['title'] ?? '')) === '') {
            $w['title'] = trim((self::ORGS[$org] ?? '') . ' ' . (self::SCREENS[$screen]['label'] ?? '') . ' 와이어');
        }
        return $w;
    }

    /** 줄 목록([[k, span, 라벨, h], …])으로 와이어를 만든다 — 머리·바닥·필수 섹션·요청 넣기/빼기를 맞춘다 */
    private static function fromRows(string $screen, string $org, array $pat, array $src, array $intent, bool $lnbRef, bool $archetype): array
    {
        $T = $pat['types'] ?? [];
        $isMain = $screen === 'main';
        $big = $intent['big'] ?? [];
        $hOf = static function (string $k, int $hh = 0) use ($T, $big): int {
            $h = $hh > 0 ? $hh : (int) ($T[$k]['h'] ?? self::DEFAULT_H[$k] ?? 300);
            return in_array($k, $big, true) ? max(320, (int) round($h * 1.3)) : $h;
        };
        $known = self::allTypes();
        $top = [];
        $body = [];
        $bottom = [];
        $seen = [];
        foreach ($src as $r) {
            $cells = [];
            foreach ($r as [$k, $span, $lab, $hh]) {
                if (!isset($known[$k]) || in_array($k, $intent['remove'], true) || in_array($k, ['lnb', 'floating_quick', 'skip_nav', 'unknown'], true)) {
                    continue;
                }
                if (in_array($k, self::ONCE, true) && isset($seen[$k])) {
                    continue;
                }
                $seen[$k] = true;
                $cells[] = ['span' => max(1, min(12, $span)), 'k' => $k, 't' => $lab, 'h' => $hOf($k, $hh)];
            }
            if (!$cells) {
                continue;
            }
            // 빠진 칸의 폭은 가장 넓은 칸이 받는다
            $sum = array_sum(array_column($cells, 'span'));
            if ($sum !== 12) {
                $big = 0;
                foreach ($cells as $i => $c) {
                    if ($c['span'] > $cells[$big]['span']) {
                        $big = $i;
                    }
                }
                $cells[$big]['span'] = max(1, $cells[$big]['span'] + 12 - $sum);
                if (array_sum(array_column($cells, 'span')) !== 12) {
                    $cells = array_map(static fn ($c) => ['span' => 12] + $c, array_slice($cells, 0, 1));
                }
            }
            $hMax = max(array_column($cells, 'h'));
            if (count($cells) > 1) {
                $cells = array_map(static fn ($c) => ['h' => $hMax] + $c, $cells);
            }
            $one = count($cells) === 1 ? $cells[0]['k'] : null;
            if ($one && in_array($one, self::TOP, true)) {
                $top[$one] = $cells;
            } elseif ($one && in_array($one, self::BOTTOM, true)) {
                $bottom[$one] = $cells;
            } else {
                $body[] = $cells;
            }
        }
        // 머리: (표지 띠) + 헤더 + 서브면 서브 비주얼·경로·제목
        $want = [];
        if (isset($top['masthead']) || ($archetype && ($T['masthead']['adopt'] ?? 0) >= 0.2 && !in_array('masthead', $intent['remove'], true))) {
            $want[] = 'masthead';
        }
        $want[] = 'header';
        if (!$isMain) {
            if (isset($top['sub_visual']) || in_array('sub_visual', $intent['add'], true)) {
                $want[] = 'sub_visual';
            }
            $want[] = 'breadcrumb';
            $want[] = 'page_title';
        }
        // 필수 본문 섹션(서브)·요청에 나온 섹션이 없으면 넣는다
        $has = [];
        foreach ($body as $r) {
            foreach ($r as $c) {
                $has[$c['k']] = true;
            }
        }
        $at = 0;
        foreach (self::SCREENS[$screen]['body'] as [$k, $lab]) {
            if (!isset($has[$k])) {
                // 대신 받아 주는 칸(인사말을 안내 블록으로 그린 레퍼런스)이 있으면 그 칸을 바꾼다
                $swapped = false;
                foreach (self::SUBST[$k] ?? [] as $sub) {
                    foreach ($body as $ri => $r) {
                        foreach ($r as $ci => $c) {
                            if (!$swapped && $c['k'] === $sub) {
                                $body[$ri][$ci]['k'] = $k;
                                $body[$ri][$ci]['t'] ??= $lab;
                                $swapped = true;
                            }
                        }
                    }
                }
                if (!$swapped) {
                    array_splice($body, $at, 0, [[['span' => 12, 'k' => $k, 't' => $lab, 'h' => $hOf($k)]]]);
                }
                $has[$k] = true;
            }
            $at++;
        }
        // 기관 성격 묶음: 같은 역할이 연달아 나오면 하나로 — 메인 비주얼 바로 밑 히어로, 배너 줄 3번 이상
        $intentDrop = [];
        $sinceVisual = 99;   // 메인 비주얼 뒤 몇 번째 줄인가
        $bannerRows = 0;
        foreach ($body as $ri => $r) {
            $ks = array_column($r, 'k');
            $sinceVisual++;
            if ($sinceVisual <= 2 && $ks === ['hero']) {
                unset($body[$ri]);
                $intentDrop['hero'] = '메인 비주얼 바로 아래 히어로(같은 역할)';
                continue;
            }
            if ($ks === ['banner_zone'] && ++$bannerRows > 2) {
                unset($body[$ri]);
                $intentDrop['banner_zone'] = '배너 줄 3번째부터(같은 역할 반복)';
                continue;
            }
            if (in_array('main_visual', $ks, true) || in_array('hero', $ks, true)) {
                $sinceVisual = 0;
            }
        }
        $body = array_values($body);
        if ($isMain && !isset($has['main_visual']) && !isset($has['hero']) && !isset($has['main_search']) && !in_array('main_visual', $intent['remove'], true)) {
            array_unshift($body, [['span' => 12, 'k' => 'main_visual', 'h' => $hOf('main_visual')]]);
        }
        $skipped = [];
        foreach ($intent['add'] as $k) {
            $scope = (string) ($known[$k]['scope'] ?? 'common');
            if (isset($has[$k]) || in_array($k, self::TOP, true) || in_array($k, self::BOTTOM, true)) {
                continue;
            }
            if ($scope === 'main' && !$isMain && !self::subAllowsMain($screen, $k)) {
                $skipped[] = $k;
                continue;
            }
            $body[] = [['span' => 12, 'k' => $k, 'h' => $hOf($k)]];
        }
        $wantBottom = [];
        if (!$isMain && (isset($bottom['satisfaction']) || in_array('satisfaction', $intent['add'], true)) && !in_array('satisfaction', $intent['remove'], true)) {
            $wantBottom[] = 'satisfaction';
        }
        $wantBottom[] = 'footer';

        $rows = [];
        $n = 0;
        $mk = static function (string $zone, array $cols) use (&$n): array {
            $n++;
            return ['id' => 'r' . $n, 'zone' => $zone, 'cols' => array_map(static fn (array $c): array => array_filter($c, static fn ($v) => $v !== null), $cols)];
        };
        foreach ($want as $k) {
            $rows[] = $mk('top', $top[$k] ?? [['span' => 12, 'k' => $k, 'h' => $hOf($k)]]);
        }
        foreach ($body as $cols) {
            $rows[] = $mk('body', $cols);
        }
        foreach ($wantBottom as $k) {
            $rows[] = $mk('bottom', $bottom[$k] ?? [['span' => 12, 'k' => $k, 'h' => $hOf($k)]]);
        }
        $lnbAdopt = (float) ($pat['lnb']['adopt'] ?? 0);
        $lnb = !$isMain && ($lnbRef || $lnbAdopt >= 0.5);
        return [
            'version' => self::VERSION, 'screen' => $screen, 'org' => $org, 'lnb' => $lnb, 'rows' => $rows,
            'basis' => ['pattern' => $pat['key'] ?? '', 'samples' => (int) ($pat['n'] ?? 0), 'lnb_adopt' => $lnbAdopt, 'asked' => $intent]
                + ($skipped ? ['skipped' => self::skippedNote($skipped)] : [])
                + ($intentDrop ? ['merged' => array_values($intentDrop)] : []),
        ];
    }

    /** 메인용 섹션이지만 이 서브 화면에서는 써도 되는가 — 화면의 필수 본문이거나, 서브에서도 흔한 섹션 */
    private static function subAllowsMain(string $screen, string $k): bool
    {
        if (in_array($k, ['main_search', 'quick_links', 'banner_zone'], true)) {
            return true;
        }
        foreach (self::SCREENS[$screen]['body'] ?? [] as [$bk]) {
            if ($bk === $k) {
                return true;
            }
        }
        return $k === 'greeting_vision' && in_array($screen, ['greeting', 'vision'], true);
    }

    /** 요청에서 넣으라 했지만 이 화면에는 안 넣은 섹션 안내 */
    private static function skippedNote(array $ks): string
    {
        $names = array_map(static fn (string $k): string => self::typeName($k), $ks);
        return '요청한 섹션(' . implode('·', $names) . ')은 메인 화면용이라 이 서브 화면에는 넣지 않았습니다 — 꼭 필요하면 와이어에서 칸을 직접 추가하세요.';
    }

    /** 평균 초안(레퍼런스 채택률·순서·폭) */
    private static function draftStandard(string $screen, string $org = 'all', string $req = ''): array
    {
        if (!isset(self::SCREENS[$screen])) {
            $screen = 'main';
        }
        if (!isset(self::ORGS[$org])) {
            $org = 'all';
        }
        $pat = self::pattern($screen, $org);
        $T = $pat['types'];
        $types = self::allTypes();
        $intent = self::intents($req);
        $isMain = $screen === 'main';
        $h = static fn (string $k): int => in_array($k, $intent['big'], true) ? max(320, (int) round(((int) ($T[$k]['h'] ?? self::DEFAULT_H[$k] ?? 300)) * 1.3)) : (int) ($T[$k]['h'] ?? self::DEFAULT_H[$k] ?? 300);
        $label = static fn (string $k): string => self::typeName($k);

        // 머리
        $top = [];
        if (($T['masthead']['adopt'] ?? 0) >= 0.2 && !in_array('masthead', $intent['remove'], true)) {
            $top[] = 'masthead';
        }
        $top[] = 'header';
        if (!$isMain) {
            if (($T['sub_visual']['adopt'] ?? 0) >= 0.25 || in_array('sub_visual', $intent['add'], true)) {
                $top[] = 'sub_visual';
            }
            $top[] = 'breadcrumb';
            $top[] = 'page_title';
        }

        // 본문 후보: 필수 + 채택률 높은 것 + 요청에 나온 것
        $body = [];   // k => [label, pos]
        foreach (self::SCREENS[$screen]['body'] as $i => [$k, $lab]) {
            $body[$k] = ['t' => $lab, 'pos' => 0.3 + $i * 0.01, 'req' => true];
        }
        if ($isMain) {
            $body['main_visual'] = ['t' => null, 'pos' => -1.0, 'req' => true];
        }
        $cut = $isMain ? 0.25 : 0.3;
        foreach ($T as $k => $v) {
            $scope = (string) ($types[$k]['scope'] ?? 'common');
            if (isset($body[$k]) || in_array($k, self::TOP, true) || in_array($k, self::BOTTOM, true) || in_array($k, ['lnb', 'floating_quick', 'skip_nav', 'unknown'], true)) {
                continue;
            }
            if ($scope === ($isMain ? 'sub' : 'main')) {
                continue;
            }
            if ((float) $v['adopt'] >= $cut) {
                $body[$k] = ['t' => null, 'pos' => (float) $v['pos'], 'req' => false];
            }
        }
        $skipped = [];
        foreach ($intent['add'] as $k) {
            $scope = (string) ($types[$k]['scope'] ?? 'common');
            if (isset($body[$k]) || in_array($k, self::TOP, true) || in_array($k, self::BOTTOM, true)) {
                continue;
            }
            if ($scope === 'main' && !$isMain && !self::subAllowsMain($screen, $k)) {
                $skipped[] = $k;
                continue;
            }
            $body[$k] = ['t' => null, 'pos' => (float) ($T[$k]['pos'] ?? 0.5), 'req' => false, 'asked' => true];
        }
        foreach ($intent['remove'] as $k) {
            if (isset($body[$k]) && empty($body[$k]['req'])) {
                unset($body[$k]);
            }
        }
        uasort($body, static fn ($a, $b) => $a['pos'] <=> $b['pos']);

        // 같은 줄에 놓이는 짝(레퍼런스에서 6% 이상 같은 줄)
        $order = array_keys($body);
        $placed = [];
        $rowsBody = [];
        foreach ($order as $k) {
            if (isset($placed[$k])) {
                continue;
            }
            $placed[$k] = true;
            $partner = null;
            $best = 0.0;
            if ($isMain) {
                foreach ($pat['pairs'] as $pr) {
                    if (!in_array($k, $pr['types'], true) || count($pr['types']) !== 2) {
                        continue;
                    }
                    $o = $pr['types'][0] === $k ? $pr['types'][1] : $pr['types'][0];
                    // 둘 다 보통 폭 가득(12)이 아닌 섹션일 때만 한 줄로 — 바로가기처럼 늘 가득 차는 띠는 짝을 짓지 않는다
                    $wide = static fn (string $t): bool => (int) ($T[$t]['span'] ?? 12) >= 11;
                    if ($o === $k || !isset($body[$o]) || isset($placed[$o]) || $wide($k) || $wide($o) || (float) $pr['rate'] <= $best || (float) $pr['rate'] < 0.06) {
                        continue;
                    }
                    $partner = $o;
                    $best = (float) $pr['rate'];
                }
            }
            if ($partner) {
                $placed[$partner] = true;
                $a = max(3, (int) ($T[$k]['span'] ?? 6));
                $b = max(3, (int) ($T[$partner]['span'] ?? 6));
                $sa = (int) round($a / ($a + $b) * 12);
                $sa = max(3, min(9, $sa));
                $hh = max($h($k), $h($partner));
                $rowsBody[] = [['span' => $sa, 'k' => $k, 't' => $body[$k]['t'], 'h' => $hh], ['span' => 12 - $sa, 'k' => $partner, 't' => $body[$partner]['t'], 'h' => $hh]];
            } else {
                $rowsBody[] = [['span' => 12, 'k' => $k, 't' => $body[$k]['t'], 'h' => $h($k)]];
            }
        }

        $bottom = [];
        if (!$isMain && (($T['satisfaction']['adopt'] ?? 0) >= 0.1 || in_array('satisfaction', $intent['add'], true)) && !in_array('satisfaction', $intent['remove'], true)) {
            $bottom[] = 'satisfaction';
        }
        $bottom[] = 'footer';

        $rows = [];
        $n = 0;
        $mk = static function (string $zone, array $cols) use (&$n): array {
            $n++;
            return ['id' => 'r' . $n, 'zone' => $zone, 'cols' => array_map(static fn (array $c): array => array_filter($c, static fn ($v) => $v !== null), $cols)];
        };
        foreach ($top as $k) {
            $rows[] = $mk('top', [['span' => 12, 'k' => $k, 'h' => $h($k)]]);
        }
        foreach ($rowsBody as $cols) {
            $rows[] = $mk('body', $cols);
        }
        foreach ($bottom as $k) {
            $rows[] = $mk('bottom', [['span' => 12, 'k' => $k, 'h' => $h($k)]]);
        }
        $lnbAdopt = (float) ($pat['lnb']['adopt'] ?? 0);
        $lnb = !$isMain && $lnbAdopt >= 0.5 && !preg_match('/(lnb|왼쪽\s*메뉴|좌측\s*메뉴)\s*(없이|빼고|제외)/u', $req);

        return [
            'version' => self::VERSION, 'screen' => $screen, 'org' => $org, 'lnb' => $lnb,
            'rows' => $rows,
            'basis' => [
                'pattern' => $pat['key'], 'samples' => (int) ($pat['n'] ?? 0), 'lnb_adopt' => $lnbAdopt,
                'asked' => $intent,
                'note' => '레퍼런스 게시 화면 ' . (int) ($pat['n'] ?? 0) . '장의 섹션 채택률·순서·폭으로 짠 초안입니다.',
            ] + ($skipped ? ['skipped' => self::skippedNote($skipped)] : []),
        ];
    }

    /** 받은 와이어를 정리 — 모르는 칸 버림, 칸 폭 1~12, 줄 합 12 로 맞춤, 빈 줄 버림 */
    /** 칸 폭 합을 12로 — 비율대로 나눈 뒤 모자라면 작은 칸에, 넘치면 큰 칸에서. normalize·check 가 같이 쓴다. */
    private static function rebalance(array $spans): array
    {
        $spans = array_values(array_map(static fn ($s) => max(1, min(12, (int) $s)), $spans));
        $sum = array_sum($spans);
        if (!$spans || $sum === 12) {
            return $spans;
        }
        $sp = array_map(static fn ($s) => max(1, (int) round($s / $sum * 12)), $spans);
        $d = 12 - array_sum($sp);
        $guard = 0;
        while ($d !== 0 && $guard++ < 24) {
            $i = $d > 0 ? array_search(min($sp), $sp, true) : array_search(max($sp), $sp, true);
            $sp[$i] += $d > 0 ? 1 : -1;
            $d += $d > 0 ? -1 : 1;
        }
        return $sp;
    }

    public static function normalize(array $w): array
    {
        $types = self::allTypes();
        $screen = isset(self::SCREENS[(string) ($w['screen'] ?? '')]) ? (string) $w['screen'] : 'main';
        $org = isset(self::ORGS[(string) ($w['org'] ?? '')]) ? (string) $w['org'] : 'all';
        $rows = [];
        $n = 0;
        foreach (array_slice((array) ($w['rows'] ?? []), 0, 40) as $r) {
            if (!is_array($r)) {
                continue;
            }
            $cols = [];
            foreach (array_slice((array) ($r['cols'] ?? []), 0, 6) as $c) {
                if (!is_array($c)) {
                    continue;
                }
                $k = (string) ($c['k'] ?? '');
                if (!isset($types[$k]) || $k === 'unknown') {
                    continue;
                }
                $col = ['span' => max(1, min(12, (int) ($c['span'] ?? 12))), 'k' => $k];
                $t = trim(mb_substr((string) ($c['t'] ?? ''), 0, 60));
                if ($t !== '') {
                    $col['t'] = $t;
                }
                $hh = (int) ($c['h'] ?? 0);
                $col['h'] = $hh > 0 ? max(24, min(2000, $hh)) : (int) (self::DEFAULT_H[$k] ?? 300);
                $cols[] = $col;
            }
            if (!$cols) {
                continue;
            }
            $sum = array_sum(array_column($cols, 'span'));
            if ($sum !== 12) {
                $sp = self::rebalance(array_column($cols, 'span'));
                foreach ($cols as $i => &$c) {
                    $c['span'] = $sp[$i];
                }
                unset($c);
            }
            $zone = in_array($r['zone'] ?? '', ['top', 'body', 'bottom'], true) ? (string) $r['zone'] : 'body';
            $n++;
            $rows[] = ['id' => preg_match('/^[a-z0-9_-]{1,12}$/i', (string) ($r['id'] ?? '')) ? (string) $r['id'] : 'r' . $n, 'zone' => $zone, 'cols' => $cols];
        }
        // id 겹침 정리
        $seen = [];
        foreach ($rows as $i => &$r) {
            if (isset($seen[$r['id']])) {
                $r['id'] = 'r' . ($i + 1) . 'x';
            }
            $seen[$r['id']] = true;
        }
        unset($r);
        $out = ['version' => self::VERSION, 'screen' => $screen, 'org' => $org, 'lnb' => !empty($w['lnb']), 'rows' => $rows];
        $title = trim(mb_substr((string) ($w['title'] ?? ''), 0, 120));
        if ($title !== '') {
            $out['title'] = $title;
        }
        if (isset(self::STYLES[(string) ($w['style'] ?? '')])) {
            $out['style'] = (string) $w['style'];
            $out['variant'] = max(0, (int) ($w['variant'] ?? 0));
        }
        return $out;
    }

    /**
     * 판정 — 점수 100 에서 깎는다. error 가 하나라도 있으면 미통과, 80점 이상이어야 통과.
     * 받은 그대로(normalize 전) 줄 합·모르는 칸도 본다.
     */
    public static function check(array $raw): array
    {
        $types = self::allTypes();
        $issues = [];
        $score = 100;
        // 랜딩·기업형·매거진 원형은 안내 블록·FAQ·절차 같은 섹션을 메인에 쓰는 것이 정상이다
        $style = (string) ($raw['style'] ?? '');
        $free = in_array($style, ['landing', 'minimal', 'magazine'], true);
        // 원형이 원래 쓰는 섹션 — 그 원형의 화면이면 범위 경고를 하지 않는다(캠퍼스 포토 등)
        $archTypes = [];   // 원형 => [k => true]
        foreach (self::ARCHETYPES as $a => $rowsA) {
            foreach (array_merge([$rowsA], array_map(static fn ($alt) => array_values($alt), self::ARCHETYPE_ALT[$a] ?? [])) as $set) {
                foreach ($set as $rowA) {
                    foreach ($rowA as $cell) {
                        $archTypes[$a][$cell[0]] = true;
                    }
                }
            }
        }
        $rowCount = [];
        // 같은 문제는 줄마다 따로 쓰지 않고 한 항목으로 — $group 이 같으면 줄 번호만 모은다(점수도 한 번)
        $groups = [];
        $add = static function (string $sev, string $code, string $msg, string $fix, ?int $row = null, ?string $group = null) use (&$issues, &$score, &$groups): void {
            if ($group !== null && isset($groups[$group])) {
                if ($row !== null) {
                    $issues[$groups[$group]]['rows'][] = $row;
                }
                return;
            }
            $issues[] = array_filter(['sev' => $sev, 'code' => $code, 'row' => $row, 'msg' => $msg, 'fix' => $fix], static fn ($v) => $v !== null)
                + ($group !== null ? ['rows' => $row !== null ? [$row] : []] : []);
            if ($group !== null) {
                $groups[$group] = count($issues) - 1;
            }
            $score -= ['error' => 15, 'warn' => 5, 'info' => 0][$sev];
        };
        // 모르는 칸 이름은 받은 그대로 되풀이하지 않는다(태그·꺾쇠 제거, 64자)
        $safeK = static function (string $k): string {
            $k = trim(str_replace(['<', '>'], '', strip_tags($k)));
            return mb_strlen($k) > 64 ? mb_substr($k, 0, 64) . '…' : $k;
        };
        $screen = (string) ($raw['screen'] ?? '');
        if (!isset(self::SCREENS[$screen])) {
            $add('error', 'screen', '화면 종류(screen)가 없거나 모르는 값입니다.', '다음 중 하나를 쓰세요: ' . implode(', ', array_keys(self::SCREENS)) . '.');
            $screen = 'main';
        }
        $isMain = $screen === 'main';
        $rows = array_values(array_filter((array) ($raw['rows'] ?? []), 'is_array'));
        if (!$rows) {
            $add('error', 'empty', '줄이 하나도 없습니다.', '머리·본문·바닥 줄을 넣으세요.');
            return ['score' => 0, 'pass' => false, 'issues' => $issues, 'stats' => ['rows' => 0, 'cells' => 0, 'body_rows' => 0]];
        }
        $seq = [];   // [rowIndex, k, zone]
        $count = [];
        $cells = 0;
        $bodyRows = 0;
        foreach ($rows as $i => $r) {
            $cols = array_values(array_filter((array) ($r['cols'] ?? []), 'is_array'));
            $zone = (string) ($r['zone'] ?? 'body');
            if (!$cols) {
                $add('warn', 'empty_row', '{rows}번째 줄이 비어 있습니다.', '칸을 넣거나 줄을 지우세요.', $i, 'empty_row');
                continue;
            }
            if ($zone === 'body') {
                $bodyRows++;
            }
            $sum = 0;
            foreach ($cols as $c) {
                $k = (string) ($c['k'] ?? '');
                $span = (int) ($c['span'] ?? 0);
                $sum += $span;
                $cells++;
                if (!isset($types[$k]) || $k === 'unknown') {
                    $sk = $safeK($k);
                    $add('error', 'unknown_type', "{rows}번째 줄의 칸 종류 '{$sk}' 를 모릅니다.", '섹션 유형 목록(types)의 k 를 쓰세요.', $i, 'unknown_type|' . $sk);
                    continue;
                }
                if ($span < 1 || $span > 12) {
                    $add('error', 'span', '{rows}번째 줄 ' . self::typeName($k) . ' 칸 폭이 1~12 밖입니다.', '칸 폭은 12칸 격자의 1~12 입니다.', $i, 'span|' . $k);
                } elseif ($span < 3 && count($cols) > 1) {
                    $add('warn', 'narrow', '{rows}번째 줄 ' . self::typeName($k) . ' 칸이 너무 좁습니다(3칸 미만).', '3칸 이상으로 넓히거나 다른 칸과 합치세요.', $i, 'narrow|' . $k);
                }
                $scope = (string) ($types[$k]['scope'] ?? 'common');
                if ($scope === 'main' && !$isMain && !self::subAllowsMain($screen, $k)) {
                    $add('warn', 'scope', self::j($k, "은", "는") . ' 메인 화면에 쓰는 섹션입니다({rows}번째 줄).', '서브 화면에서는 빼거나 서브용 섹션으로 바꾸세요.', $i, 'scope|' . $k);
                }
                if ($scope === 'sub' && $isMain && !$free && $k !== 'content_tabs' && empty($archTypes[$style][$k])) {
                    $inArch = [];
                    foreach ($archTypes as $a => $ks) {
                        if (!empty($ks[$k])) {
                            $inArch[] = $a;
                        }
                    }
                    if ($inArch) {
                        // 원형(캠퍼스·랜딩 등)이 메인에 쓰는 섹션 — 감점 없이 알려만 준다
                        $add('info', 'scope', self::j($k, "은", "는") . ' 보통 서브 화면 섹션이지만 ' . implode('·', $inArch) . ' 원형 메인에서도 씁니다({rows}번째 줄).', '그 원형이 의도라면 style 을 ' . $inArch[0] . ' 으로 넘기면 경고가 사라집니다.', $i, 'scope|' . $k);
                    } else {
                        $add('warn', 'scope', self::j($k, "은", "는") . ' 서브 화면에 쓰는 섹션입니다({rows}번째 줄).', '메인에서는 빼거나 메인용 섹션으로 바꾸세요.', $i, 'scope|' . $k);
                    }
                }
                $count[$k] = ($count[$k] ?? 0) + 1;
                $rowCount[$k][$i] = true;   // 같은 줄 카드 여러 칸은 반복 한 번으로
                $seq[] = [$i, $k, $zone];
            }
            if ($sum !== 12) {
                $spans = array_map(static fn ($c) => (int) ($c['span'] ?? 0), $cols);
                $fixed = self::rebalance($spans);
                $add('error', 'row_sum', ($i + 1) . "번째 줄 칸 폭 합이 {$sum} 입니다(12 여야 함). 저장할 때는 자동으로 고침: " . implode('+', $spans) . ' → ' . implode('+', $fixed) . '.',
                    '줄마다 칸 폭 합을 12로 맞추세요(자동 고침을 그대로 쓰려면 고친 값으로 보내면 됩니다).', $i);
                $issues[count($issues) - 1]['auto_fix'] = $fixed;
            }
            if (count($cols) > 4) {
                $add('warn', 'too_many_cols', '{rows}번째 줄에 칸이 5개 이상입니다.', '한 줄은 4칸까지 — 모바일에서 읽히지 않습니다.', $i, 'too_many_cols');
            }
        }
        // 필수
        $need = ['header', 'footer'];
        if ($isMain) {
            $need[] = 'main_visual';
        } else {
            $need[] = 'page_title';
            foreach (self::SCREENS[$screen]['body'] as [$k]) {
                $need[] = $k;
            }
        }
        $bodyNeed = self::SCREENS[$screen]['body'];
        $core = $bodyNeed ? (string) $bodyNeed[count($bodyNeed) - 1][0] : '';   // 그 화면을 정의하는 섹션(마지막 필수)
        foreach (array_unique($need) as $k) {
            if (empty($count[$k])) {
                if ($k === 'main_visual' && (!empty($count['hero']) || ($style === 'llm' && !empty($count['main_search'])))) {
                    continue;
                }
                $sub = array_values(array_filter(self::SUBST[$k] ?? [], static fn ($s) => !empty($count[$s])));
                if ($sub) {
                    $add('info', 'missing', self::j($k, "이", "가") . ' 없고 ' . self::typeName($sub[0]) . ' 칸이 대신합니다.', self::SCREENS[$screen]['label'] . ' 화면은 ' . self::typeName($k) . ' 칸으로 두면 더 정확합니다.');
                    continue;
                }
                $sev = in_array($k, ['header', 'footer', 'page_title', 'main_visual'], true) || $k === $core ? 'error' : 'warn';
                $add($sev, 'missing', self::j($k, "이", "가") . ' 없습니다.', self::SCREENS[$screen]['label'] . ' 화면에는 ' . self::j($k, "이", "가") . ' 있어야 합니다.');
            }
        }
        if (!$isMain && empty($count['breadcrumb'])) {
            $add('warn', 'missing', '경로(브레드크럼)가 없습니다.', '서브 화면 제목 위에 현재 위치를 보여 주세요.');
        }
        // 한 번만
        foreach ($count as $k => $c) {
            if ($c > 1 && in_array($k, self::ONCE, true)) {
                $add('error', 'duplicate', self::j($k, "이", "가") . " {$c}번 나옵니다.", '한 화면에 하나만 두세요.');
            } elseif (($c = count($rowCount[$k] ?? [])) > 2) {
                $add('warn', 'repeat', self::j($k, "이", "가") . " {$c}개 줄에 반복됩니다.", '같은 역할은 두 번까지 — 하나로 합치거나 다른 역할로 바꾸세요.');
            }
        }
        // 순서
        if ($seq) {
            $first = $seq[0][1];
            $last = $seq[count($seq) - 1][1];
            if (!in_array($first, ['masthead', 'skip_nav', 'header'], true)) {
                $add('error', 'order', '맨 위가 헤더가 아닙니다(' . self::typeName($first) . ').', '헤더(또는 마스트헤드)를 맨 위로 올리세요.', $seq[0][0]);
            }
            if ($last !== 'footer') {
                $add('error', 'order', '맨 아래가 푸터가 아닙니다(' . self::typeName($last) . ').', '푸터를 맨 아래로 내리세요.', $seq[count($seq) - 1][0]);
            }
            $pos = [];
            foreach ($seq as $j => [, $k]) {
                $pos[$k] ??= $j;
            }
            if (isset($pos['masthead'], $pos['header']) && $pos['masthead'] > $pos['header']) {
                $add('warn', 'order', '마스트헤드가 헤더 아래에 있습니다.', '공식 누리집 띠(마스트헤드)는 헤더 위에 둡니다.');
            }
            if (isset($pos['breadcrumb'], $pos['page_title']) && $pos['breadcrumb'] > $pos['page_title'] + 1) {
                $add('warn', 'order', '경로가 제목보다 한참 아래에 있습니다.', '경로는 제목 바로 위·옆에 둡니다.');
            }
            if (!$isMain && isset($pos['page_title'])) {
                foreach (self::SCREENS[$screen]['body'] as [$k]) {
                    if (isset($pos[$k]) && $pos[$k] < $pos['page_title']) {
                        $add('warn', 'order', self::j($k, "이", "가") . ' 페이지 제목보다 위에 있습니다.', '본문은 제목 아래에 둡니다.');
                    }
                }
            }
            if ($isMain && isset($pos['main_visual']) && $pos['main_visual'] > 4) {
                $add('warn', 'order', '메인 비주얼이 너무 아래에 있습니다.', '첫 화면(헤더 바로 아래)에 두세요.');
            }
        }
        if ($bodyRows < ($isMain ? 3 : 1)) {
            $add('warn', 'thin', '본문 줄이 ' . $bodyRows . '개뿐입니다.', $isMain ? '메인은 바로가기·소식·배너처럼 본문 줄 3개 이상이 보통입니다.' : '본문 줄을 넣으세요.');
        }
        if (count($rows) > 18) {
            $add('warn', 'too_long', '줄이 ' . count($rows) . '개로 너무 깁니다.', '비슷한 줄을 합쳐 18줄 이하로 줄이세요.');
        }
        if (!$isMain && empty($raw['lnb']) && ($screen !== 'search' && $screen !== 'sitemap')) {
            $org = isset(self::ORGS[(string) ($raw['org'] ?? '')]) ? (string) $raw['org'] : 'all';
            $pt = self::pattern($screen, $org);
            $adopt = (float) ($pt['lnb']['adopt'] ?? 0);
            $pct = (int) round($adopt <= 1 ? $adopt * 100 : $adopt);
            if ($pct >= 50) {
                $add('info', 'lnb', '왼쪽 메뉴(LNB)가 꺼져 있습니다.', '같은 화면 레퍼런스 ' . (int) ($pt['n'] ?? 0) . "곳 중 {$pct}%가 왼쪽 메뉴를 둡니다 — 의도라면 그대로 두세요.");
            } elseif ($pct > 0) {
                $add('info', 'lnb', '왼쪽 메뉴(LNB)가 꺼져 있습니다.', '같은 화면 레퍼런스 ' . (int) ($pt['n'] ?? 0) . "곳 중 왼쪽 메뉴를 두는 곳은 {$pct}%뿐이라 없어도 괜찮습니다.");
            }
        }
        if (count($rows) > 40) {
            $add('info', 'truncated', '줄이 ' . count($rows) . '개입니다 — 판정은 전부 봤지만 저장하면 앞 40줄만 남습니다.', '40줄 안으로 줄이세요.');
        }
        // 모은 줄 번호를 글에 채운다(10개 넘으면 "외 N줄")
        foreach ($issues as &$it) {
            if (!array_key_exists('rows', $it)) {
                continue;
            }
            $rs = array_values(array_unique($it['rows']));
            $shown = array_map(static fn ($r) => (string) ($r + 1), array_slice($rs, 0, 10));
            $label = implode('·', $shown);
            $more = count($rs) > 10 ? ' 외 ' . (count($rs) - 10) . '줄' : '';
            $it['msg'] = str_replace(['{rows}번째 줄', '{rows}'], [$label . '번째 줄' . $more, $label . $more], $it['msg']);
            if (count($rs) === 1) {
                $it['row'] = $rs[0];
                unset($it['rows']);
            } else {
                $it['rows'] = array_slice($rs, 0, 40);   // 응답 크기 — 줄 번호는 40개까지
                if (count($rs) > 40) {
                    $it['rows_total'] = count($rs);
                }
                unset($it['row']);
            }
        }
        unset($it);
        $score = max(0, min(100, $score));
        $errors = count(array_filter($issues, static fn ($x) => $x['sev'] === 'error'));
        return ['score' => $score, 'pass' => $errors === 0 && $score >= 80, 'issues' => $issues,
            'stats' => ['rows' => count($rows), 'cells' => $cells, 'body_rows' => $bodyRows]];
    }

    /**
     * AI 다듬기 — 요청 글을 반영해 줄 구성을 고친다. 실패하거나 판정이 나빠지면 null(초안 그대로 쓴다).
     */
    public static function refine(array $draft, string $req): ?array
    {
        if (trim($req) === '') {
            return null;
        }
        $allowed = [];
        foreach (self::types() as $t) {
            $allowed[] = $t['k'] . '=' . $t['name'];
        }
        $plain = ['screen' => $draft['screen'], 'lnb' => $draft['lnb'], 'rows' => $draft['rows']];
        $sys = "너는 공공기관 홈페이지 정보설계(IA) 기획자다. 홈페이지 한 화면의 와이어프레임을 JSON 으로만 고친다.\n"
            . "규칙: 줄(rows)은 위에서 아래 순서, 각 줄 zone 은 top|body|bottom, cols 의 span 합은 12, k 는 아래 목록의 섹션 id 만, t 는 칸 안에 들어갈 내용을 짧은 한국어로(30자 이내).\n"
            . "헤더는 맨 위, 푸터는 맨 아래. 한 줄은 4칸까지. 요청에 없는 섹션을 함부로 지우지 말고, 레퍼런스 초안의 순서를 크게 흔들지 마라.\n"
            . "섹션 목록: " . implode(', ', $allowed) . "\n"
            . "답은 {\"rows\":[...]} JSON 하나만. 설명 글 금지.";
        $user = "요청: " . mb_substr($req, 0, 800) . "\n\n초안(레퍼런스 기반):\n" . json_encode($plain, JSON_UNESCAPED_UNICODE);
        $text = Llm::chat([['role' => 'system', 'content' => $sys], ['role' => 'user', 'content' => $user]], 1800, 45);
        if ($text === null) {
            return null;
        }
        if (preg_match('/\{.*\}/su', $text, $m)) {
            $text = $m[0];
        }
        $j = json_decode($text, true);
        if (!is_array($j) || empty($j['rows']) || !is_array($j['rows'])) {
            return null;
        }
        $cand = self::normalize(['screen' => $draft['screen'], 'org' => $draft['org'], 'lnb' => $j['lnb'] ?? $draft['lnb'], 'rows' => $j['rows']]);
        $c1 = self::check($cand);
        $c0 = self::check($draft);
        if (!$c1['pass'] || $c1['score'] < $c0['score'] - 10) {
            return null;
        }
        return $cand;
    }

    /** 시안 재료 요청문(MCP) — 이 와이어로 시안을 만들 때 AI 에게 붙여 넣는 글 */
    public static function prompt(array $w, string $req = ''): string
    {
        $lines = [];
        foreach ($w['rows'] as $i => $r) {
            $parts = [];
            foreach ($r['cols'] as $c) {
                $parts[] = self::typeName($c['k']) . "({$c['k']}, {$c['span']}/12" . (!empty($c['t']) ? ', ' . $c['t'] : '') . ')';
            }
            $lines[] = ($i + 1) . '. [' . $r['zone'] . '] ' . implode(' | ', $parts);
        }
        $screen = self::SCREENS[$w['screen']]['label'] ?? $w['screen'];
        return "powerMock 으로 " . self::ORGS[$w['org']] . " 홈페이지의 '{$screen}' 화면 시안을 만들어 줘."
            . ($req !== '' ? "\n요청: {$req}" : '')
            . "\n아래 와이어프레임의 줄 순서와 칸 폭(12칸 격자)을 지켜 줘." . (!empty($w['lnb']) ? ' 본문 왼쪽에 LNB(왼쪽 메뉴)를 둔다.' : '')
            . "\n" . implode("\n", $lines)
            . "\n순서: mock_get_replica_kit 으로 재료를 받고 → 이 구성대로 만들고 → mock_check_mockup 으로 판정 → 통과하면 mock_publish_mockup.";
    }
}
