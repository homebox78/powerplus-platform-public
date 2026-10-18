<?php
/**
 * powerMock 기획 와이어 "내용 보기" — 칸마다 그 기관 묶음에 맞는 예시 글(제목·한 줄·목록)과 샘플 그림 종류를 채운다.
 *
 * 출처: services/mockref-api/src/SampleContent.php(persona·kindProfile·인사말 첫 문장·게시물 제목 표본)와
 *       services/mockref-api/src/Samples.php(FOR_SECTION 섹션별 샘플 그림 종류)에서 와이어에 필요한 만큼만 옮겼다.
 *       mockref 는 따로 배포되는 서비스라 api 에서 직접 부르지 않는다 — 문구를 바꾸면 양쪽을 같이 본다.
 * 가상 기관만 쓴다(한빛시·미래혁신부…, 전화 1234-5678). 실제 기관·인물 이름은 넣지 않는다.
 * 결정적이다(LLM 0) — 같은 와이어면 늘 같은 글. 슬로건은 기관 말투마다 5개 이상에서 화면·스타일·변형으로 고른다.
 */
declare(strict_types=1);

namespace Pp\Mock;

final class WireContent
{
    /** 기관 묶음 → 가상 기관 [이름, 직함, 주민 호칭, 종류] */
    private const PERSONA = [
        'all' => ['한빛시', '시장', '시민', 'local'],
        'local' => ['한빛시', '시장', '시민', 'local'],
        'central' => ['미래혁신부', '장관', '국민', 'gov'],
        'public' => ['한국미래진흥원', '원장', '국민', 'corp'],
        'education' => ['한빛고등학교', '교장', '학생', 'school'],
        'university' => ['한빛대학교', '총장', '학생', 'univ'],
        'civic' => ['한국미래산업협회', '회장', '회원', 'assoc'],
        'culture' => ['한빛아트센터', '관장', '관람객', 'culture'],
        'private' => ['한빛솔루션', '대표이사', '고객', 'biz'],
    ];

    private const NAMES = ['홍길동', '김철수', '이영희', '최서연', '박민준'];

    /** 슬로건 — 종류(말투)마다 5개 이상. {org|이/가} 는 받침 따라 조사를 붙인다. */
    private const SLOGANS = [
        'local' => ['{res|과/와} 함께 여는 행복한 {org}', '{res|이/가} 주인공인 {org}', '살기 좋은 도시, 머물고 싶은 {org}', '{res}의 일상을 바꾸는 따뜻한 행정',
            '더 가까이, 더 빠르게 — 열린 {org}', '아이부터 어르신까지 모두가 행복한 {org}'],
        'gov' => ['국민의 삶을 바꾸는 정책, {org|이/가} 함께합니다', '현장에서 듣고 결과로 답하는 {org}', '내일을 준비하는 정부, 오늘 시작합니다', '국민 곁에서 길을 찾는 {org}',
            '믿을 수 있는 정책, 체감하는 변화'],
        'corp' => ['국민과 함께 미래를 여는 {org}', '신뢰로 일하고 성과로 보답합니다', '더 나은 공공서비스, {org|이/가} 만듭니다', '지속 가능한 내일을 위한 약속',
            '현장의 목소리로 혁신하는 {org}'],
        'school' => ['꿈을 키우고 함께 자라는 {org}', '배움이 즐거운 학교, 서로 존중하는 교실', '스스로 생각하고 함께 성장하는 {res}', '바른 인성, 큰 꿈 — {org}',
            '미래를 여는 배움터, {org}'],
        'univ' => ['세상을 바꾸는 배움, {org}', '도전하는 {res}, 함께 여는 미래', '연구로 증명하고 교육으로 이끄는 대학', '글로벌 인재의 시작, {org}',
            '가능성을 끝까지 키우는 대학'],
        'assoc' => ['회원과 함께 산업의 길을 엽니다', '정보와 교육, 네트워크로 함께 성장합니다', '{res}의 목소리를 모아 내일을 준비합니다', '함께 만드는 신뢰의 공동체, {org}',
            '현장과 정책을 잇는 {org}'],
        'culture' => ['일상에서 만나는 예술, {org}', '이번 시즌, 가장 가까운 전시와 공연', '보고, 듣고, 머무는 문화 공간', '모두의 문화, 모두의 {org}',
            '예술로 여는 새로운 하루'],
        'biz' => ['고객의 문제를 가장 잘 이해하는 파트너', '기술로 약속을 지키는 회사, {org}', '더 빠르고 더 단단한 비즈니스의 시작', '함께 성장하는 내일, {org}',
            '작은 차이가 만드는 큰 신뢰'],
    ];

