<?php
/**
 * powerMock 기획 와이어 "내용 보기" — 칸마다 그 기관에 맞는 예시 글(제목·한 줄·목록)과 샘플 그림 종류를 채운다.
 *
 * 출처: services/mockref-api/src/SampleContent.php(persona·kindProfile·인사말 첫 문장·게시물 제목 표본)와
 *       services/mockref-api/src/Samples.php(FOR_SECTION 섹션별 샘플 그림 종류)에서 와이어에 필요한 만큼만 옮겼다.
 *       mockref 는 따로 배포되는 서비스라 api 에서 직접 부르지 않는다 — 문구를 바꾸면 양쪽을 같이 본다.
 * 가상 기관만 쓴다(한빛시·미래혁신부…, 전화 1234-5678). 실제 기관·인물 이름은 넣지 않는다 — 고객이 준 기관명(org_name)·
 * 재현 묶음의 persona(이미 가상화된 값)는 그대로 쓴다.
 * 결정적이다(LLM 0) — 같은 와이어면 늘 같은 글. 한 화면 안에서 같은 문장은 두 번 쓰지 않는다(2026-10-18 운영 시험 10건).
 *
 * 기관 종류(kind): local·gov·corp·school·edu(교육청)·univ·assoc·welfare·culture·museum·library·council·biz
 * (foundation·academy 는 표가 없으면 가까운 종류 FALL 를 빌린다). 재현 묶음 persona.kind 와 같은 말이다.
 */
declare(strict_types=1);

namespace Pp\Mock;

final class WireContent
{
    /** 기관 묶음 → 가상 기관 [이름, 직함, 주민 호칭, 종류, 청사] */
    private const PERSONA = [
        'all' => ['한빛시', '시장', '시민', 'local', '한빛시청'],
        'local' => ['한빛시', '시장', '시민', 'local', '한빛시청'],
        'central' => ['미래혁신부', '장관', '국민', 'gov', '정부한빛청사'],
        'public' => ['한국미래진흥원', '원장', '국민', 'corp', '한국미래진흥원'],
        'education' => ['한빛고등학교', '교장', '학생', 'school', '한빛고등학교'],
        'university' => ['한빛대학교', '총장', '학생', 'univ', '한빛대학교'],
        'civic' => ['한국미래산업협회', '회장', '회원', 'assoc', '한국미래산업협회'],
        'culture' => ['한빛아트센터', '관장', '관람객', 'culture', '한빛아트센터'],
        'private' => ['한빛솔루션', '대표이사', '고객', 'biz', '한빛솔루션'],
    ];

    /** 표가 없는 종류가 빌려 올 종류 */
    private const FALL = ['edu' => 'school', 'council' => 'local', 'welfare' => 'assoc', 'foundation' => 'corp', 'museum' => 'culture', 'library' => 'culture', 'academy' => 'school'];

    /** 공식 전자정부 누리집 띠를 쓰는 종류 */
    private const KRDS = ['local', 'gov', 'corp', 'edu', 'council'];

    private const NAMES = ['홍길동', '김철수', '이영희', '최서연', '박민준'];

    /*
     * 글 자리표시 — {org} 기관명 · {res} 주민 호칭 · {short} 지명(청운군 → 청운) · {rip} 시립/군립/구립/도립 · {unit} 미술관·도서관 같은 시설 낱말
     * · {head} 기관장 호칭(청운군수, 한빛대학교 총장). {org|이/가} 처럼 쓰면 받침에 따라 앞(받침 있음)·뒤(없음) 조사를 붙인다.
     */

    /** 슬로건 — 종류(말투)마다 5개 이상. 히어로·문구 띠·서브 비주얼이 서로 다른 것을 고른다. */
    private const SLOGANS = [
        'local' => ['{res|과/와} 함께 여는 행복한 {org}', '{res|이/가} 주인공인 {org}', '살기 좋은 도시, 머물고 싶은 {org}', '{res}의 일상을 바꾸는 따뜻한 행정',
            '더 가까이, 더 빠르게 — 열린 {org}', '아이부터 어르신까지 모두가 행복한 {org}'],
        'gov' => ['국민의 삶을 바꾸는 정책, {org|이/가} 함께합니다', '현장에서 듣고 결과로 답하는 {org}', '내일을 준비하는 정부, 오늘 시작합니다', '국민 곁에서 길을 찾는 {org}',
            '믿을 수 있는 정책, 체감하는 변화'],
        'corp' => ['국민과 함께 미래를 여는 {org}', '신뢰로 일하고 성과로 보답합니다', '더 나은 공공서비스, {org|이/가} 만듭니다', '지속 가능한 내일을 위한 약속',
            '현장의 목소리로 혁신하는 {org}'],
        'school' => ['꿈을 키우고 함께 자라는 {org}', '배움이 즐거운 학교, 서로 존중하는 교실', '스스로 생각하고 함께 성장하는 {res}', '바른 인성, 큰 꿈 — {org}',
            '미래를 여는 배움터, {org}'],
        'edu' => ['배움이 행복한 {short} 교육', '모든 아이가 빛나는 {org}', '함께 배우고 함께 자라는 미래 교육', '아이 한 명 한 명을 존중하는 교육',
            '학교와 마을이 함께 키우는 아이들'],
        'univ' => ['세상을 바꾸는 배움, {org}', '도전하는 {res}, 함께 여는 미래', '연구로 증명하고 교육으로 이끄는 대학', '글로벌 인재의 시작, {org}',
            '가능성을 끝까지 키우는 대학'],
        'assoc' => ['회원과 함께 산업의 길을 엽니다', '정보와 교육, 네트워크로 함께 성장합니다', '{res}의 목소리를 모아 내일을 준비합니다', '함께 만드는 신뢰의 공동체, {org}',
            '현장과 정책을 잇는 {org}'],
        'welfare' => ['이웃과 함께 여는 따뜻한 내일', '누구나 기대어 쉴 수 있는 {org}', '돌봄과 나눔으로 마을을 잇습니다', '{res} 한 분 한 분의 하루를 살핍니다',
            '함께 사는 마을, 함께 웃는 {org}'],
        'culture' => ['일상에서 만나는 예술, {org}', '이번 시즌, 가장 가까운 전시와 공연', '보고, 듣고, 머무는 문화 공간', '모두의 문화, 모두의 {org}',
            '예술로 여는 새로운 하루'],
        'museum' => ['작품 앞에서 머무는 시간, {org}', '이번 시즌, 가장 가까운 전시', '보고, 느끼고, 머무는 {unit}', '모두에게 열린 {org}',
            '예술로 여는 새로운 하루'],
        'library' => ['책으로 잇는 마을의 하루, {org}', '읽고, 묻고, 함께 자라는 도서관', '누구나 머물 수 있는 열린 서재', '한 권의 책이 여는 새로운 하루',
            '생각이 자라는 곳, {org}'],
        'council' => ['{res}의 목소리를 정책으로 잇는 {org}', '듣고 살피고 답하는 열린 의회', '{res|과/와} 함께하는 투명한 의정', '현장에서 답을 찾는 {org}',
            '신뢰받는 의회, 일하는 의회'],
        'biz' => ['고객의 문제를 가장 잘 이해하는 파트너', '기술로 약속을 지키는 회사, {org}', '더 빠르고 더 단단한 비즈니스의 시작', '함께 성장하는 내일, {org}',
            '작은 차이가 만드는 큰 신뢰'],
    ];

    /** 슬로건 아래 한 줄 — 슬로건과 같은 문장이 되지 않게 따로 쓴다 */
    private const SUB = [
        'local' => '{res} 곁에서 듣고 바로 답하는 열린 행정을 약속합니다.',
        'gov' => '국민의 삶에 꼭 필요한 정책을 빠르고 정확하게 전하겠습니다.',
        'corp' => '맡은 역할을 투명하게 수행하고, 체감하는 서비스로 보답하겠습니다.',
        'school' => '모든 학생이 저마다의 속도로 성장하는 학교를 만들겠습니다.',
        'edu' => '모든 학생이 저마다의 속도로 자라도록 학교와 함께하겠습니다.',
        'univ' => '배움이 연구로, 연구가 사회의 변화로 이어지는 대학입니다.',
        'assoc' => '회원사의 목소리를 모아 산업의 길을 열겠습니다.',
        'welfare' => '도움이 필요한 이웃 곁에서 돌봄과 배움을 잇겠습니다.',
        'culture' => '전시와 공연, 교육 프로그램으로 여러분을 맞이합니다.',
        'museum' => '전시와 교육 프로그램으로 여러분을 맞이합니다.',
        'library' => '자료와 프로그램으로 {res}의 배움을 돕겠습니다.',
        'council' => '{res}의 뜻을 살펴 바른 의정으로 보답하겠습니다.',
        'biz' => '기술과 서비스로 약속을 지키며 함께 성장하겠습니다.',
    ];