    /** 슬로건 아래 한 줄 */
    private const SUB = [
        'local' => '{res}의 일상을 바꾸는 따뜻한 행정, {org|이/가} 함께합니다.',
        'gov' => '국민의 삶에 꼭 필요한 정책을 빠르고 정확하게 전하겠습니다.',
        'corp' => '맡은 역할을 투명하게 수행하고, 체감하는 서비스로 보답하겠습니다.',
        'school' => '모든 학생이 저마다의 속도로 성장하는 학교를 만들겠습니다.',
        'univ' => '배움이 연구로, 연구가 사회의 변화로 이어지는 대학입니다.',
        'assoc' => '회원사의 목소리를 모아 산업의 길을 열겠습니다.',
        'culture' => '전시와 공연, 교육 프로그램으로 여러분을 맞이합니다.',
        'biz' => '기술과 서비스로 약속을 지키며 함께 성장하겠습니다.',
    ];

    /** 상단 메뉴(GNB)·탭 — 관공서 밖 종류는 SampleContent::kindProfile sections */
    private const MENU = [
        'local' => ['열린 행정', '분야별 정보', '알림마당', '참여마당', '정보공개'],
        'gov' => ['정책 정보', '알림·소식', '국민 참여', '정보공개', '기관 소개'],
        'corp' => ['기관 소개', '주요 사업', '알림마당', '고객 서비스', '경영 공시'],
        'school' => ['학교소개', '가정통신문', '학교 소식', '학사 일정', '방과후 학교'],
        'univ' => ['대학소개', '입학', '학사 공지', '연구·산학', '캠퍼스 생활'],
        'assoc' => ['협회소개', '협회 소식', '회원사 소식', '교육·세미나', '정책·자료'],
        'culture' => ['센터소개', '전시', '공연', '교육 프로그램', '관람 안내'],
        'biz' => ['회사소개', '제품·서비스', '고객 사례', '보도자료', '고객지원'],
    ];

    /** 소식 탭 이름 */
    private const TABS = [
        'local' => ['공지사항', '보도자료', '채용·시험', '고시·공고'],
        'gov' => ['보도자료', '공지사항', '정책 브리핑', '행정예고'],
        'corp' => ['공지사항', '보도자료', '입찰 정보', '채용 정보'],
        'school' => ['가정통신문', '학교 소식', '공지사항', '급식 안내'],
        'univ' => ['학사 공지', '입학 안내', '장학', '대학 뉴스'],
        'assoc' => ['협회 소식', '회원사 소식', '교육·세미나', '행사 일정'],
        'culture' => ['전시', '공연', '교육', '소식'],
        'biz' => ['새소식', '보도자료', '공지', '채용'],
    ];

    /** 게시물 제목 표본(SampleContent 의 실측 기반 목록에서 고름) */
    private const BOARDS = [
        'local' => ['2026년 하반기 기간제 근로자 채용 공고', '추석 연휴 종합상황실 운영 안내', '2026년 소상공인 경영안정 지원사업 공고', '어르신 무료 독감 예방접종 10월 시작',
            '2026년 하반기 청년 월세 지원 신청 접수', '생활폐기물 배출 요일 변경 안내', '공공자전거 대여소 20곳 추가 설치', '가을철 산불 예방 행사 개최 안내'],
        'gov' => ['2027년 예산안 주요 내용 발표', '국민 정책 제안 공모전 결과 안내', '「디지털 공공서비스 혁신 방안」 발표', '청년 정책 자문단 3기 모집 안내',
            '행정규칙 일부개정 행정예고', '2026년 상반기 적극행정 우수사례 선정 결과', '공공데이터 개방 확대 계획 안내', '규제 개선 과제 국민 의견 수렴'],
        'corp' => ['2026년 하반기 직원 공개 채용 공고', '정책 연구용역 입찰 공고', '정보공개 운영 실적 공개', '고객만족도 조사 결과 안내',
            '재난 대비 안전 점검 실시 계획', '국제 협력 업무협약(MOU) 체결', '누리집 개편 이용자 의견 조사', '홍보 콘텐츠 공모전 수상작 발표'],
        'school' => ['2학기 학부모 상담 주간 안내', '방과후 학교 수강 신청 안내', '가을 체육대회 개최 안내', '급식 식단표(10월) 안내',
            '진로 체험의 날 운영 계획', '학교폭력 예방 교육 실시 안내', '대학 입시 설명회 개최 안내', '도서관 신간 도서 안내'],
        'univ' => ['2027학년도 수시모집 원서 접수 안내', '2026-2학기 수강 정정 기간 안내', '교내 장학금 신청 접수 공고', '도서관 시험기간 24시간 개방 안내',
            '교환학생 파견 추가 모집', '취업박람회 참가 기업 안내', '기숙사 2학기 입사 신청 안내', '창업 경진대회 참가팀 모집'],
        'assoc' => ['정기 총회 개최 안내', '회원사 대상 실무 교육 신청 안내', '산업 동향 보고서 발간', '정책 간담회 결과 공유',
            '해외 전시회 공동관 참가사 모집', '자격 시험 일정 공고', '우수 회원사 시상 결과', '기술 세미나 발표 자료 공개'],
        'culture' => ['가을 기획전 개막 안내', '어린이 미술 교실 수강생 모집', '정기 공연 예매 오픈 안내', '문화가 있는 날 무료 관람 안내',
            '작가와의 대화 참가 신청', '야간 개장 운영 안내', '단체 관람 예약 안내', '전시 연계 강연 개최'],
        'biz' => ['신규 서비스 출시 안내', '하반기 경력 사원 채용 공고', '고객센터 운영 시간 변경 안내', '전시회 참가 소식',
            '시스템 정기 점검 안내', '파트너사 모집 안내', 'ESG 보고서 발간', '기술 세미나 개최 안내'],
    ];

    /** 바로가기 이름 */
    private const QUICK = [
        'local' => ['민원 신청', '여권 안내', '대형 폐기물', '일자리 정보', '복지 서비스', '문화 행사', '주차 요금', '시설 예약'],
        'gov' => ['정책 브리핑', '보도자료', '법령 정보', '국민 신문고', '정보공개 청구', '통계 자료', '채용 정보', '민원 안내'],
        'corp' => ['사업 안내', '고객 센터', '경영 공시', '입찰 정보', '채용 정보', '정보공개', '윤리 경영', '오시는 길'],
        'school' => ['가정통신문', '학사 일정', '급식 식단', '방과후 학교', '진로·진학', '학교 알리미'],
        'univ' => ['입학 안내', '학사 일정', '수강 신청', '도서관', '통합 정보 시스템', '장학 안내', '취업 지원', '캠퍼스 지도'],
        'assoc' => ['회원 가입', '교육 신청', '자료실', '행사 일정', '회원사 찾기', '자격 시험'],
        'culture' => ['관람 예약', '전시 일정', '공연 예매', '교육 프로그램', '대관 안내', '오시는 길'],
        'biz' => ['제품·서비스', '도입 문의', '고객 사례', '기술 지원', '인재 채용', '회사 소개'],
    ];