    /** 회사·기관 소개 한 문단(안내 블록 '소개' 칸) */
    private const ABOUT = [
        'local' => '{org|은/는} {res}의 삶을 가장 가까이에서 살피는 열린 행정을 펼칩니다.',
        'gov' => '{org|은/는} 국민이 체감하는 정책으로 내일을 준비합니다.',
        'corp' => '{org|은/는} 공공서비스의 품질을 높이는 전문 기관입니다.',
        'school' => '{org|은/는} 배움과 인성이 함께 자라는 학교입니다.',
        'edu' => '{org|은/는} 지역 학교의 교육 정책과 지원을 맡습니다.',
        'univ' => '{org|은/는} 연구와 교육으로 사회 변화를 이끄는 대학입니다.',
        'assoc' => '{org|은/는} 회원사의 성장과 산업 발전을 돕는 단체입니다.',
        'welfare' => '{org|은/는} 지역 주민의 복지와 돌봄을 책임지는 이웃입니다.',
        'culture' => '{org|은/는} 전시와 공연으로 일상에 예술을 잇습니다.',
        'museum' => '{org|은/는} 소장품과 기획전으로 예술을 가까이 전합니다.',
        'library' => '{org|은/는} 누구나 책과 배움을 누리는 열린 공간입니다.',
        'council' => '{org|은/는} {res}의 뜻을 모아 조례와 예산을 살핍니다.',
        'biz' => '{org|은/는} 기업의 디지털 전환을 돕는 기술 파트너입니다.',
    ];

    /** 상단 메뉴(GNB) — 관공서 밖 종류는 SampleContent::kindProfile sections */
    private const MENU = [
        'local' => ['열린 행정', '분야별 정보', '알림마당', '참여마당', '정보공개'],
        'gov' => ['정책 정보', '알림·소식', '국민 참여', '정보공개', '기관 소개'],
        'corp' => ['기관 소개', '주요 사업', '알림마당', '고객 서비스', '경영 공시'],
        'school' => ['학교소개', '가정통신문', '학교 소식', '학사 일정', '방과후 학교'],
        'edu' => ['교육청 소개', '교육 정책', '알림마당', '학교 지원', '정보공개'],
        'univ' => ['대학소개', '입학', '학사 공지', '연구·산학', '캠퍼스 생활'],
        'assoc' => ['협회소개', '협회 소식', '회원사 소식', '교육·세미나', '정책·자료'],
        'welfare' => ['기관소개', '사업 안내', '프로그램 신청', '후원·자원봉사', '복지관 소식'],
        'culture' => ['센터소개', '전시', '공연', '교육 프로그램', '관람 안내'],
        'museum' => ['{unit} 소개', '전시', '소장품', '교육 프로그램', '관람 안내'],
        'library' => ['도서관 소개', '자료 검색', '독서 프로그램', '이용 안내', '도서관 소식'],
        'council' => ['의회 소개', '의원 소개', '의정 활동', '의회 소식', '열린 의회'],
        'biz' => ['회사소개', '제품·서비스', '고객 사례', '보도자료', '고객지원'],
    ];

    /** 소식 탭 이름 */
    private const TABS = [
        'local' => ['공지사항', '보도자료', '채용·시험', '고시·공고'],
        'gov' => ['보도자료', '공지사항', '정책 브리핑', '행정예고'],
        'corp' => ['공지사항', '보도자료', '입찰 정보', '채용 정보'],
        'school' => ['가정통신문', '학교 소식', '공지사항', '급식 안내'],
        'edu' => ['공지사항', '보도자료', '교육 소식', '채용 정보'],
        'univ' => ['학사 공지', '입학 안내', '장학', '대학 뉴스'],
        'assoc' => ['협회 소식', '회원사 소식', '교육·세미나', '행사 일정'],
        'welfare' => ['복지관 소식', '프로그램 안내', '후원 소식', '채용 공고'],
        'culture' => ['전시', '공연', '교육', '소식'],
        'museum' => ['전시', '교육', '소식', '공지'],
        'library' => ['공지사항', '도서관 소식', '신착 도서', '행사 안내'],
        'council' => ['의회 소식', '의정 활동', '보도자료', '공지사항'],
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
        'edu' => ['2027학년도 고등학교 입학전형 시행계획 공고', '교육공무직원 채용 공고', '학교폭력 예방 주간 운영 안내', '늘봄학교 운영 확대 안내',
            '교원 연수 신청 안내', '2학기 학교 급식 위생 점검 결과', '학부모 교육 아카데미 수강생 모집', '디지털 교과서 시범 학교 선정 결과'],
        'univ' => ['2027학년도 수시모집 원서 접수 안내', '2026-2학기 수강 정정 기간 안내', '교내 장학금 신청 접수 공고', '도서관 시험기간 24시간 개방 안내',
            '교환학생 파견 추가 모집', '취업박람회 참가 기업 안내', '기숙사 2학기 입사 신청 안내', '창업 경진대회 참가팀 모집'],
        'assoc' => ['정기 총회 개최 안내', '회원사 대상 실무 교육 신청 안내', '산업 동향 보고서 발간', '정책 간담회 결과 공유',
            '해외 전시회 공동관 참가사 모집', '자격 시험 일정 공고', '우수 회원사 시상 결과', '기술 세미나 발표 자료 공개'],
        'welfare' => ['가을학기 평생교육 프로그램 수강생 모집', '어르신 무료 건강검진 안내', '자원봉사자 정기 교육 안내', '아동 방과후 돌봄 대기 신청 안내',
            '나눔 바자회 개최 안내', '사회복지사 채용 공고', '김장 나눔 행사 후원자 모집', '장애인 활동 지원 이용 안내'],
        'culture' => ['가을 기획전 개막 안내', '어린이 미술 교실 수강생 모집', '정기 공연 예매 오픈 안내', '문화가 있는 날 무료 관람 안내',
            '작가와의 대화 참가 신청', '야간 개장 운영 안내', '단체 관람 예약 안내', '전시 연계 강연 개최'],
        'museum' => ['가을 기획전 개막 안내', '어린이 미술 교실 수강생 모집', '도슨트 해설 시간표 안내', '문화가 있는 날 무료 관람 안내',
            '작가와의 대화 참가 신청', '야간 개장 운영 안내', '단체 관람 예약 안내', '소장품 특별전 연계 강연'],
        'library' => ['가을 독서 문화 프로그램 수강생 모집', '신착 도서 목록 안내', '도서관 휴관일 안내', '상호대차 서비스 확대 안내',
            '작가 초청 북토크 개최', '열람실 좌석 예약 안내', '어린이 책 읽기 교실 모집', '전자책 대출 서비스 안내'],
        'council' => ['제300회 임시회 개회 안내', '의정 모니터단 모집 공고', '행정사무감사 결과 공개', '조례안 입법예고',
            '의원 연구단체 활동 보고', '주민 참여 예산 간담회 개최', '의회 청사 견학 신청 안내', '본회의 생중계 일정 안내'],
        'biz' => ['신규 서비스 출시 안내', '하반기 경력 사원 채용 공고', '고객센터 운영 시간 변경 안내', '전시회 참가 소식',
            '시스템 정기 점검 안내', '파트너사 모집 안내', 'ESG 보고서 발간', '기술 세미나 개최 안내'],
    ];

    /** 바로가기 이름 */
    private const QUICK = [
        'local' => ['민원 신청', '여권 안내', '대형 폐기물', '일자리 정보', '복지 서비스', '문화 행사', '주차 요금', '시설 예약'],
        'gov' => ['정책 브리핑', '보도자료', '법령 정보', '국민 신문고', '정보공개 청구', '통계 자료', '채용 정보', '민원 안내'],
        'corp' => ['사업 안내', '고객 센터', '경영 공시', '입찰 정보', '채용 정보', '정보공개', '윤리 경영', '오시는 길'],
        'school' => ['가정통신문', '학사 일정', '급식 식단', '방과후 학교', '진로·진학', '학교 알리미'],
        'edu' => ['교육청 민원', '학교 찾기', '입학 안내', '교원 인사', '교육 통계', '학부모 지원'],
        'univ' => ['입학 안내', '학사 일정', '수강 신청', '도서관', '통합 정보 시스템', '장학 안내', '취업 지원', '캠퍼스 지도'],
        'assoc' => ['회원 가입', '교육 신청', '자료실', '행사 일정', '회원사 찾기', '자격 시험'],
        'welfare' => ['프로그램 신청', '후원하기', '자원봉사 신청', '시설 대관', '상담 신청', '오시는 길'],
        'culture' => ['관람 예약', '전시 일정', '공연 예매', '교육 프로그램', '대관 안내', '오시는 길'],
        'museum' => ['관람 예약', '전시 일정', '교육 프로그램', '소장품 검색', '단체 관람', '오시는 길'],
        'library' => ['자료 검색', '대출 조회', '열람실 예약', '희망 도서 신청', '독서 프로그램', '이용 안내'],
        'council' => ['의원 소개', '회의록 검색', '의정 활동', '방청 신청', '의회에 바란다', '조례 정보'],
        'biz' => ['제품·서비스', '도입 문의', '고객 사례', '기술 지원', '인재 채용', '회사 소개'],
    ];