    /** 현황 수치(가상) */
    private const STATS = [
        'local' => ['인구 42만 명', '올해 예산 1조 2천억 원', '공원 186곳', '민원 처리 98%'],
        'gov' => ['올해 정책 과제 120건', '국민 제안 3,400건', '공개 데이터 860종', '적극행정 사례 52건'],
        'corp' => ['지원 기업 1,200곳', '올해 사업 48개', '고객 만족도 92점', '공개 데이터 140종'],
        'school' => ['학급 24개', '학생 620명', '동아리 31개', '방과후 강좌 18개'],
        'univ' => ['학과 62개', '재학생 1만 2천 명', '취업률 71%', '연구비 820억 원'],
        'assoc' => ['회원사 1,050곳', '교육 과정 36개', '연간 세미나 24회', '자격 취득자 8,400명'],
        'culture' => ['연간 관람객 38만 명', '올해 전시 14건', '공연 120회', '교육 프로그램 45개'],
        'biz' => ['고객사 2,300곳', '서비스 가동률 99.9%', '전국 지점 18곳', '연구 인력 140명'],
    ];

    /** 명소·카드 */
    private const CARDS = [
        'local' => ['가 볼 만한 곳', ['한빛 호수공원', '구도심 골목 투어', '가을 억새 축제', '시립 미술관']],
        'gov' => ['주요 정책', ['디지털 정부 혁신', '청년 일자리', '탄소 중립', '지역 균형 발전']],
        'corp' => ['주요 사업', ['기업 성장 지원', '인재 양성', '연구 개발 지원', '해외 진출 지원']],
        'school' => ['학교 생활', ['동아리 활동', '진로 체험', '독서 토론', '체육 대회']],
        'univ' => ['학과·전공', ['인공지능학과', '경영학부', '간호학과', '디자인학부']],
        'assoc' => ['주요 사업', ['회원사 교육', '정책 연구', '해외 전시회', '자격 인증']],
        'culture' => ['이번 시즌', ['가을 기획전 「빛의 정원」', '정기 공연 「도시의 소리」', '어린이 미술 교실', '야간 개장 산책']],
        'biz' => ['사업 분야', ['클라우드 서비스', '데이터 분석', '보안 솔루션', '기술 컨설팅']],
    ];

    /** 일정 */
    private const EVENTS = [
        'local' => ['이달의 행사', ['10.03 시민의 날 기념식', '10.12 가을 음악회', '10.25 도서관 북페스타']],
        'gov' => ['주요 일정', ['10.08 정책 설명회', '10.17 국민 참여 토론회', '10.29 업무 협약식']],
        'corp' => ['행사 일정', ['10.10 사업 설명회', '10.21 고객 간담회', '10.30 성과 공유회']],
        'school' => ['학사 일정', ['10.10 가을 체육대회', '10.22 진로 체험의 날', '10.30 학부모 상담']],
        'univ' => ['학사 일정', ['10.14~10.20 중간고사', '10.28 수강 철회 마감', '11.03 수시 면접']],
        'assoc' => ['행사 일정', ['10.15 정기 세미나', '10.24 회원사 교육', '11.06 정기 총회']],
        'culture' => ['이달의 일정', ['10.04 기획전 개막', '10.18 정기 공연', '10.26 작가와의 대화']],
        'biz' => ['행사 일정', ['10.16 기술 세미나', '10.23 고객 초청 행사', '11.05 전시회 참가']],
    ];

    private const FAQ = [
        'local' => ['여권 재발급은 어디서 하나요?', '대형 폐기물은 어떻게 버리나요?', '주민등록 등본을 온라인으로 뗄 수 있나요?'],
        'univ' => ['휴학 신청은 언제 하나요?', '성적 증명서는 어떻게 발급받나요?', '기숙사 신청 자격은 무엇인가요?'],
        'school' => ['전학 절차는 어떻게 되나요?', '방과후 학교 신청은 언제 하나요?', '급식비 지원 대상은 누구인가요?'],
        'culture' => ['관람 예약은 꼭 해야 하나요?', '단체 관람 할인이 있나요?', '주차할 수 있나요?'],
        'biz' => ['도입 비용은 어떻게 되나요?', '무료 체험이 있나요?', '기술 지원 시간은 언제인가요?'],
        'default' => ['신청 자격은 어떻게 되나요?', '처리 기간은 얼마나 걸리나요?', '필요 서류는 무엇인가요?'],
    ];