    /** 현황 수치(가상) */
    private const STATS = [
        'local' => ['인구 42만 명', '올해 예산 1조 2천억 원', '공원 186곳', '민원 처리 98%'],
        'gov' => ['올해 정책 과제 120건', '국민 제안 3,400건', '공개 데이터 860종', '적극행정 사례 52건'],
        'corp' => ['지원 기업 1,200곳', '올해 사업 48개', '고객 만족도 92점', '공개 데이터 140종'],
        'school' => ['학급 24개', '학생 620명', '동아리 31개', '방과후 강좌 18개'],
        'edu' => ['학교 412곳', '학생 18만 명', '교원 1만 4천 명', '늘봄학교 186곳'],
        'univ' => ['학과 62개', '재학생 1만 2천 명', '취업률 71%', '연구비 820억 원'],
        'assoc' => ['회원사 1,050곳', '교육 과정 36개', '연간 세미나 24회', '자격 취득자 8,400명'],
        'welfare' => ['연간 이용자 2만 4천 명', '운영 프로그램 58개', '자원봉사자 1,300명', '돌봄 가정 420곳'],
        'culture' => ['연간 관람객 38만 명', '올해 전시 14건', '공연 120회', '교육 프로그램 45개'],
        'museum' => ['연간 관람객 21만 명', '소장품 3,800점', '올해 전시 9건', '교육 프로그램 32개'],
        'library' => ['장서 42만 권', '연간 이용자 31만 명', '독서 프로그램 64개', '열람 좌석 380석'],
        'council' => ['의원 21명', '올해 의안 처리 186건', '조례 제정 42건', '주민 청원 18건'],
        'biz' => ['고객사 2,300곳', '서비스 가동률 99.9%', '전국 지점 18곳', '연구 인력 140명'],
    ];

    /** 명소·카드 [제목, 항목 4] — 카드 설명은 CARD_DESC 같은 순서 */
    private const CARDS = [
        'local' => ['가 볼 만한 곳', ['{short} 호수공원', '구도심 골목 투어', '가을 억새 축제', '{rip} 미술관']],
        'gov' => ['주요 정책', ['디지털 정부 혁신', '청년 일자리', '탄소 중립', '지역 균형 발전']],
        'corp' => ['주요 사업', ['기업 성장 지원', '인재 양성', '연구 개발 지원', '해외 진출 지원']],
        'school' => ['학교 생활', ['동아리 활동', '진로 체험', '독서 토론', '체육 대회']],
        'edu' => ['주요 정책', ['늘봄학교', '디지털 교육', '기초학력 지원', '안전한 학교']],
        'univ' => ['학과·전공', ['인공지능학과', '경영학부', '간호학과', '디자인학부']],
        'assoc' => ['주요 사업', ['회원사 교육', '정책 연구', '해외 전시회', '자격 인증']],
        'welfare' => ['주요 사업', ['어르신 돌봄', '아동·청소년 지원', '장애인 복지', '평생교육']],
        'culture' => ['이번 시즌', ['가을 기획전 「빛의 정원」', '정기 공연 「도시의 소리」', '어린이 미술 교실', '야간 개장 산책']],
        'museum' => ['이번 시즌', ['가을 기획전 「빛의 정원」', '소장품 특별전 「바다의 기억」', '어린이 미술 교실', '야간 개장 산책']],
        'library' => ['이달의 프로그램', ['작가 초청 북토크', '어린이 책 읽기 교실', '시니어 디지털 교실', '독서 토론 모임']],
        'council' => ['의정 활동', ['조례 제정', '예산 심의', '행정사무감사', '주민 소통 간담회']],
        'biz' => ['사업 분야', ['클라우드 서비스', '데이터 분석', '보안 솔루션', '기술 컨설팅']],
    ];

    /** 카드 설명 — 카드마다 다른 문장(같은 설명 4장 금지) */
    private const CARD_DESC = [
        'local' => ['사계절 산책로와 수변 쉼터가 있습니다.', '옛 골목의 이야기를 따라 걷습니다.', '10월 한 달, 은빛 억새 길이 열립니다.', '지역 작가 작품을 상설 전시합니다.'],
        'gov' => ['행정 서비스를 디지털로 바꿉니다.', '청년의 첫 일자리를 돕습니다.', '2050 탄소 중립을 준비합니다.', '지역이 고르게 성장하도록 돕습니다.'],
        'corp' => ['성장 단계마다 맞춤 지원을 합니다.', '현장형 인재를 함께 키웁니다.', '연구 개발 과제를 발굴합니다.', '해외 시장 진출을 돕습니다.'],
        'school' => ['31개 동아리가 활동합니다.', '직업 현장을 직접 체험합니다.', '함께 읽고 생각을 나눕니다.', '반 대항 경기로 하나가 됩니다.'],
        'edu' => ['방과후 돌봄과 배움을 함께 지원합니다.', '디지털 교과서와 AI 수업을 넓힙니다.', '기초학력을 한 명도 빠짐없이 챙깁니다.', '등하굣길부터 교실까지 안전을 살핍니다.'],
        'univ' => ['AI 융합 인재를 기릅니다.', '현장 문제를 푸는 경영을 배웁니다.', '지역 의료를 이끌 간호 인재를 기릅니다.', '산업 현장과 함께 디자인을 배웁니다.'],
        'assoc' => ['회원사 실무 역량을 높입니다.', '산업 정책 연구로 대안을 냅니다.', '해외 전시회 공동관 참가를 돕습니다.', '업계 표준 자격을 인증합니다.'],
        'welfare' => ['어르신의 건강한 하루를 돕습니다.', '아이들의 방과후를 함께 돌봅니다.', '자립 생활을 위한 지원을 잇습니다.', '배움으로 이웃을 연결합니다.'],
        'culture' => ['빛과 정원을 주제로 한 기획전입니다.', '도시의 소리를 담은 정기 공연입니다.', '아이들이 직접 그리고 만듭니다.', '밤의 전시실을 천천히 걷습니다.'],
        'museum' => ['빛과 정원을 주제로 한 기획전입니다.', '소장품 120점을 새로 꺼내 보입니다.', '아이들이 직접 그리고 만듭니다.', '밤의 전시실을 천천히 걷습니다.'],
        'library' => ['좋아하는 작가를 가까이에서 만납니다.', '그림책을 함께 읽고 이야기합니다.', '스마트폰·키오스크 사용을 배웁니다.', '한 달에 한 권, 함께 읽고 나눕니다.'],
        'council' => ['{res} 생활에 필요한 조례를 만듭니다.', '예산이 바르게 쓰이는지 살핍니다.', '행정 전반을 꼼꼼히 점검합니다.', '현장에서 {res}의 목소리를 듣습니다.'],
        'biz' => ['안정적인 클라우드 인프라를 제공합니다.', '데이터로 더 나은 결정을 돕습니다.', '24시간 보안 관제로 지킵니다.', '도입부터 운영까지 함께합니다.'],
    ];

    /** 사진 모음 설명(사진 한 장의 제목) — 게시물 제목을 쓰지 않는다 */
    private const GALLERY = [
        'local' => ['가을 억새 축제 현장', '{res} 걷기 대회', '전통시장 장보기 행사', '어린이 물놀이장 개장'],
        'gov' => ['정책 현장 간담회', '청년 정책 토론회', '디지털 정부 박람회', '국민 참여단 발대식'],
        'corp' => ['사업 설명회 현장', '고객 간담회', '업무협약 체결식', '성과 공유회'],
        'school' => ['가을 체육대회', '진로 체험의 날', '동아리 발표회', '졸업 사진 촬영'],
        'edu' => ['늘봄학교 현장 방문', '학생 과학 축전', '교원 연수 현장', '학부모 아카데미'],
        'univ' => ['봄 축제 현장', '학위 수여식', '교환학생 환영회', '창업 경진대회'],
        'assoc' => ['정기 총회', '회원사 실무 교육', '해외 전시회 공동관', '기술 세미나'],
        'welfare' => ['김장 나눔 행사', '어르신 건강 체조', '아동 여름 캠프', '자원봉사자 감사의 날'],
        'culture' => ['기획전 개막식', '정기 공연 무대', '어린이 미술 교실', '야간 개장'],
        'museum' => ['기획전 개막식', '도슨트 해설 현장', '어린이 미술 교실', '야간 개장'],
        'library' => ['작가 초청 북토크', '어린이 책 읽기 교실', '독서 토론 모임', '도서관 주간 행사'],
        'council' => ['본회의 현장', '현장 의정 활동', '주민 간담회', '청소년 의회 교실'],
        'biz' => ['신제품 발표회', '고객 초청 세미나', '전시회 부스', '파트너 데이'],
    ];

    /** 고객 사례·이용 후기(사진 칸이 '사례'일 때) */
    private const CASES = [
        'biz' => ['A 제조사 — 스마트 공장 데이터 통합', 'B 유통사 — 주문 처리 시간 40% 단축', 'C 병원 — 예약 시스템 클라우드 전환', 'D 공공기관 — 보안 관제 고도화'],
        'default' => ['이용자 이야기 — 다시 찾은 일상', '참여 후기 — 함께여서 든든했어요', '현장 이야기 — 달라진 하루', '감사 편지 — 고맙습니다'],
    ];

    /** 영상·SNS 한 줄 */
    private const VIDEO = [
        'local' => '{org} 가을 축제 하이라이트 영상', 'gov' => '1분 정책 브리핑 — 이번 주 달라지는 것', 'corp' => '{org} 사업 소개 영상',
        'school' => '우리 학교의 하루 브이로그', 'edu' => '1분 교육 정책 — 늘봄학교 이야기', 'univ' => '{org} 홍보 영상 「캠퍼스의 하루」',
        'assoc' => '기술 세미나 다시 보기', 'welfare' => '나눔 바자회 현장 스케치', 'culture' => '기획전 작가 인터뷰 영상', 'museum' => '기획전 작가 인터뷰 영상',
        'library' => '작가 초청 북토크 다시 보기', 'council' => '본회의 생중계 다시 보기', 'biz' => '고객 사례 인터뷰 영상',
    ];

    /** 배너존 — 캠페인·안내 배너 문구(게시물 제목과 겹치지 않게) */
    private const BANNER = [
        'local' => ['청렴 신고센터 운영 안내', '안전신문고 — 생활 속 위험 신고', '적극행정 국민 신청', '개인정보 보호 캠페인'],
        'gov' => ['청렴 신고센터 운영 안내', '국민 정책 제안 공모', '적극행정 국민 신청', '정부24 바로가기'],
        'corp' => ['청렴 신고센터 운영 안내', '고객 소리함', '경영 공시 바로가기', '윤리 경영 실천 서약'],
        'school' => ['학교폭력 신고 117', '안전한 등굣길 캠페인', '학부모 상담 예약', '방과후 학교 수강 신청'],
        'edu' => ['학교폭력 신고 117', '늘봄학교 신청 안내', '교육비 지원 신청', '청렴 신고센터 운영 안내'],
        'univ' => ['2027학년도 수시모집', '국제 하계 프로그램 모집', '창업지원단 입주 기업 모집', '평생교육원 수강생 모집'],
        'assoc' => ['신규 회원사 모집', '해외 전시회 공동관 참가 신청', '자격 시험 원서 접수', '정기 총회 참석 신청'],
        'welfare' => ['정기 후원 회원 모집', '자원봉사자 모집', '나눔 바자회 물품 기부', '무료 법률 상담'],
        'culture' => ['가을 기획전 「빛의 정원」', '문화가 있는 날', '어린이 미술 교실 모집', '단체 관람 예약'],
        'museum' => ['가을 기획전 「빛의 정원」', '문화가 있는 날', '어린이 미술 교실 모집', '단체 관람 예약'],
        'library' => ['희망 도서 신청', '전자책 대출 서비스', '독서의 달 행사', '상호대차 서비스'],
        'council' => ['의회에 바란다', '본회의 방청 신청', '의정 모니터단 모집', '청렴 신고센터 운영 안내'],
        'biz' => ['무료 체험 신청', '도입 상담 예약', '기술 세미나 사전 등록', '파트너 프로그램 모집'],
    ];

    /** 행동 유도 띠(문의·상담·신청 띠) [문구, 단추] */
    private const CTA = [
        'biz' => ['도입이 궁금하신가요? 전문가가 도와드립니다', '도입 문의 · 상담 신청'],
        'univ' => ['입학 상담, 지금 신청하세요', '입학 상담 신청'],
        'welfare' => ['후원과 자원봉사로 함께해 주세요', '후원 신청 · 자원봉사'],
        'assoc' => ['회원사가 되어 함께 성장하세요', '회원 가입 안내'],
        'default' => ['{org}에 바라는 점을 들려주세요', '의견 보내기'],
    ];

    /** 일정 */
    private const EVENTS = [
        'local' => ['이달의 행사', ['10.03 {res}의 날 기념식', '10.12 가을 음악회', '10.25 도서관 북페스타']],
        'gov' => ['주요 일정', ['10.08 정책 설명회', '10.17 국민 참여 토론회', '10.29 업무 협약식']],
        'corp' => ['행사 일정', ['10.10 사업 설명회', '10.21 고객 간담회', '10.30 성과 공유회']],
        'school' => ['학사 일정', ['10.10 가을 체육대회', '10.22 진로 체험의 날', '10.30 학부모 상담']],
        'edu' => ['주요 일정', ['10.10 교원 연수', '10.21 학부모 설명회', '11.03 고입 전형 원서 접수']],
        'univ' => ['학사 일정', ['10.14~10.20 중간고사', '10.28 수강 철회 마감', '11.03 수시 면접']],
        'assoc' => ['행사 일정', ['10.15 정기 세미나', '10.24 회원사 교육', '11.06 정기 총회']],
        'welfare' => ['이달의 프로그램', ['10.08 어르신 건강검진', '10.18 나눔 바자회', '10.29 자원봉사자 교육']],
        'culture' => ['이달의 일정', ['10.04 기획전 개막', '10.18 정기 공연', '10.26 작가와의 대화']],
        'museum' => ['이달의 일정', ['10.04 기획전 개막', '10.18 도슨트 특강', '10.26 작가와의 대화']],
        'library' => ['이달의 행사', ['10.11 작가 초청 북토크', '10.19 그림책 읽기', '10.30 독서 토론']],
        'council' => ['의사 일정', ['10.07 임시회 개회', '10.15 행정사무감사', '10.28 본회의']],
        'biz' => ['행사 일정', ['10.16 기술 세미나', '10.23 고객 초청 행사', '11.05 전시회 참가']],
    ];

    private const FAQ = [
        'local' => ['여권 재발급은 어디서 하나요?', '대형 폐기물은 어떻게 버리나요?', '주민등록 등본을 온라인으로 뗄 수 있나요?'],
        'univ' => ['휴학 신청은 언제 하나요?', '성적 증명서는 어떻게 발급받나요?', '기숙사 신청 자격은 무엇인가요?'],
        'school' => ['전학 절차는 어떻게 되나요?', '방과후 학교 신청은 언제 하나요?', '급식비 지원 대상은 누구인가요?'],
        'edu' => ['고입 전형 일정은 언제인가요?', '교육비 지원 대상은 누구인가요?', '학교 민원은 어디에 내나요?'],
        'welfare' => ['프로그램 신청은 어떻게 하나요?', '후원금 영수증을 받을 수 있나요?', '이용 대상은 누구인가요?'],
        'culture' => ['관람 예약은 꼭 해야 하나요?', '단체 관람 할인이 있나요?', '주차할 수 있나요?'],
        'library' => ['책은 몇 권까지 빌릴 수 있나요?', '휴관일은 언제인가요?', '열람실 예약은 어떻게 하나요?'],
        'council' => ['방청은 어떻게 신청하나요?', '회의록은 어디서 보나요?', '의원에게 의견을 보내려면 어떻게 하나요?'],
        'biz' => ['도입 비용은 어떻게 되나요?', '무료 체험이 있나요?', '기술 지원 시간은 언제인가요?'],
        'default' => ['신청 자격은 어떻게 되나요?', '처리 기간은 얼마나 걸리나요?', '필요 서류는 무엇인가요?'],
    ];

    private const DEPTS = [
        'local' => ['기획예산과', '일자리정책과', '복지정책과', '안전총괄과', '홍보담당관'],
        'gov' => ['운영지원과', '기획조정실', '정책기획관', '대변인실', '디지털혁신과'],
        'corp' => ['경영기획실', '사업운영본부', '고객지원팀', '디지털혁신팀', '감사실'],
        'school' => ['교무기획부', '교육과정부', '학생생활부', '진로진학부', '행정실'],
        'edu' => ['교육정책과', '초등교육과', '중등교육과', '교육복지과', '행정과'],
        'univ' => ['교무처', '학생처', '입학처', '기획처', '산학협력단'],
        'assoc' => ['사무국', '회원지원팀', '교육사업팀', '정책연구팀'],
        'welfare' => ['기획운영팀', '사례관리팀', '지역조직팀', '어르신복지팀'],
        'culture' => ['전시기획팀', '공연사업팀', '교육팀', '시설운영팀'],
        'museum' => ['학예연구실', '교육팀', '전시운영팀', '시설관리팀'],
        'library' => ['자료운영팀', '독서문화팀', '열람지원팀', '행정지원팀'],
        'council' => ['의사담당관', '의정담당관', '전문위원실', '홍보담당관'],
        'biz' => ['경영지원팀', '사업기획팀', '고객지원팀', '연구개발팀'],
    ];