    private const DEPTS = [
        'local' => ['기획예산과', '일자리정책과', '복지정책과', '안전총괄과', '홍보담당관'],
        'gov' => ['운영지원과', '기획조정실', '정책기획관', '대변인실', '디지털혁신과'],
        'corp' => ['경영기획실', '사업운영본부', '고객지원팀', '디지털혁신팀', '감사실'],
        'school' => ['교무기획부', '교육과정부', '학생생활부', '진로진학부', '행정실'],
        'univ' => ['교무처', '학생처', '입학처', '기획처', '산학협력단'],
        'assoc' => ['사무국', '회원지원팀', '교육사업팀', '정책연구팀'],
        'culture' => ['전시기획팀', '공연사업팀', '교육팀', '시설운영팀'],
        'biz' => ['경영지원팀', '사업기획팀', '고객지원팀', '연구개발팀'],
    ];

    /** 인사말 제목(SampleContent greetTitles 를 종류별로) */
    private const GREET = [
        'local' => '소통으로 답을 찾는 {org}, 늘 곁에 있겠습니다',
        'gov' => '국민 곁에서 답을 찾는 {org|이/가} 되겠습니다',
        'corp' => '신뢰받는 {org|으로/로} 거듭나겠습니다',
        'school' => '함께 배우고 함께 자라는 {org}',
        'univ' => '가능성을 끝까지 함께 키우는 {org}',
        'assoc' => '회원과 함께 내일을 여는 {org}',
        'culture' => '일상 가까이에서 예술을 만나는 곳',
        'biz' => '고객과 함께 성장하는 {org}',
    ];

    /** 섹션 → 샘플 그림 종류(Samples::FOR_SECTION 첫 후보, 종류에 따라 바꿈)와 한글 이름 */
    private const IMG_FOR = ['main_visual' => 'hero-city', 'hero' => 'hero-nature', 'sub_visual' => 'sub-visual', 'greeting_vision' => 'leader', 'news_tabs' => 'news-thumb',
        'sns_video' => 'video-thumb', 'banner_zone' => 'banner', 'popup_zone' => 'popup', 'quick_links' => 'icon-set', 'stats' => 'infographic', 'stat_cards' => 'infographic',
        'location_map' => 'building-illust', 'timeline' => 'archive-photo', 'text_band' => 'pattern-bg', 'photo_gallery' => 'news-thumb', 'tour_cards' => 'tour', 'content_block' => 'citizen'];
    private const IMG_KO = ['hero-city' => '도시 풍경 사진', 'hero-nature' => '자연 풍경 사진', 'sub-visual' => '서브 비주얼 사진', 'leader' => '기관장 사진', 'news-thumb' => '소식 썸네일',
        'video-thumb' => '영상 썸네일', 'banner' => '배너 그림', 'popup' => '팝업 그림', 'icon-set' => '아이콘 세트', 'infographic' => '인포그래픽', 'building-illust' => '건물 일러스트',
        'archive-photo' => '기록 사진', 'pattern-bg' => '패턴 배경', 'tour' => '관광 사진', 'place' => '장소 사진', 'citizen' => '사람들 사진'];

    /** 기관 묶음 → 가상 기관 */
    public static function persona(string $org): array
    {
        [$name, $title, $res, $kind] = self::PERSONA[$org] ?? self::PERSONA['all'];
        return ['org' => $name, 'title' => $title, 'resident' => $res, 'kind' => $kind, 'name' => self::NAMES[crc32($name) % count(self::NAMES)],
            'address' => '(12345) ' . match ($kind) { 'gov' => '한빛특별자치시 정부청사로 100 정부한빛청사', 'local' => '한빛시 중앙로 100 한빛시청', default => '한빛시 중앙로 100 ' . $name },
            'phone' => '1234-5678'];
    }