    /** 인사말 제목(SampleContent greetTitles 를 종류별로) */
    private const GREET = [
        'local' => '소통으로 답을 찾는 {org}, 늘 곁에 있겠습니다',
        'gov' => '국민 곁에서 답을 찾는 {org|이/가} 되겠습니다',
        'corp' => '신뢰받는 {org|으로/로} 거듭나겠습니다',
        'school' => '함께 배우고 함께 자라는 {org}',
        'edu' => '아이들의 꿈을 함께 키우는 {org}',
        'univ' => '가능성을 끝까지 함께 키우는 {org}',
        'assoc' => '회원과 함께 내일을 여는 {org}',
        'welfare' => '이웃의 하루를 살피는 {org|이/가} 되겠습니다',
        'culture' => '일상 가까이에서 예술을 만나는 곳',
        'museum' => '일상 가까이에서 예술을 만나는 {unit}',
        'library' => '누구나 머물고 싶은 도서관을 만들겠습니다',
        'council' => '{res}의 목소리에 귀 기울이는 의회',
        'biz' => '고객과 함께 성장하는 {org}',
    ];

    /** 제목이 쪽 제목·앞 칸과 겹칠 때 쓰는 다른 제목 */
    private const ALT_T = ['location_map' => '지도·교통 안내', 'timeline' => '연도별 발자취', 'faq_list' => '질문과 답', 'form' => '신청서 작성', 'photo_gallery' => '사진 목록',
        'content_block' => '자세히 알아보기', 'info_table' => '한눈에 보는 표', 'step_flow' => '단계별 안내', 'org_chart' => '조직 구성', 'sitemap' => '메뉴 한눈에 보기',
        'board_list' => '게시물 목록', 'quick_links' => '분야별 바로가기', 'news_tabs' => '새 소식', 'banner_zone' => '함께 알면 좋은 정보', 'calendar' => '다가오는 일정'];

    /** 섹션 → 샘플 그림 종류(Samples::FOR_SECTION 첫 후보, 종류에 따라 바꿈)와 한글 이름 */
    private const IMG_FOR = ['main_visual' => 'hero-city', 'hero' => 'hero-nature', 'sub_visual' => 'sub-visual', 'greeting_vision' => 'leader', 'news_tabs' => 'news-thumb',
        'sns_video' => 'video-thumb', 'banner_zone' => 'banner', 'popup_zone' => 'popup', 'quick_links' => 'icon-set', 'stats' => 'infographic', 'stat_cards' => 'infographic',
        'location_map' => 'building-illust', 'timeline' => 'archive-photo', 'text_band' => 'pattern-bg', 'photo_gallery' => 'place', 'tour_cards' => 'tour', 'content_block' => 'citizen'];
    private const IMG_KO = ['hero-city' => '도시 풍경 사진', 'hero-nature' => '자연 풍경 사진', 'sub-visual' => '서브 비주얼 사진', 'leader' => '기관장 사진', 'news-thumb' => '소식 썸네일',
        'video-thumb' => '영상 썸네일', 'banner' => '배너 그림', 'popup' => '팝업 그림', 'icon-set' => '아이콘 세트', 'infographic' => '인포그래픽', 'building-illust' => '건물 일러스트',
        'archive-photo' => '기록 사진', 'pattern-bg' => '패턴 배경', 'tour' => '관광 사진', 'place' => '장소 사진', 'citizen' => '사람들 사진'];

    /** 표에서 종류의 값 — 없으면 FALL, 그래도 없으면 default·local */
    private static function tab(array $t, string $kind): mixed
    {
        return $t[$kind] ?? $t[self::FALL[$kind] ?? ''] ?? $t['default'] ?? $t['local'];
    }

    /**
     * 가상 기관 — 기관 묶음($org)의 기본 가상 기관. $name(고객이 준 기관명)이 있으면 그 이름 끝말로 종류·직함·주민 호칭을 맞추고,
     * 없으면 요청 글($hint)의 낱말로 묶음 안 종류만 좁힌다(단체·복지 + '복지관' → 복지관, 문화 + '미술관' → 미술관).
     */
    public static function persona(string $org, string $name = '', string $hint = ''): array
    {
        $base = self::PERSONA[$org] ?? self::PERSONA['all'];
        $name = trim(mb_substr(strip_tags($name), 0, 40));
        if ($name !== '' && mb_strlen($name) >= 2) {
            $base = self::named($name, $base);
        } elseif ($hint !== '') {
            $base = match (true) {
                in_array($org, ['civic', 'all', 'public'], true) && (bool) preg_match('/복지관|복지센터|사회복지|돌봄|요양/u', $hint) => ['한빛종합사회복지관', '관장', '이용자', 'welfare', '한빛종합사회복지관'],
                in_array($org, ['culture', 'civic', 'public', 'all'], true) && str_contains($hint, '도서관') => ['한빛시립도서관', '관장', '이용자', 'library', '한빛시립도서관'],
                in_array($org, ['culture', 'all'], true) && (bool) preg_match('/미술관|박물관|갤러리/u', $hint) => ['한빛미술관', '관장', '관람객', 'museum', '한빛미술관'],
                in_array($org, ['education', 'all'], true) && str_contains($hint, '교육청') => ['한빛시교육청', '교육감', '교육가족', 'edu', '한빛시교육청'],
                in_array($org, ['local', 'all'], true) && str_contains($hint, '의회') => ['한빛시의회', '의장', '시민', 'council', '한빛시의회'],
                default => $base,
            };
        }
        [$o, $t, $r, $kind, $office] = $base;
        return self::finish(['org' => $o, 'title' => $t, 'resident' => $r, 'kind' => $kind, 'office' => $office]);
    }

    /** 고객 기관명 끝말 → [이름, 직함, 주민 호칭, 종류, 청사]. 모르는 끝말이면 묶음 기본값의 직함·종류를 그대로 쓴다. */
    private static function named(string $n, array $base): array
    {
        $loc = static function (string $n, string $title, string $res): array {
            $org = (string) preg_replace('/(시|군|구|도)청$/u', '$1', $n);
            return [$org, $title, $res, 'local', $org . '청'];
        };
        return match (true) {
            (bool) preg_match('/대학교$|대학$|대학원$|과학기술원$/u', $n) => [$n, '총장', '학생', 'univ', $n],
            (bool) preg_match('/학교$/u', $n) => [$n, '교장', '학생', 'school', $n],
            (bool) preg_match('/교육청$/u', $n) => [$n, '교육감', '교육가족', 'edu', $n],
            (bool) preg_match('/의회$/u', $n) => [$n, '의장', str_contains($n, '군의회') ? '군민' : (str_contains($n, '구의회') ? '구민' : (str_contains($n, '도의회') ? '도민' : '시민')), 'council', $n],
            (bool) preg_match('/복지관|복지센터|요양|돌봄/u', $n) => [$n, '관장', '이용자', 'welfare', $n],
            (bool) preg_match('/도서관/u', $n) => [$n, '관장', '이용자', 'library', $n],
            (bool) preg_match('/미술관|박물관|갤러리/u', $n) => [$n, '관장', '관람객', 'museum', $n],
            (bool) preg_match('/아트센터|문화예술회관|공연장|문화회관/u', $n) => [$n, '관장', '관람객', 'culture', $n],
            str_contains($n, '재단') => [$n, '이사장', '시민', 'foundation', $n],
            (bool) preg_match('/협회$|학회$|연합회$|협의회$|조합$|연맹$/u', $n) => [$n, '회장', '회원', 'assoc', $n],
            (bool) preg_match('/\(주\)|㈜|주식회사|솔루션|테크$|소프트|그룹$|컴퍼니|랩$|스튜디오/u', $n) => [$n, '대표이사', '고객', 'biz', $n],
            (bool) preg_match('/공사$/u', $n) => [$n, '사장', '국민', 'corp', $n],
            (bool) preg_match('/공단$/u', $n) => [$n, '이사장', '국민', 'corp', $n],
            (bool) preg_match('/위원회$/u', $n) => [$n, '위원장', '국민', 'gov', '정부한빛청사'],
            (bool) preg_match('/(진흥원|연구원|평가원|정보원|원)$/u', $n) && $base[3] !== 'local' => [$n, '원장', '국민', 'corp', $n],
            // 중앙부처 끝말 — '기후안전부'·'국가보훈처'·'미래데이터청'(시청·군청·구청·도청은 지자체로 아래에서)
            (bool) preg_match('/[가-힣]{2,}부$/u', $n) && !in_array($base[3], ['univ', 'school'], true) => [$n, '장관', '국민', 'gov', '정부한빛청사'],
            (bool) preg_match('/[가-힣]{2,}처$/u', $n) => [$n, '처장', '국민', 'gov', '정부한빛청사'],
            (bool) preg_match('/[가-힣]{2,}[^시군구도]청$/u', $n) => [$n, '청장', '국민', 'gov', '정부한빛청사'],
            (bool) preg_match('/(특별자치)?도(청)?$/u', $n) => $loc($n, '도지사', '도민'),
            (bool) preg_match('/군(청)?$/u', $n) => $loc($n, '군수', '군민'),
            (bool) preg_match('/구(청)?$/u', $n) => $loc($n, '구청장', '구민'),
            (bool) preg_match('/시(청)?$/u', $n) => $loc($n, '시장', '시민'),
            default => [$n, $base[1], $base[2], $base[3], $n],
        };
    }