    /** 받침 있으면 앞 조사, 없으면 뒤 조사 */
    private static function josa(string $w, string $with, string $without): string
    {
        $last = mb_substr($w, -1);
        $code = mb_ord($last) - 0xAC00;
        $has = $code >= 0 && $code <= 11171 ? $code % 28 !== 0 : (bool) preg_match('/[0-9LMNRlmnr]$/', $last);
        // '으로/로' 는 ㄹ 받침이면 '로'
        if ($with === '으로' && $has && $code % 28 === 8) {
            return $w . $without;
        }
        return $w . ($has ? $with : $without);
    }

    /** {org}·{res}·{org|이/가} 채우기 */
    private static function tpl(string $s, array $p): string
    {
        return (string) preg_replace_callback('/\{(org|res)(?:\|([^\/}]+)\/([^}]+))?\}/u', static function (array $m) use ($p): string {
            $w = $m[1] === 'org' ? $p['org'] : $p['resident'];
            return isset($m[2]) && $m[2] !== '' ? self::josa($w, $m[2], $m[3]) : $w;
        }, $s);
    }

    /** 화면 종류 → 쪽 이름·상위 메뉴 */
    private static function pageOf(string $screen, string $kind): array
    {
        $about = ['local' => '열린 행정', 'gov' => '기관 소개', 'corp' => '기관 소개', 'school' => '학교소개', 'univ' => '대학소개', 'assoc' => '협회소개', 'culture' => '센터소개', 'biz' => '회사소개'][$kind] ?? '기관 소개';
        return match ($screen) {
            'board_list', 'board_view' => ['공지사항', '알림마당'],
            'board_gallery' => ['포토 갤러리', '알림마당'],
            'form' => ['온라인 신청', '참여마당'],
            'greeting' => ['인사말', $about],
            'org_chart' => ['조직도', $about],
            'location' => ['찾아오시는 길', $about],
            'history' => ['연혁', $about],
            'vision' => ['비전·목표', $about],
            'procedure' => ['이용 절차', '분야별 정보'],
            'faq' => ['자주 묻는 질문', '참여마당'],
            'search' => ['통합검색', '홈'],
            'sitemap' => ['사이트맵', '홈'],
            'info_disclosure' => ['정보공개', '정보공개'],
            'content' => [self::MENU[$kind][1] ?? '사업 안내', self::MENU[$kind][0] ?? '분야별 정보'],
            default => ['메인', '홈'],
        };
    }