    /**
     * 재현 묶음(mock_get_replica_kit)의 persona 를 그대로 쓴다 — 이름·직함·기관장 이름·주민 호칭이 묶음과 같아야
     * MCP 가 칸 content 를 이름만 바꿔 붙이다 생긴 어긋남(교육청 '교장 최서연', '청운군가')이 없다.
     */
    public static function fromKit(array $kp, string $org): array
    {
        $s = static fn ($v, int $max = 60): string => is_string($v) ? trim(mb_substr(strip_tags($v), 0, $max)) : '';
        $name = $s($kp['org'] ?? '', 40);
        $base = self::named($name, self::PERSONA[$org] ?? self::PERSONA['all']);
        $kind = $s($kp['kind'] ?? '', 20);
        if ($kind === 'culture' && preg_match('/미술관|박물관|갤러리/u', $name)) {
            $kind = 'museum';
        }
        if (!isset(self::SLOGANS[$kind]) && !isset(self::FALL[$kind])) {
            $kind = $base[3];
        }
        $p = ['org' => $name, 'title' => $s($kp['title'] ?? '', 20) ?: $base[1], 'resident' => $s($kp['resident'] ?? '', 20) ?: $base[2], 'kind' => $kind,
            'office' => $s($kp['office'] ?? '', 40) ?: $base[4]];
        foreach (['name' => 20, 'head' => 40, 'address' => 120, 'phone' => 20] as $f => $max) {
            if (($v = $s($kp[$f] ?? '', $max)) !== '') {
                $p[$f] = $v;
            }
        }
        return self::finish($p);
    }

    /** 이름·기관장 호칭·주소·전화 채우기 */
    private static function finish(array $p): array
    {
        $org = $p['org'];
        $kind = $p['kind'];
        $p['name'] ??= self::NAMES[crc32($org) % count(self::NAMES)];
        if (empty($p['head'])) {
            // 한빛시+시장 → 한빛시장, 청운군+군수 → 청운군수 (ReplicaKit::personaOut 과 같은 규칙)
            $p['head'] = in_array($kind, ['local', 'gov', 'edu', 'council'], true) && mb_substr($p['title'], 0, 1) === mb_substr($org, -1)
                ? mb_substr($org, 0, -1) . $p['title'] : $org . ' ' . $p['title'];
        }
        $p['address'] ??= '(12345) ' . match ($kind) { 'gov' => '한빛특별자치시 정부청사로 100 ' . $p['office'], 'local' => $org . ' 중앙로 100 ' . $p['office'], default => '한빛시 중앙로 100 ' . $org };
        $p['phone'] ??= '1234-5678';
        $p['short'] = in_array($kind, ['local', 'edu', 'council'], true) ? ((string) preg_replace('/(특별자치시|특별자치도|광역시|교육청|의회|시|군|구|도)$/u', '', $org) ?: $org) : $org;
        $p['rip'] = match (true) { str_ends_with($org, '군') => '군립', str_ends_with($org, '구') => '구립', str_ends_with($org, '도') => '도립', default => '시립' };
        $p['unit'] = preg_match('/(미술관|박물관|갤러리|도서관|복지관|아트센터)$/u', $org, $m) ? $m[1] : match ($kind) { 'museum' => '미술관', 'library' => '도서관', 'welfare' => '복지관', default => '기관' };
        return $p;
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

    /** {org}·{res}·{short}·{rip}·{unit}·{head} 와 {org|이/가} 채우기 */
    private static function tpl(string $s, array $p): string
    {
        return (string) preg_replace_callback('/\{(org|res|short|rip|unit|head)(?:\|([^\/}]+)\/([^}]+))?\}/u', static function (array $m) use ($p): string {
            $w = (string) ($m[1] === 'res' ? $p['resident'] : $p[$m[1]]);
            return isset($m[2]) && $m[2] !== '' ? self::josa($w, $m[2], $m[3]) : $w;
        }, $s);
    }

    /** 요청 글의 업무 주제 — '여권 발급 절차' → [여권, 발급]. 서브 안내 화면(절차·콘텐츠·폼·FAQ)의 쪽 이름·절차·표에 쓴다. */
    public static function topic(string $req): ?array
    {
        if (preg_match('/([가-힣A-Za-z0-9]{2,10})\s*(재발급|발급|신청|접수|등록|예약|신고)/u', $req, $m) && !in_array($m[1], ['온라인', '민원', '서류', '이용'], true)) {
            return ['word' => $m[1], 'act' => $m[2]];
        }
        return null;
    }

    /** 재현 묶음 menu.items 트리 → [top 이름 목록, 화면 → [상위, 쪽 이름]] */
    private static function menuTree(mixed $menu, string $org): array
    {
        $items = is_array($menu) ? ($menu['items'] ?? $menu) : [];
        $top = [];
        $page = [];
        foreach (is_array($items) ? array_slice($items, 0, 9) : [] as $it) {
            $name = is_array($it) ? trim(mb_substr(strip_tags((string) ($it['name'] ?? '')), 0, 30)) : (is_string($it) ? trim(mb_substr($it, 0, 30)) : '');
            if ($name === '') {
                continue;
            }
            $top[] = $name;
            foreach ((array) (is_array($it) ? ($it['children'] ?? []) : []) as $ch) {
                $pg = is_array($ch) ? (string) ($ch['page'] ?? '') : '';
                $cn = is_array($ch) ? trim(str_replace($org . ' ', '', mb_substr(strip_tags((string) ($ch['name'] ?? '')), 0, 30))) : '';
                if ($pg !== '' && $cn !== '' && !isset($page[$pg])) {
                    $page[$pg] = [$name, $cn];
                }
            }
        }
        return [array_slice($top, 0, 6), $page];
    }

    /** 화면 종류 → [쪽 이름, 상위 메뉴] — 상위 메뉴는 그 종류 MENU 안의 이름(헤더 항목과 경로가 같은 말) */
    private static function pageOf(string $screen, array $p, array $ctx): array
    {
        $kind = $p['kind'];
        if (isset($ctx['tree'][$screen])) {
            [$parent, $name] = $ctx['tree'][$screen];
            if ($screen !== 'procedure' || empty($ctx['topic'])) {
                return [$name, $parent];
            }
        }
        $menu = $ctx['menu'] ?: array_map(static fn ($s) => self::tpl($s, $p), self::tab(self::MENU, $kind));
        $find = static function (string $re, int $fallback) use ($menu): string {
            foreach ($menu as $m) {
                if (preg_match($re, $m)) {
                    return $m;
                }
            }
            return $menu[min($fallback, count($menu) - 1)] ?? '홈';
        };
        $about = $find('/소개/u', 0);
        $news = $find('/알림|소식|공지/u', 2);
        $join = $find('/참여|신청|열린/u', 3);
        $info = $find('/정보|안내|정책|사업|지원|서비스/u', 1);
        $t = $ctx['topic'] ?? null;
        $parentProc = isset($ctx['tree']['procedure']) ? $ctx['tree']['procedure'][0] : $info;
        return match ($screen) {
            'board_list', 'board_view' => [$kind === 'school' ? '가정통신문' : '공지사항', $news],
            'board_gallery' => ['포토 갤러리', $news],
            'form' => [$t ? $t['word'] . ' ' . $t['act'] : '온라인 신청', $join],
            'greeting' => [match ($kind) { 'edu' => '교육감 인사말', 'univ' => '총장 인사말', 'council' => '의장 인사말', default => '인사말' }, $about],
            'org_chart' => ['조직도', $about],
            'location' => ['찾아오시는 길', $about],
            'history' => ['연혁', $about],
            'vision' => ['비전·목표', $about],
            'procedure' => [$t ? $t['word'] . ' ' . $t['act'] . ' 안내' : '이용 절차', $parentProc],
            'faq' => ['자주 묻는 질문', $join],
            'search' => ['통합검색', '홈'],
            'sitemap' => ['사이트맵', '홈'],
            'info_disclosure' => ['정보공개', $find('/정보공개|공시/u', 4)],
            'content' => [$t ? $t['word'] . ' 안내' : ($menu[1] ?? '사업 안내'), $menu[0] ?? '분야별 정보'],
            default => ['메인', '홈'],
        };
    }

    /**
     * 칸 하나의 예시 내용 — {t, s?, items?, img?}.
     * $label = 와이어 칸 설명(원형의 '사업 카드 1'·'행동 유도 띠' 등) — 같은 칸 종류라도 설명에 맞춰 글을 바꾼다.
     * $used = 이 화면에서 이미 쓴 문장(같은 문장 반복 금지), $ctx = {req, topic, menu, tree}.
     */
    public static function cell(string $k, array $p, int $seed, string $screen, int $nth = 0, string $label = '', array &$used = [], array $ctx = []): array
    {
        $kind = $p['kind'];
        $org = $p['org'];
        $ctx += ['req' => '', 'topic' => null, 'menu' => [], 'tree' => []];
        $before = $used;   // 이 칸 전에 이미 쓴 글 — 끝에서 제목이 겹치면 바꾼다
        $T = static fn (array $a): array => array_map(static fn ($s) => self::tpl((string) $s, $p), $a);
        // 아직 안 쓴 것 하나(다 썼으면 차례대로)
        $fresh = static function (array $cands, int $o = 0) use (&$used): string {
            $n = count($cands);
            for ($i = 0; $i < $n; $i++) {
                $s = $cands[(($o % $n) + $n + $i) % $n];
                if (!isset($used[$s])) {
                    $used[$s] = true;
                    return $s;
                }
            }
            return $cands[(($o % $n) + $n) % $n];
        };
        $freshN = static function (array $cands, int $o, int $n) use ($fresh): array {
            $out = [];
            for ($i = 0; $i < $n; $i++) {
                $out[] = $fresh($cands, $o + $i);
            }
            return $out;
        };
        $slogans = $T(self::tab(self::SLOGANS, $kind));
        $sub = self::tpl(self::tab(self::SUB, $kind), $p);
        $boards = $T(self::tab(self::BOARDS, $kind));
        $tabs = self::tab(self::TABS, $kind);
        $quick = self::tab(self::QUICK, $kind);
        [$cardsT, $cardsI] = self::tab(self::CARDS, $kind);
        $cardsI = $T($cardsI);
        $cardsD = $T(self::tab(self::CARD_DESC, $kind));
        $menuItems = $ctx['menu'] ?: $T(self::tab(self::MENU, $kind));
        [$page, $menu] = self::pageOf($screen, $p, $ctx);
        $lab = $label;
        $req = (string) $ctx['req'];
        $topic = $ctx['topic'];
        $out = match ($k) {
            'masthead' => ['t' => in_array($kind, self::KRDS, true) ? '이 누리집은 대한민국 공식 전자정부 누리집입니다.' : $org . ' 공식 홈페이지'],
            'header' => ['t' => $org, 'items' => $menuItems],
            'main_visual', 'hero' => ['t' => $fresh($slogans, $seed + ($k === 'hero' ? 2 : 0)), 's' => $fresh([$sub, self::tpl(self::tab(self::ABOUT, $kind), $p)])],
            'text_band' => preg_match('/유도|문의|상담|신청|가입/u', $lab)
                ? ['t' => $fresh([self::tpl(self::tab(self::CTA, $kind)[0], $p)]), 's' => self::tab(self::CTA, $kind)[1]]
                : ['t' => $fresh($slogans, $seed + 1 + $nth), 's' => '자세히 보기'],
            'sub_visual' => ['t' => $menu, 's' => $fresh($slogans, $seed + 3)],
            'breadcrumb' => ['t' => '홈 > ' . $menu . ' > ' . $page],
            'page_title' => ['t' => $page],
            'main_search' => ['t' => $kind === 'biz' ? '무엇을 도와드릴까요?' : '무엇을 찾으세요?', 's' => '추천 검색어: ' . implode(' · ', array_slice($quick, 0, 3))],
            'ai_chatbot' => ['t' => 'AI 상담', 's' => '예: ' . self::tab(self::FAQ, $kind)[0]],
            'quick_links' => ['t' => $nth > 0 ? '분야별 서비스' : ($kind === 'univ' || $kind === 'school' ? '자주 찾는 메뉴' : '자주 찾는 서비스'),
                'items' => $nth > 0 ? array_values(array_slice(array_merge(array_slice($quick, 6), array_slice($quick, 0, 6)), 0, 6)) : array_slice($quick, 0, 6)],
            'news_tabs' => ['t' => implode(' · ', array_slice(array_merge(array_slice($tabs, $nth % count($tabs)), array_slice($tabs, 0, $nth % count($tabs))), 0, 3)) . ($nth > 0 && $nth % count($tabs) === 0 ? ' (' . ($nth + 1) . ')' : ''),
                'items' => $freshN($boards, $seed + $nth * 3, 3)],
            'news_ticker' => ['t' => '알림', 's' => $fresh($boards, $seed + 5)],
            'popup_zone' => preg_match('/입학|입시/u', $lab . ' ' . $req) && $kind === 'univ'
                ? ['t' => '입시 안내', 's' => $fresh(['2027학년도 수시모집 원서 접수 안내', '2027학년도 정시모집 요강 발표', '입학 설명회 참가 신청'])]
                : ['t' => '알림판', 's' => $fresh($boards, $seed + 3)],
            'banner_zone' => ['t' => preg_match('/입학/u', $lab) ? '입학·행사 배너' : ($nth > 0 ? '함께 알면 좋은 정보' : '알림 배너'),'items' => $freshN($T(self::tab(self::BANNER, $kind)), $seed + $nth * 2, 3)],
            'calendar' => ['t' => self::tab(self::EVENTS, $kind)[0], 'items' => $T(self::tab(self::EVENTS, $kind)[1])],
            'sns_video' => ['t' => $org . ' 영상·SNS', 's' => $fresh([self::tpl(self::tab(self::VIDEO, $kind), $p), $org . ' 공식 SNS 새 소식'])],
            'greeting_vision' => ['t' => self::tpl(self::tab(self::GREET, $kind), $p), 's' => '안녕하십니까? ' . $p['head'] . ' ' . $p['name'] . '입니다.', 'sign' => $p['head'] . ' ' . $p['name']],
            'stats', 'stat_cards' => match (true) {
                (bool) preg_match('/AI|상담/u', $lab) => ['t' => '이번 주 AI 상담 현황', 'items' => ['AI 상담 1,240건', '평균 답변 8초', '바로 해결 82%', '만족도 4.6점']],
                (bool) preg_match('/처리 현황|처리/u', $lab) => ['t' => '분야별 처리 현황', 'items' => ['접수 3,420건', '처리 완료 3,310건', '평균 처리 2.4일', '만족도 4.5점']],
                default => ['t' => '숫자로 보는 ' . $org, 'items' => $T(self::tab(self::STATS, $kind))],
            },
            'tour_cards' => match (true) {
                (bool) preg_match('/학과|전공/u', $lab) => ['t' => '학과·전공', 'items' => self::CARDS['univ'][1]],
                (bool) preg_match('/추천 코스/u', $lab) => ['t' => '추천 코스', 'items' => ['반나절 산책 코스', '하루 미식 코스', '1박 2일 자연 코스']],
                default => ['t' => $cardsT, 'items' => $cardsI, 'desc' => $cardsD],
            },
            'photo_gallery' => preg_match('/사례|후기/u', $lab)
                ? ['t' => $kind === 'biz' ? '고객 사례' : '이용 후기', 'items' => self::CASES[$kind] ?? self::CASES['default']]
                : ['t' => match ($kind) { 'univ' => '캠퍼스 포토', 'culture', 'museum' => '전시 사진', 'biz' => '현장 사진', default => '포토 갤러리' }, 's' => $fresh($T(self::tab(self::GALLERY, $kind)), $seed + $nth)],
            'content_block' => match (true) {
                $screen === 'vision' => ['t' => '비전 — ' . $fresh($slogans, $seed + 4), 's' => $fresh([$sub, self::tpl(self::tab(self::ABOUT, $kind), $p)])],
                $screen === 'main' && (bool) preg_match('/소개$|소개(?!\s*카드)|이야기/u', $lab) && !preg_match('/카드/u', $lab) => ['t' => $kind === 'biz' ? '회사 소개' : $org . ' 소개', 's' => $fresh([self::tpl(self::tab(self::ABOUT, $kind), $p), $sub])],
                // 카드 번호는 '소개' 칸을 뺀 카드끼리 센다(회사 소개 칸 뒤 첫 카드가 둘째 항목부터 나오던 것)
                $screen === 'main' => (static function () use (&$used, $cardsI, $cardsD): array {
                    $ci = $used["\0card"] = isset($used["\0card"]) ? $used["\0card"] + 1 : 0;
                    return ['t' => $cardsI[$ci % 4], 's' => $cardsD[$ci % 4]];
                })(),
                $topic !== null => ['t' => $topic['word'] . ' 안내', 's' => $topic['word'] . ' ' . $topic['act'] . ' 대상·방법·문의처를 안내합니다.'],
                default => ['t' => $page . ' 안내', 's' => $fresh([$sub, self::tpl(self::tab(self::ABOUT, $kind), $p)])],
            },
            'board_list' => ['t' => $screen === 'search' ? '검색 결과 128건' : '전체 게시물 128건','items' => $freshN($boards, $seed, 4)],
            'board_view' => ['t' => $fresh($boards, $seed + 1), 's' => '작성 ' . self::tab(self::DEPTS, $kind)[0] . ' · 2026.09.24 · 조회 1,234 · 첨부 1'],
            'form' => ['t' => $topic ? $topic['word'] . ' ' . $topic['act'] : '온라인 신청', 'items' => ['신청인 정보', '신청 내용', '개인정보 수집 동의', '제출']],
            'notice_box' => ['t' => '신청 전 확인하세요', 's' => '처리 기간은 접수일로부터 7일(공휴일 제외)입니다.'],
            'info_table' => match (true) {
                $screen === 'org_chart' => ['t' => '부서별 담당 업무', 's' => '부서 · 담당 업무 · 전화'],
                $screen === 'info_disclosure' => ['t' => '공개 목록', 's' => '구분 · 내용 · 담당 부서 · 전화'],
                $screen === 'procedure' || $topic !== null => self::feeTable($topic, $req),
                default => ['t' => '안내 표', 's' => '구분 · 내용 · 담당 부서 · 전화'],
            },
            'org_chart' => ['t' => $org . ' 조직도', 'items' => self::tab(self::DEPTS, $kind)],
            'location_map' => ['t' => '찾아오시는 길', 's' => $p['address']],
            'contact_info' => ['t' => '문의처', 's' => '대표전화 ' . $p['phone'] . ' · 팩스 1234-5679 · 평일 09:00~18:00'],
            'timeline' => ['t' => '연혁', 'items' => ['2026 누리집 전면 개편', '2020 온라인 서비스 시작', '2010 새 청사 이전', '1995 ' . match ($kind) { 'univ', 'school' => '개교', 'local', 'gov', 'edu' => '개청', 'council' => '개원', default => '설립' }]],
            'step_flow' => self::steps($topic),
            'faq_list' => ['t' => '자주 묻는 질문', 'items' => self::tab(self::FAQ, $kind)],
            'content_tabs' => ['t' => '분류', 'items' => $screen === 'search' ? ['전체', '메뉴', '게시물', '파일'] : array_slice($tabs, 0, 4)],
            'sitemap' => ['t' => '전체 메뉴', 'items' => $menuItems],
            'satisfaction' => ['t' => '이 페이지에서 제공하는 정보에 만족하십니까?', 's' => '매우 만족 · 만족 · 보통 · 불만족'],
            'footer' => ['t' => $org, 's' => $p['address'] . ' · 대표전화 ' . $p['phone']],
            'kit_identifier' => ['t' => $org . ' 운영'],
            default => [],
        };
        // 같은 제목·한 줄 금지 — 쪽 제목(h1)과 본문 칸 제목이 같거나(찾아오시는 길·연혁), 같은 칸이 두 번이면 다른 말로
        if (isset($out['t']) && isset($before[$out['t']]) && !in_array($k, ['header', 'footer', 'masthead', 'satisfaction', 'kit_identifier', 'breadcrumb'], true)) {
            $alt = self::ALT_T[$k] ?? null;
            if ($alt !== null && !isset($used[$alt])) {
                $out['t'] = $alt;
            } else {
                $base = $out['t'];
                for ($i = 2; isset($used[$out['t']]) && $i < 20; $i++) {
                    $out['t'] = $base . ' ' . $i;
                }
            }
        }
        if (isset($out['s']) && isset($before[$out['s']]) && !in_array($k, ['footer', 'satisfaction'], true)) {
            if (!isset($used[$sub])) {
                $out['s'] = $sub;
            } else {
                unset($out['s']);
            }
        }
        foreach (['t', 's'] as $f) {
            if (isset($out[$f]) && is_string($out[$f])) {
                $used[$out[$f]] = true;
            }
        }
        if (in_array($k, ['tour_cards', 'calendar', 'photo_gallery'], true)) {
            foreach ((array) ($out['items'] ?? []) as $it) {
                $used[(string) $it] = true;   // 카드 항목과 같은 글을 사진 설명이 다시 쓰지 않게(메뉴·바로가기 이름은 제목과 겹쳐도 된다)
            }
        }
        if (isset(self::IMG_FOR[$k])) {
            $img = self::IMG_FOR[$k];
            if (($k === 'main_visual' || $k === 'hero') && in_array($kind, ['culture', 'museum', 'assoc', 'welfare'], true)) {
                $img = 'hero-nature';
            }
            if ($k === 'photo_gallery' && ($kind === 'biz' || preg_match('/사례|후기/u', $lab))) {
                $img = 'citizen';
            }
            $out['img'] = ['kind' => $img, 'label' => self::IMG_KO[$img] ?? $img];
        }
        return $out;
    }

    /** 절차 단계 — 요청 주제(발급·신청·예약·신고)에 맞춰 */
    private static function steps(?array $t): array
    {
        if ($t === null) {
            return ['t' => '처리 절차', 'items' => ['신청', '접수', '검토', '결과 통보']];
        }
        $items = match ($t['act']) {
            '발급', '재발급' => ['신청서 작성', '접수·서류 확인', '심사', '발급·수령'],
            '예약' => ['날짜·시간 선택', '예약 신청', '확인 문자', '방문 이용'],
            '신고' => ['신고서 작성', '접수', '사실 확인', '처리 결과 안내'],
            default => ['온라인 신청', '서류 접수', '검토', '결과 통보'],
        };
        return ['t' => $t['word'] . ' ' . $t['act'] . ' 절차', 'items' => $items];
    }

    /** 필요 서류·수수료 표 — 요청이 준비물·수수료를 말하면 그 열을 앞에 */
    private static function feeTable(?array $t, string $req): array
    {
        $docs = (bool) preg_match('/준비물|서류/u', $req);
        $fee = str_contains($req, '수수료');
        $name = $t ? $t['word'] . ' ' . $t['act'] . ' ' : '';
        $title = $name . ($docs && !$fee ? '준비물' : ($fee && !$docs ? '수수료' : ($docs ? '준비물·수수료' : '필요 서류·수수료')));
        $items = $t && $t['word'] === '여권'
            ? ['여권 발급 신청서', '여권용 사진 1매', '신분증', '병역 관계 서류(해당자)']
            : ['신청서', '신분증', '증빙 서류', '수수료(종류별)'];
        return ['t' => $title, 's' => '구분 · ' . ($docs ? '준비물' : '서류') . ' · 수수료 · 처리 기간', 'items' => $items];
    }

    /**
     * 와이어 사본에 내용을 채운다 — 원래 칸 설명(t)은 label 로 옮긴다. 저장용이 아니라 보기용.
     * $opt: persona(재현 묶음 persona — 주면 그 기관 그대로), org_name(고객 기관명), request(요청 글 — 주제·종류 낱말), menu(재현 묶음 menu 트리).
     * 와이어에 org_name·request 가 있으면 그것도 본다.
     */
    public static function fill(array $w, array $opt = []): array
    {
        $org = (string) ($w['org'] ?? 'all');
        $screen = (string) ($w['screen'] ?? 'main');
        $req = trim(mb_substr((string) ($opt['request'] ?? $w['request'] ?? ''), 0, 800));
        $orgName = trim((string) ($opt['org_name'] ?? $w['org_name'] ?? ''));
        $kp = is_array($opt['persona'] ?? null) && trim((string) ($opt['persona']['org'] ?? '')) !== '' ? $opt['persona'] : null;
        $p = $kp !== null ? self::fromKit($kp, $org) : self::persona($org, $orgName, $req);
        $source = $kp !== null ? 'kit' : ($orgName !== '' ? 'org_name' : 'virtual');
        [$menu, $tree] = self::menuTree($opt['menu'] ?? ($kp['menu'] ?? null), $p['org']);
        $ctx = ['req' => $req, 'topic' => self::topic($req), 'menu' => $menu, 'tree' => $tree];
        $seed = crc32($screen . '|' . (string) ($w['style'] ?? '') . '|' . (int) ($w['variant'] ?? 0));
        $nth = [];
        $used = [];
        foreach ((array) ($w['rows'] ?? []) as $ri => $r) {
            foreach ((array) ($r['cols'] ?? []) as $ci => $c) {
                if (!is_array($c)) {
                    continue;
                }
                $k = (string) ($c['k'] ?? '');
                $i = $nth[$k] = ($nth[$k] ?? -1) + 1;
                $x = self::cell($k, $p, $seed + $ri, $screen, $i, (string) ($c['t'] ?? ''), $used, $ctx);
                if (!empty($c['t'])) {
                    $x['label'] = (string) $c['t'];
                }
                if (!isset($x['t'])) {
                    $x['t'] = (string) ($c['t'] ?? Wire::typeName($k));
                }
                $w['rows'][$ri]['cols'][$ci] = array_merge($c, $x);
            }
        }
        $w['persona'] = ['org' => $p['org'], 'kind' => $p['kind'], 'title' => $p['title'], 'name' => $p['name'], 'head' => $p['head'], 'resident' => $p['resident'], 'source' => $source];
        return $w;
    }

    /** 요청문용 — 칸마다 한 줄. 여러 칸 줄은 '5-1.'·'5-2.' 로 칸을 구분한다. */
    public static function lines(array $filled): array
    {
        $out = [];
        foreach ((array) ($filled['rows'] ?? []) as $ri => $r) {
            $cols = (array) ($r['cols'] ?? []);
            foreach (array_values($cols) as $ci => $c) {
                $no = ($ri + 1) . (count($cols) > 1 ? '-' . ($ci + 1) : '');
                $s = $no . '. ' . Wire::typeName((string) $c['k']) . ' — "' . $c['t'] . '"';
                if (!empty($c['s'])) {
                    $s .= ' / ' . $c['s'];
                }
                if (!empty($c['items'])) {
                    $s .= ' / 항목: ' . implode(', ', array_slice((array) $c['items'], 0, 6));
                }
                if (!empty($c['desc'])) {
                    $s .= ' / 설명: ' . implode(' · ', array_slice((array) $c['desc'], 0, 4));
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