    /** 칸 하나의 예시 내용 — {t, s?, items?, img?} */
    public static function cell(string $k, array $p, int $seed, string $screen, int $nth = 0): array
    {
        $kind = $p['kind'];
        $org = $p['org'];
        $pick = static fn (array $a, int $o = 0) => $a[($seed + $o) % count($a)];
        $slogans = self::SLOGANS[$kind];
        $boards = self::BOARDS[$kind];
        $boardsAt = static fn (int $from, int $n): array => array_map(static fn (int $i): string => $boards[($seed + $from + $i) % count($boards)], range(0, $n - 1));
        [$page, $menu] = self::pageOf($screen, $kind);
        $public = in_array($kind, ['local', 'gov', 'corp'], true);
        $out = match ($k) {
            'masthead' => ['t' => $public ? '이 누리집은 대한민국 공식 전자정부 누리집입니다.' : $org . ' 공식 홈페이지'],
            'header' => ['t' => $org, 'items' => self::MENU[$kind]],
            'main_visual' => ['t' => self::tpl($pick($slogans), $p), 's' => self::tpl(self::SUB[$kind], $p)],
            'hero' => ['t' => self::tpl($pick($slogans, 2), $p), 's' => self::tpl(self::SUB[$kind], $p)],
            'text_band' => ['t' => self::tpl($pick($slogans, 1 + $nth), $p), 's' => $kind === 'biz' ? '도입 문의 · 상담 신청' : '자세히 보기'],
            'sub_visual' => ['t' => $menu, 's' => self::tpl($pick($slogans, 3), $p)],
            'breadcrumb' => ['t' => '홈 > ' . $menu . ' > ' . $page],
            'page_title' => ['t' => $page],
            'main_search' => ['t' => $kind === 'biz' ? '무엇을 도와드릴까요?' : '무엇을 찾으세요?', 's' => '추천 검색어: ' . implode(' · ', array_slice(self::QUICK[$kind], 0, 3))],
            'ai_chatbot' => ['t' => 'AI 상담', 's' => '예: ' . (self::FAQ[$kind] ?? self::FAQ['default'])[0]],
            'quick_links' => ['t' => $kind === 'univ' || $kind === 'school' ? '자주 찾는 메뉴' : '자주 찾는 서비스', 'items' => array_slice(self::QUICK[$kind], 0, 6)],
            'news_tabs' => ['t' => implode(' · ', array_slice(self::TABS[$kind], 0, 3)), 'items' => $boardsAt(0, 3)],
            'news_ticker' => ['t' => '알림', 's' => $boardsAt(5, 1)[0]],
            'popup_zone' => ['t' => '알림판', 's' => $boardsAt(3, 1)[0]],
            'banner_zone' => ['t' => '배너 모음', 's' => $boardsAt(6, 1)[0]],
            'calendar' => ['t' => self::EVENTS[$kind][0], 'items' => self::EVENTS[$kind][1]],
            'sns_video' => ['t' => $org . ' 영상·SNS', 's' => $boardsAt(4, 1)[0] . ' 현장 영상'],
            'greeting_vision' => ['t' => self::tpl(self::GREET[$kind], $p), 's' => '안녕하십니까? ' . $org . ' ' . $p['title'] . ' ' . $p['name'] . '입니다.'],
            'stats', 'stat_cards' => ['t' => '숫자로 보는 ' . $org, 'items' => self::STATS[$kind]],
            'tour_cards' => ['t' => self::CARDS[$kind][0], 'items' => self::CARDS[$kind][1]],
            'photo_gallery' => ['t' => match ($kind) { 'univ' => '캠퍼스 포토', 'culture' => '전시·공연 사진', 'biz' => '사업 사례', default => '포토 갤러리' }, 's' => $boardsAt(2, 1)[0]],
            'content_block' => ['t' => match ($screen) { 'vision' => '비전 — ' . self::tpl($pick($slogans, 4), $p), 'main' => self::CARDS[$kind][1][$nth % 4], default => $page . ' 안내' },
                's' => self::tpl(self::SUB[$kind], $p)],
            'board_list' => ['t' => $screen === 'search' ? '검색 결과 128건' : $page, 'items' => $boardsAt(0, 4)],
            'board_view' => ['t' => $boardsAt(1, 1)[0], 's' => '작성 ' . self::DEPTS[$kind][0] . ' · 2026.09.24 · 조회 1,234 · 첨부 1'],
            'form' => ['t' => '온라인 신청', 'items' => ['신청인 정보', '신청 내용', '개인정보 수집 동의', '제출']],
            'notice_box' => ['t' => '신청 전 확인하세요', 's' => '처리 기간은 접수일로부터 7일(공휴일 제외)입니다.'],
            'info_table' => ['t' => match ($screen) { 'org_chart' => '부서별 담당 업무', 'info_disclosure' => '공개 목록', 'procedure' => '필요 서류·수수료', default => '안내 표' },
                's' => match ($screen) { 'org_chart' => '부서 · 담당 업무 · 전화', 'procedure' => '서류 · 발급처 · 수수료', default => '구분 · 내용 · 담당 부서 · 전화' }],
            'org_chart' => ['t' => $org . ' 조직도', 'items' => self::DEPTS[$kind]],
            'location_map' => ['t' => '찾아오시는 길', 's' => $p['address']],
            'contact_info' => ['t' => '주소·전화', 's' => $p['address'] . ' · 대표전화 ' . $p['phone']],
            'timeline' => ['t' => '연혁', 'items' => ['2026 누리집 전면 개편', '2020 온라인 서비스 시작', '2010 새 청사 이전', '1995 ' . match ($kind) { 'univ', 'school' => '개교', 'local', 'gov' => '개청', default => '설립' }]],
            'step_flow' => ['t' => '처리 절차', 'items' => ['신청', '접수', '검토', '결과 통보']],
            'faq_list' => ['t' => '자주 묻는 질문', 'items' => self::FAQ[$kind] ?? self::FAQ['default']],
            'content_tabs' => ['t' => '분류', 'items' => $screen === 'search' ? ['전체', '메뉴', '게시물', '파일'] : array_slice(self::TABS[$kind], 0, 4)],
            'sitemap' => ['t' => '전체 메뉴', 'items' => self::MENU[$kind]],
            'satisfaction' => ['t' => '이 페이지에서 제공하는 정보에 만족하십니까?', 's' => '매우 만족 · 만족 · 보통 · 불만족'],
            'footer' => ['t' => $org, 's' => $p['address'] . ' · 대표전화 ' . $p['phone']],
            'kit_identifier' => ['t' => $org . ' 운영'],
            default => [],
        };
        if (isset(self::IMG_FOR[$k])) {
            $img = self::IMG_FOR[$k];
            if ($k === 'main_visual' && in_array($kind, ['culture', 'assoc'], true)) {
                $img = 'hero-nature';
            }
            if ($k === 'photo_gallery' && $kind === 'culture') {
                $img = 'place';
            }
            $out['img'] = ['kind' => $img, 'label' => self::IMG_KO[$img] ?? $img];
        }
        return $out;
    }

    /** 와이어 사본에 내용을 채운다 — 원래 칸 설명(t)은 label 로 옮긴다. 저장용이 아니라 보기용. */
    public static function fill(array $w): array
    {
        $org = (string) ($w['org'] ?? 'all');
        $screen = (string) ($w['screen'] ?? 'main');
        $p = self::persona($org);
        $seed = crc32($screen . '|' . (string) ($w['style'] ?? '') . '|' . (int) ($w['variant'] ?? 0));
        $nth = [];
        foreach ((array) ($w['rows'] ?? []) as $ri => $r) {
            foreach ((array) ($r['cols'] ?? []) as $ci => $c) {
                if (!is_array($c)) {
                    continue;
                }
                $k = (string) ($c['k'] ?? '');
                $i = $nth[$k] = ($nth[$k] ?? -1) + 1;
                $x = self::cell($k, $p, $seed + $ri, $screen, $i);
                if (!empty($c['t'])) {
                    $x['label'] = (string) $c['t'];
                }
                if (!isset($x['t'])) {
                    $x['t'] = (string) ($c['t'] ?? Wire::typeName($k));
                }
                $w['rows'][$ri]['cols'][$ci] = array_merge($c, $x);
            }
        }
        $w['persona'] = ['org' => $p['org'], 'kind' => $p['kind'], 'title' => $p['title']];
        return $w;
    }

    /** 요청문용 — 칸마다 한 줄 */
    public static function lines(array $filled): array
    {
        $out = [];
        foreach ((array) ($filled['rows'] ?? []) as $ri => $r) {
            foreach ((array) ($r['cols'] ?? []) as $c) {
                $s = ($ri + 1) . '. ' . Wire::typeName((string) $c['k']) . ' — "' . $c['t'] . '"';
                if (!empty($c['s'])) {
                    $s .= ' / ' . $c['s'];
                }
                if (!empty($c['items'])) {
                    $s .= ' / 항목: ' . implode(', ', array_slice((array) $c['items'], 0, 6));
                }
                if (!empty($c['img'])) {
                    $s .= ' / 그림: ' . $c['img']['label'] . '(' . $c['img']['kind'] . ')';
                }
                $out[] = $s;
            }
        }
        return $out;
    }
}
