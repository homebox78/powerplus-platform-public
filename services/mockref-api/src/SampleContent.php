<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 목업 가상 콘텐츠 (2026-09-25) — 섹션·페이지 코드의 자리표시([기관명]·[1단락]·[게시물 제목]…)를
 * 실제처럼 읽히는 가상 값으로 채운다. 실제 기관·인물 이름은 쓰지 않는다(수집 텍스트에 남은 원 기관명도 가상 이름으로 바꾼다).
 *
 * 문구 근거 = 수집 데이터 실측 (2026-09-25, 로컬 DB):
 *  - 인사말 화면 64장: '소통' 42 · '함께' 30 · '행복' 19 · '약속' 13 · '안녕하십니까' 8 · '감사합니다' 8
 *    → 첫 문장 "안녕하십니까? {기관}{직함} {성명}입니다." (실제 인사말의 가장 흔한 시작), 문단 주제 순서 = 소통 → 함께 → 행복·약속, 끝맺음 "감사합니다."
 *  - 게시판 목록 257장: 안내 236 · 공고 173 · 교육 144 · 채용 130 · 모집 108 · 행사 90 · 입찰 77 · 결과 75 · 지원사업 63 · 개최 60
 *    → 게시물 제목 표본을 이 비율대로 구성
 *  - 메인 푸터 118장: 개인정보처리방침 98 · 저작권 89 · Copyright 82 · 찾아오시는 길 68 · 대표전화 59 · 팩스 55 · 이메일무단수집거부 21
 *    → 푸터 링크·주소 줄 구성
 * 전화번호는 1234-5678 계열, 우편번호는 12345, 도메인은 hanbit.go.kr 등 존재하지 않는 값만 쓴다.
 */
final class SampleContent
{
    public const BASIS = [
        'greeting' => ['screens' => 64, 'themes' => ['소통' => 42, '함께' => 30, '행복' => 19, '약속' => 13], 'opening' => '안녕하십니까? {기관}{직함} {성명}입니다.'],
        'board' => ['screens' => 257, 'keywords' => ['안내' => 236, '공고' => 173, '교육' => 144, '채용' => 130, '모집' => 108, '행사' => 90, '입찰' => 77]],
        'footer' => ['screens' => 118, 'items' => ['개인정보처리방침' => 98, '저작권' => 89, '찾아오시는 길' => 68, '대표전화' => 59, '팩스' => 55]],
    ];

    private const MALE = ['홍길동', '김철수', '박민준', '정우진', '이준호'];
    private const FEMALE = ['이영희', '최서연', '김지은', '한수진', '윤하늘'];

    /** org_type + 원 기관명 끝말로 가상 기관(이름·직함·주민 호칭·주소) 하나를 정한다. 같은 기관이면 늘 같은 값. */
    public static function persona(?string $orgType, string $orgName, ?string $gender = null): array
    {
        $n = trim($orgName);
        $seed = crc32($n . '|' . $orgType);
        $t = (string) $orgType;
        // 관공서만이 아니라 대학·학교·재단·복지관·협회·기업 등 어떤 홈페이지든(사용자 2026-10-11 "특정 카테고리에 국한되지 않고")
        // — org_type 이 있으면 그것으로, 없으면 원 기관명 낱말로 고른다. 순서 = 좁은 것 먼저.
        [$org, $title, $res, $kind, $office] = match (true) {
            str_starts_with($t, 'edu_univ') || $t === 'edu_college' || (bool) preg_match('/대학교|대학$|대학원|폴리텍|과학기술원/u', $n)
                => ['한빛대학교', '총장', '학생', 'univ', '한빛대학교 본관'],
            $t === 'edu_school' || (bool) preg_match('/(초등|중|고등|특수|국제|외국어)?학교$/u', $n)
                => ['한빛고등학교', '교장', '학생', 'school', '한빛고등학교'],
            $t === 'etc_welfare' || (bool) preg_match('/복지관|복지센터|복지재단|복지회|요양|돌봄|자활|노인회관|장애인/u', $n)
                => ['한빛종합사회복지관', '관장', '이용자', 'welfare', '한빛종합사회복지관'],
            str_contains($n, '재단') => [($c = '한빛' . (preg_match('/장학/u', $n) ? '장학' : (preg_match('/과학|기술|산업/u', $n) ? '과학' : '문화')) . '재단'), '이사장', '시민', 'foundation', $c],
            $t === 'etc_assoc' || (bool) preg_match('/협회|학회|연합회|협의회|연맹|조합$/u', $n)
                => ['한국미래산업협회', '회장', '회원', 'assoc', '한국미래산업협회'],
            // 도서관은 미술관(전시·공연·관람) 메뉴가 맞지 않는다 — 자료 검색·대출·열람실(2026-10-15 시험 s10)
            (bool) preg_match('/도서관$|도서관\s|작은도서관|책마루|북카페$/u', $n)
                => ['한빛시립도서관', '관장', '이용자', 'library', '한빛시립도서관'],
            $t === 'private_culture' || (bool) preg_match('/미술관|박물관|아트센터|문화예술회관|공연장/u', $n)
                => ['한빛아트센터', '관장', '관람객', 'culture', '한빛아트센터'],
            str_starts_with($t, 'private') || (bool) preg_match('/\(주\)|주식회사|㈜|그룹$|컴퍼니|스튜디오|쇼핑|몰$|솔루션|테크$|코리아$|랩$|소프트|홀딩스|전자$|물산$|화학$|제약$|건설$|증권$|은행$|보험$|카드$|통신$|텔레콤|모터스|자동차$|중공업|항공$|해운$|유통$|식품$|제과$|생명$|화재$|엔터테인먼트|시스템즈|네트웍스/u', $n)
                => [($c = match ($t) { 'private_commerce' => '한빛마켓', 'private_agency' => '한빛디자인랩', 'private_personal' => '한빛스튜디오', default => '한빛솔루션' }), '대표이사', '고객', 'biz', $c . ' 본사'],
            $t === 'education' || (bool) preg_match('/교육원|연수원|평생학습|아카데미|학원$/u', $n)
                => ['한빛평생교육원', '원장', '수강생', 'academy', '한빛평생교육원'],
            $t === 'edu_office' || str_contains($n, '교육청') => ['한빛시교육청', '교육감', '교육가족', 'edu', '한빛시교육청'],
            $t === 'council' || str_ends_with($n, '의회') => ['한빛시의회', '의장', '시민', 'council', '한빛시의회'],
            $t === 'local_wide' && preg_match('/도$|특별자치도/u', $n) => ['한빛도', '도지사', '도민', 'local', '한빛도청'],
            $t === 'local_wide' => ['한빛시', '시장', '시민', 'local', '한빛시청'], // 로고 샘플이 있는 이름으로(ledger E7)
            str_ends_with($n, '군') => ['새솔군', '군수', '군민', 'local', '새솔군청'],
            (bool) preg_match('/구$|구청$/u', $n) => ['푸른구', '구청장', '구민', 'local', '푸른구청'],
            $t === 'local_basic' || str_ends_with($n, '시') => ['한빛시', '시장', '시민', 'local', '한빛시청'],
            str_ends_with($n, '청') => ['미래데이터청', '청장', '국민', 'gov', '정부한빛청사'],
            str_ends_with($n, '위원회') || $t === 'central_committee' => ['국민미래위원회', '위원장', '국민', 'gov', '정부한빛청사'],
            $t === 'central_ministry' => ['미래혁신부', '장관', '국민', 'gov', '정부한빛청사'],
            str_contains($n, '공단') => [($c = '한국미래' . self::industry($n, '복지') . '공단'), '이사장', '국민', 'corp', $c],
            $t === 'public_corp' || str_contains($n, '공사') => [($c = '한국미래' . self::industry($n, '에너지') . '공사'), '사장', '국민', 'corp', $c],
            default => ['한국미래진흥원', '원장', '국민', 'corp', '한국미래진흥원'],
        };
        $gender = in_array($gender, ['male', 'female'], true) ? $gender : (($seed % 3 === 0) ? 'female' : 'male');
        $names = $gender === 'female' ? self::FEMALE : self::MALE;
        $slug = ['한빛' => 'hanbit', '새솔' => 'saesol', '푸른' => 'pureun'][mb_substr($org, 0, 2)] ?? 'mirae';
        return [
            'org' => $org, 'title' => $title, 'name' => $names[$seed % count($names)], 'gender' => $gender,
            'resident' => $res, 'kind' => $kind, 'office' => $office,
            'address' => '(12345) ' . ($kind === 'gov' ? '한빛특별자치시 정부청사로 100 ' . $office : ($org === '새솔군' ? '새솔군 새솔읍 군청길 10 ' . $office : '한빛시 중앙로 100 ' . $office)),
            'phone' => '1234-5678', 'fax' => '1234-5679', 'domain' => 'www.' . $slug . self::tld($kind), 'email' => 'help@' . $slug . self::tld($kind),
            // 영문 병기 요청에 쓰는 이름(2026-10-03 시험: 영문 기관명·직함을 AI 가 매번 지어냄)
            'org_en' => self::EN_ORG[$org] ?? null, 'title_en' => self::EN_TITLE[$title] ?? null,
            'real' => $n,
        ];
    }

    /**
     * 고객이 기관명을 지정했을 때(2026-10-03 MCP 시험: "청운군"을 줬는데 "새솔군"으로 바뀌어 나옴) — 이름·청사·주소는 고객 이름,
     * 직함·주민 호칭·종류는 persona() 가 고른 값 그대로. virtual 에 원래 가상 기관을 남겨 샘플 묶음 고르기(Samples::group)에 쓴다.
     * 레퍼런스 실제 기관명 차단은 ReplicaKit 이 따로 한다 — 고객 기관명은 고객 자신의 이름이라 그대로 쓴다.
     */
    private const EN_TITLE = ['시장' => 'Mayor', '군수' => 'County Governor', '구청장' => 'District Mayor', '장관' => 'Minister', '청장' => 'Commissioner', '위원장' => 'Chairperson', '이사장' => 'Chairperson', '사장' => 'President & CEO', '원장' => 'President',
        '총장' => 'President', '교장' => 'Principal', '관장' => 'Director', '회장' => 'President', '대표이사' => 'CEO'];
    private const EN_ORG = ['한빛시' => 'Hanbit City', '새솔군' => 'Saesol County', '푸른구' => 'Pureun District', '미래데이터청' => 'Future Data Agency', '국민미래위원회' => 'National Future Commission', '미래혁신부' => 'Ministry of Future Innovation', '한국미래진흥원' => 'Korea Future Promotion Agency',
        '한빛대학교' => 'Hanbit University', '한빛고등학교' => 'Hanbit High School', '한빛종합사회복지관' => 'Hanbit Community Welfare Center', '한빛문화재단' => 'Hanbit Cultural Foundation',
        '한빛장학재단' => 'Hanbit Scholarship Foundation', '한빛과학재단' => 'Hanbit Science Foundation', '한국미래산업협회' => 'Korea Future Industry Association', '한빛아트센터' => 'Hanbit Art Center', '한빛시립도서관' => 'Hanbit Public Library',
        '한빛솔루션' => 'Hanbit Solutions', '한빛마켓' => 'Hanbit Market', '한빛디자인랩' => 'Hanbit Design Lab', '한빛스튜디오' => 'Hanbit Studio', '한빛평생교육원' => 'Hanbit Lifelong Learning Institute'];

    /** 가상 도메인 끝 — 관공서만 go.kr, 대학 ac.kr, 학교 hs.kr, 기업 co.kr, 그 밖 or.kr. 실재하지 않는 값만. */
    public static function tld(string $kind): string
    {
        return match ($kind) { 'univ' => '.ac.kr', 'school' => '.hs.kr', 'biz' => '.co.kr', 'foundation', 'welfare', 'assoc', 'culture', 'library', 'academy' => '.or.kr', default => '.go.kr' };
    }

    /** 관공서 계열이 아닌 종류(대학·학교·재단·복지·협회·문화·기업·교육원) — 화면 문구·메뉴·공지를 그 종류에 맞춘다. */
    public static function isCivic(string $kind): bool { return in_array($kind, ['local', 'gov', 'corp', 'edu', 'council'], true); }

    /** 관공서 밖 종류별 게시물·부서·섹션 이름. 관공서 계열이면 null(기존 문구 그대로). */
    private static function kindProfile(string $kind, string $org): ?array
    {
        return match ($kind) {
            'univ' => ['about' => '대학소개', 'sections' => ['학사 공지', '입학 안내', '연구·산학', $org . ' 뉴스', '행사·세미나', '캠퍼스 생활'],
                'depts' => ['교무처', '학생처', '입학처', '기획처', '산학협력단', '국제교류처'],
                'boards' => ['2027학년도 수시모집 원서 접수 안내', '2026-2학기 수강 정정 기간 안내', '교내 장학금 신청 접수 공고', '졸업 논문 제출 일정 안내', $org . ' 개교 기념 학술 심포지엄 개최',
                    '도서관 시험기간 24시간 개방 안내', '교환학생 파견 추가 모집', '산학협력 현장실습 참여 기업 모집', '학생 상담센터 집단 프로그램 참여자 모집', '캠퍼스 내 주차 정책 변경 안내',
                    $org . ', 정부 연구개발 과제 신규 선정', '취업박람회 참가 기업 안내', '신입생 오리엔테이션 일정 공지', '연구윤리 교육 이수 안내', '기숙사 2학기 입사 신청 안내',
                    '총학생회 축제 일정 및 안전 수칙', '외국인 유학생 한국어 프로그램 안내', '창업 경진대회 참가팀 모집', '학위수여식 일정 안내', '교원 신규 임용 공고']],
            'school' => ['about' => '학교소개', 'sections' => ['가정통신문', '학교 소식', '학사 일정', '방과후 학교', '진로·진학', '급식 안내'],
                'depts' => ['교무기획부', '교육과정부', '학생생활부', '진로진학부', '행정실'],
                'boards' => ['2학기 학부모 상담 주간 안내', '방과후 학교 수강 신청 안내', '수학여행 사전 안전 교육 실시', '교내 독서 토론 대회 결과', '진로 체험의 날 운영 계획',
                    '급식 식단표(10월) 안내', '학교폭력 예방 교육 실시 안내', '가을 체육대회 개최 안내', '기숙사 입사생 추가 모집', '학교운영위원회 회의 결과 공개',
                    '대학 입시 설명회 개최 안내', '감염병 예방 수칙 안내', '교내 과학 탐구 대회 참가 신청', '도서관 신간 도서 안내', '방학 중 학교 시설 개방 안내']],
            'welfare' => ['about' => '기관소개', 'sections' => ['복지관 소식', '프로그램 안내', '이용 안내', '후원·자원봉사', '사업 결과', '사진 이야기'],
                'depts' => ['기획운영팀', '사례관리팀', '지역조직팀', '어르신복지팀', '아동청소년팀'],
                'boards' => ['가을학기 평생교육 프로그램 수강생 모집', '어르신 무료 건강검진 안내', '자원봉사자 정기 교육 안내', '아동 방과후 돌봄 대기 신청 안내', '나눔 바자회 개최 안내',
                    '후원 물품 접수 및 기부금 영수증 안내', '독거 어르신 반찬 나눔 결과', '장애인 일자리 사업 참여자 모집', '복지관 휴관일 안내', '가족 상담 프로그램 운영 안내',
                    '지역 주민 문화 강좌 개설', '이용자 만족도 조사 결과 공개', '청소년 진로 캠프 참가자 모집', '겨울 김장 나눔 자원봉사 모집', '운영위원회 회의 결과']],
            'foundation' => ['about' => '재단소개', 'sections' => ['재단 소식', '지원 사업', '공모 안내', '사업 결과', '행사·교육', '경영 공시'],
                'depts' => ['경영기획팀', '사업운영팀', '지원사업팀', '홍보협력팀'],
                'boards' => ['2027년 지원 사업 공모 사전 안내', '청년 예술가 창작 지원 결과 발표', '장학생 선발 최종 결과 안내', '지원 사업 정산 교육 실시', '재단 직원 공개 채용',
                    '공모 사업 설명회 개최 안내', '지원금 집행 지침 개정 안내', '지역 문화 기획자 아카데미 수강생 모집', '재단 기부금 사용 내역 공개', '하반기 성과 공유회 개최',
                    '시설 대관 신청 안내', '공익 사업 협력 기관 모집', '이사회 회의록 공개', '심사위원 후보 공개 모집', '연차 보고서 발간 안내']],
            'assoc' => ['about' => '협회소개', 'sections' => ['협회 소식', '회원사 소식', '교육·세미나', '정책·자료', '행사 일정', '회원 가입 안내'],
                'depts' => ['사무국', '회원지원팀', '교육사업팀', '정책연구팀'],
                'boards' => ['정기 총회 개최 안내', '회원사 대상 실무 교육 신청 안내', '산업 동향 보고서 발간', '신규 회원사 가입 현황', '정책 간담회 결과 공유',
                    '해외 전시회 공동관 참가사 모집', '회비 납부 안내', '자격 시험 일정 공고', '우수 회원사 시상 결과', '표준 계약서 개정 안내',
                    '산업 인력 채용 박람회 참가 안내', '회원사 설문 조사 협조 요청', '협회 사무국 이전 안내', '기술 세미나 발표 자료 공개', '이사회 의결 사항 공지']],
            'culture' => ['about' => '센터소개', 'sections' => ['전시', '공연', '교육 프로그램', '관람 안내', '소식', '대관 안내'],
                'depts' => ['전시기획팀', '공연사업팀', '교육팀', '시설운영팀'],
                'boards' => ['가을 기획전 개막 안내', '어린이 미술 교실 수강생 모집', '정기 공연 예매 오픈 안내', '관람 시간 변경 안내', '도슨트 해설 시간표',
                    '대관 신청 일정 공지', '문화가 있는 날 무료 관람 안내', '작가와의 대화 참가 신청', '공연장 시설 점검 휴관 안내', '회원 할인 혜택 안내',
                    '단체 관람 예약 안내', '소장품 기증 접수 안내', '자원봉사 해설사 모집', '야간 개장 운영 안내', '전시 연계 강연 개최']],
            'library' => ['about' => '도서관소개', 'sections' => ['자료 검색', '신착 도서', '독서 프로그램', '이용 안내', '도서관 소식', '열람실 현황'],
                'depts' => ['자료운영팀', '독서문화팀', '열람지원팀', '행정지원팀'],
                'boards' => ['가을 독서 문화 프로그램 수강생 모집', '신착 도서 목록 안내', '도서관 휴관일 안내', '상호대차 서비스 확대 안내', '작가 초청 북토크 개최',
                    '어린이 책 읽어주기 시간 운영', '전자책 대출 서비스 이용 안내', '열람실 좌석 예약 시스템 변경', '희망 도서 신청 방법 안내', '연체 도서 반납 안내',
                    '시험 기간 열람실 연장 운영', '책 기증 접수 안내', '자원봉사자 모집', '독서 동아리 회원 모집', '이달의 추천 도서']],
            'biz' => ['about' => '회사소개', 'sections' => ['새소식', '제품·서비스', '고객 사례', '보도자료', '인재 채용', '고객지원'],
                'depts' => ['경영지원팀', '사업기획팀', '고객지원팀', '연구개발팀', '마케팅팀'],
                'boards' => ['신규 서비스 출시 안내', '하반기 경력 사원 채용 공고', '고객센터 운영 시간 변경 안내', '개인정보처리방침 개정 안내', '전시회 참가 소식',
                    '고객 감사 이벤트 당첨자 발표', '시스템 정기 점검 안내', '파트너사 모집 안내', '제품 사용 설명서 업데이트', 'ESG 보고서 발간',
                    '신규 지점 개점 안내', '보안 업데이트 적용 안내', '고객 만족도 조사 결과', '기술 세미나 개최 안내', '대표 인터뷰 기사 소개']],
            'academy' => ['about' => '기관소개', 'sections' => ['강좌 안내', '수강 신청', '교육 소식', '수료생 이야기', '시설 안내', '자주 묻는 질문'],
                'depts' => ['교육운영팀', '강좌기획팀', '수강지원팀'],
                'boards' => ['가을학기 정규 강좌 수강 신청 안내', '자격증 과정 개강 안내', '온라인 강좌 신규 개설', '수강료 환불 기준 안내', '강사 공개 모집',
                    '수료식 일정 안내', '주말 특강 참가자 모집', '시설 휴관일 안내', '수강생 만족도 조사 결과', '디지털 기초 교실 운영 안내',
                    '어르신 스마트폰 교실 모집', '직무 역량 과정 수강생 모집', '교육 이수증 발급 안내', '강의실 대관 안내', '우수 수료생 시상 결과']],
            default => null,
        };
    }

    public static function clientNamed(array $p, string $client): array
    {
        $c = trim($client);
        if ($c === '' || mb_strlen($c) < 2) { return $p; }
        $p['virtual'] = $p['org'];
        $office = match ($p['kind'] ?? 'local') {
            'local' => preg_match('/(시|군|구|도)$/u', $c) ? $c . '청' : $c,
            'gov' => '정부한빛청사',
            default => $c,
        };
        $p['org'] = $c; $p['office'] = $office;
        // 직함·주민 호칭도 고객 이름 끝말로 — 청주시 레퍼런스에 '청운군'을 주면 '청운군 시장'이 됐다
        if (($p['kind'] ?? '') === 'local') {
            [$p['title'], $p['resident']] = match (true) {
                str_ends_with($c, '군') => ['군수', '군민'],
                str_ends_with($c, '구') => ['구청장', '구민'],
                str_ends_with($c, '도') => ['도지사', '도민'],
                str_ends_with($c, '시') => ['시장', '시민'],
                default => [$p['title'], $p['resident']],
            };
            $p['title_en'] = self::EN_TITLE[$p['title']] ?? ($p['title'] === '도지사' ? 'Governor' : null);
        }
        // 지자체만 고객 이름이 곧 지명 — 공사·공단은 '국민정책방송원 중앙로 100 국민정책방송원'처럼 기관명이 두 번 들어갔다(2026-10-03 시험)
        $p['address'] = '(12345) ' . match ($p['kind'] ?? 'local') { 'gov' => '한빛특별자치시 정부청사로 100 ' . $office, 'local' => $c . ' 중앙로 100 ' . $office, default => '한빛시 중앙로 100 ' . $c };
        $p['domain'] = 'www.example' . self::tld((string) ($p['kind'] ?? 'local')); // 고객 도메인은 모르므로 예시 주소(가상 기관 도메인을 남기지 않는다)
        $p['email'] = 'help@example' . self::tld((string) ($p['kind'] ?? 'local'));
        $p['org_en'] = null; // 고객 기관 영문명은 모른다 — 지어내지 말고 고객 확인 자리로 둔다
        $p['client'] = true;
        return $p;
    }

    /**
     * 공사·공단의 업종 낱말 — 고객 기관명(한국수자원공사 → 물)을 가상 기관명에 반영한다(2026-10-01).
     * 업종을 모르면 기본값. 실제 기관명은 그대로 쓰지 않는다.
     */
    private static function industry(string $n, string $default): string
    {
        foreach ([
            '물관리' => '/수자원|물|댐|상하수|수도|농어촌/u', '교통' => '/도로|철도|교통|공항|항만|해운|도시철도/u',
            '주택' => '/주택|토지|도시|건설/u', '에너지' => '/전력|에너지|가스|석유|발전|원자력|광해|광물/u',
            '관광' => '/관광|문화|체육/u', '환경' => '/환경|자원순환/u', '복지' => '/복지|연금|건강보험|고용|근로/u',
        ] as $word => $re) {
            if (preg_match($re, $n)) { return $word; }
        }
        return $default;
    }

    /** 자리표시를 가상 값으로. $seed 는 섹션 id — 같은 페이지 안 섹션마다 목록이 달라지게. */
    public static function fill(string $html, array $p, int $seed = 0, ?string $pageType = null): string
    {
        $org = $p['org']; $res = $p['resident'];
        $josa = static fn (string $w, string $a, string $b): string => $w . (self::hasBatchim($w) ? $a : $b);
        $greetTitles = [
            $josa($res, '과', '와') . ' 함께 여는 행복한 ' . $org,
            '소통으로 답을 찾는 ' . $org . ', 늘 곁에 있겠습니다',
            $josa($res, '이', '가') . ' 주인공인 ' . $josa($org, '을', '를') . ' 만들겠습니다',
        ];
        $mission = match ($p['kind']) {
            'gov' => '국민의 삶에 꼭 필요한 정책을 빠르고 정확하게 전하겠습니다. 현장에서 확인하고, 결과로 증명하겠습니다.',
            'corp' => '공공기관으로서 맡은 역할을 투명하게 수행하고, 국민이 체감하는 서비스로 신뢰에 보답하겠습니다.',
            'edu' => '모든 학생이 저마다의 속도로 성장하는 교실, 교사가 가르치는 일에 집중하는 학교를 만들겠습니다.',
            'council' => '시민의 대표로서 집행부를 꼼꼼히 살피고, 생활 가까이에서 답을 찾는 의회가 되겠습니다.',
            'univ' => '배움이 연구로, 연구가 사회의 변화로 이어지는 대학을 만들겠습니다. 학생 한 사람 한 사람의 가능성을 끝까지 함께 키우겠습니다.',
            'school' => '서로 존중하며 함께 자라는 학교, 꿈을 찾고 키우는 배움터를 만들겠습니다. 학부모님과 지역이 함께하는 교육을 약속드립니다.',
            'welfare' => '도움이 필요한 이웃 곁에 가장 먼저 다가가겠습니다. 이용자 한 분 한 분의 일상이 조금 더 따뜻해지도록 정성을 다하겠습니다.',
            'foundation' => '누구나 문화와 배움을 누릴 수 있도록 기회를 넓히겠습니다. 지원 사업의 문턱을 낮추고 결과를 투명하게 나누겠습니다.',
            'assoc' => '회원사의 목소리를 모아 산업의 길을 열겠습니다. 정보와 교육, 네트워크로 회원 여러분의 성장을 돕겠습니다.',
            'culture' => '일상 가까이에서 예술을 만나는 공간이 되겠습니다. 전시와 공연, 교육 프로그램으로 관람객 여러분을 맞이하겠습니다.',
            'library' => '누구나 편하게 찾아와 책과 만나는 생활 속 도서관이 되겠습니다. 자료와 프로그램으로 이용자 여러분의 배움을 돕겠습니다.',
            'biz' => '고객의 문제를 가장 잘 이해하는 파트너가 되겠습니다. 기술과 서비스로 약속을 지키며 함께 성장하겠습니다.',
            'academy' => '배우고 싶은 모든 분께 열려 있는 배움터가 되겠습니다. 생활에 바로 쓰이는 강좌로 수강생 여러분의 내일을 응원합니다.',
            default => '일자리와 복지, 안전을 촘촘히 챙겨 누구나 살고 싶은 ' . $josa($org, '을', '를') . ' 만들겠습니다.',
        };
        $civ = self::isCivic((string) $p['kind']);
        $paras = [
            '안녕하십니까? ' . self::head($p) . ' ' . $p['name'] . '입니다. ' . $org . ($civ ? ' 누리집을' : ' 홈페이지를') . ' 찾아 주신 ' . $res . ' 여러분께 진심으로 감사드립니다.',
            $josa($org, '은', '는') . ' ' . $res . ' 여러분의 목소리에 귀 기울이는 ' . ($civ ? '소통 행정을' : '소통을') . ' 가장 먼저 생각합니다. 작은 의견 하나도 정책이 될 수 있도록 현장에서 듣고, ' . $res . ' 여러분과 함께 답을 찾겠습니다.',
            $mission . ' 모든 ' . $josa($res, '이', '가') . ' 행복을 체감하는 ' . $josa($org, '을', '를') . ' 만들겠다는 약속, 끝까지 지키겠습니다. 감사합니다.',
        ];
        $boards = [
            '2026년 하반기 ' . $org . ' 기간제 근로자 채용 공고', $org . ' ' . $res . ' 디지털 역량 교육 수강생 모집 안내',
            '2026년 소상공인 경영안정 지원사업 공고', $p['office'] . ' 주차장 보수공사 입찰 공고', '추석 연휴 종합상황실 운영 안내',
            '제3회 ' . $org . ' 청년정책 토론회 개최 안내', '2026년 상반기 주민참여예산 심의 결과 공고', '공공시설 개방 시간 변경 안내',
            '노인일자리 참여자 추가 모집 공고', '2026년 공무직 근로자 공개채용 최종 합격자 발표', '가을철 산불 예방 행사 개최 안내',
            '2027년도 본예산 편성 의견 수렴 안내',
            $org . ', 전통시장 온누리상품권 환급 행사 운영', '어르신 무료 독감 예방접종 10월 시작', $org . ' 공공자전거 대여소 20곳 추가 설치',
            '2026년 하반기 청년 월세 지원 신청 접수', '생활폐기물 배출 요일 변경 안내', $org . ' 도서관 야간 개방 시범 운영',
            '제2회 ' . $org . ' 청소년 진로 체험 박람회 참가자 모집', '지방세 체납액 일제 정리 기간 운영 안내', '주민등록 사실조사 실시 공고',
            $org . ' 소상공인 디지털 전환 컨설팅 지원', '가을철 식중독 예방 수칙 안내', '공유재산 대부 입찰 공고',
        ];
        if ($p['kind'] === 'gov' || $p['kind'] === 'corp') { // 중앙부처·공공기관은 지자체 생활 공지(폐기물·주민자치)가 어색하다
            $boards = [
                '2026년 하반기 ' . $org . ' 공무직 근로자 채용 공고', $org . ', 2027년 예산안 주요 내용 발표', '국민 정책 제안 공모전 결과 안내',
                '2026년 ' . $org . ' 정책 연구용역 입찰 공고', '「디지털 공공서비스 혁신 방안」 발표', $org . ' 정보공개 운영 실적 공개',
                '청년 정책 자문단 3기 모집 안내', '추석 연휴 비상근무 체계 운영 안내', $org . '·지방정부 협력 간담회 개최',
                '행정규칙 일부개정 행정예고', '2026년 상반기 적극행정 우수사례 선정 결과', '국민 참여 정책 토론회 개최 안내',
                $org . ' 누리집 개편 이용자 의견 조사', '공공데이터 개방 확대 계획 안내', '정책 브리핑 — 2026년 하반기 업무 추진 방향',
                '국정감사 지적사항 조치 결과 공개', '규제 개선 과제 국민 의견 수렴', '2026년 공공기관 고객만족도 조사 결과',
                $org . ' 청사 출입 절차 변경 안내', '재난 대비 안전 점검 실시 계획', '국제 협력 업무협약(MOU) 체결', '홍보 콘텐츠 공모전 수상작 발표',
                '보도해명 — 관련 보도에 대한 설명', '위원회 위원 공개 모집 공고',
            ];
        }
        $kp = self::kindProfile((string) $p['kind'], $org);
        if ($kp !== null) { $boards = $kp['boards']; }
        $depts = $kp['depts'] ?? ($p['kind'] === 'gov' || $p['kind'] === 'corp'
            ? ['운영지원과', '기획조정실', '정책기획팀', '대변인실', '고객지원팀', '디지털혁신팀']
            : ['총무과', '기획예산과', '일자리정책과', '복지정책과', '안전총괄과', '교육청소년과', '홍보담당관']);
        $sections = $kp['sections'] ?? [$org . ' 소식', '분야별 정보', '자주 찾는 서비스', '알림판', '행사·축제', '시민참여'];
        $menu = match ($pageType) {
            'greeting' => $kp !== null ? [$kp['about'], ['인사말', '연혁', '비전', '조직도', '오시는 길']] : [$p['title'] . '실', ['인사말', '약력', '공약사항', '주요 일정', $p['title'] . '에게 바란다']],
            'board_list', 'board_view' => ['알림마당', ['공지사항', '보도자료', '채용정보', '입찰정보', '고시·공고']],
            'org_chart' => ['기관소개', ['조직도', '부서 안내', '직원 찾기', '찾아오시는 길']],
            default => $kp !== null ? [$kp['sections'][1], array_slice($kp['sections'], 0, 5)] : ['분야별 정보', ['복지', '일자리·경제', '안전', '교육·청소년', '문화·관광']],
        };
        $page = match ($pageType) { 'greeting' => '인사말', 'board_list', 'board_view' => '공지사항', 'org_chart' => '조직도', default => '사업 안내' };
        $tabs = match ($pageType) { 'greeting' => ['인사말', '약력', '주요 일정'], default => ['공지사항', '보도자료', '채용·시험', '고시·공고'] };

        $i = $seed; // 목록형 자리는 섹션마다 다른 위치에서 시작
        $pick = static function (array $pool) use (&$i) { return $pool[($i++) % count($pool)]; };
        $day = static function (int $k) use ($seed): string { return date('Y.m.d', strtotime('2026-09-24') - 86400 * (($k * 3 + $seed) % 40)); };
        $k = 0; $no = 1200 + ($seed % 90);

        $map = [
            '[기관명]' => $org, '[직함]' => $p['title'], '[성명]' => $p['name'],
            '[1단락]' => $paras[0], '[2단락]' => $paras[1], '[3단락]' => $paras[2],
            '[인사말 제목 — 한 문장]' => $greetTitles[$seed % 3],
            '[슬로건 또는 핵심 메시지]' => $josa($res, '과', '와') . ' 함께 만드는 행복 ' . $org,
            '[한두 문장 요약]' => $res . ($civ ? '의 일상을 바꾸는 따뜻한 행정, ' : '의 내일을 함께 여는 곳, ') . $josa($org, '이', '가') . ' 함께합니다.',
            '[상위 메뉴]' => $menu[0], '[메뉴 제목]' => $menu[0], '[페이지 제목]' => $page,
            '[부서명]' => $depts[$seed % count($depts)], '[000-000-0000]' => '1234-' . (5600 + $seed % 90),
            '[제목]' => $sections[$seed % count($sections)],
        ];
        $html = strtr($html, $map);
        // 푸터 주소 줄
        $html = str_replace('([우편번호]) [주소] · 대표전화 1234-' . (5600 + $seed % 90), $p['address'] . ' · 대표전화 ' . $p['phone'] . ' · 팩스 ' . $p['fax'], $html);
        $html = preg_replace_callback('/\[(?:하위 메뉴|탭) (\d)\]/u', static function ($m) use ($menu, $tabs) {
            return str_starts_with($m[0], '[탭') ? ($tabs[((int) $m[1] - 1) % count($tabs)]) : ($menu[1][((int) $m[1] - 1) % count($menu[1])]);
        }, $html) ?? $html;
        $html = preg_replace_callback('/\[섹션 제목\]/u', static function () use ($pick, $sections) { return $pick($sections); }, $html) ?? $html;
        // 한 페이지에서 같은 게시물 제목을 두 번 쓰지 않는다 — 영상 카드가 날짜 카드 제목을 되풀이하던 것(보훈부, 2026-09-26 자가 검증)
        $bUsed = [];
        $html = preg_replace_callback('/\[게시물 제목\]/u', static function () use (&$i, &$bUsed, $boards) {
            for ($k = 0; $k < count($boards); $k++) { $t = $boards[($i++) % count($boards)]; if (!isset($bUsed[$t])) { $bUsed[$t] = 1; return $t; } }
            // 풀이 바닥나면 공통 소식 제목으로 보충 — '(2차)'를 붙이면 부자연스럽다(서구 영상 카드)
            foreach (['주민 참여 설명회 개최 결과 안내', '생활 안전 캠페인 현장 스케치', '청사 방문객 편의시설 개선', '가을 문화행사 현장 이모저모', '민원 처리 만족도 조사 결과', '어린이 교통안전 교실 운영', '지역 상생 협약식 개최', '찾아가는 복지 상담 현장', '우수 공무원 시상식 개최', '공공 도서관 야간 개방 시작'] as $t) { if (!isset($bUsed[$t])) { $bUsed[$t] = 1; return $t; } }
            // 그래도 모자라면 '분야 + 소식 형식' 조합 — '(2차)' 반복은 디자이너 검수에서 가장 먼저 눈에 띄었다(2026-09-30 MCP 시험 r2 영상 카드)
            $fields = ['청년 일자리', '어르신 돌봄', '생활 안전', '지역 문화', '환경 정화', '교통 개선', '소상공인 지원', '평생학습', '공원 녹지', '재난 대비'];
            $forms = ['현장 스케치', '추진 결과 공유', '주민 의견 청취회', '우수 사례 소개', '참여자 후기'];
            for ($k = 0; $k < 50; $k++) { $t = $fields[$i % count($fields)] . ' ' . $forms[intdiv($i, count($fields)) % count($forms)]; $i++; if (!isset($bUsed[$t])) { $bUsed[$t] = 1; return $t; } }
            return $boards[($i++) % count($boards)];
        }, $html) ?? $html;
        // 날짜는 목록(ul·ol·tbody)마다 최신부터 내려간다 — 전역 카운터 % 40 이 한 바퀴 돌아 목록 중간에 날짜가 다시 올라갔다(ledger D1 재발, 2026-09-26)
        $html = preg_replace_callback('/<(ul|ol|tbody)\b[^>]*>.*?<\/\1>/su', static function ($m) use ($seed) {
            $j = 0;
            return preg_replace_callback('/\[(?:YYYY\.MM\.DD|게시일)\]/u', static function () use (&$j, $seed) { return date('Y.m.d', strtotime('2026-09-24') - 86400 * (3 * $j++ + $seed % 3)); }, $m[0]) ?? $m[0];
        }, $html) ?? $html;
        $html = preg_replace_callback('/\[(?:YYYY\.MM\.DD|게시일)\]/u', static function () use ($day, &$k) { return $day($k++); }, $html) ?? $html;
        $html = preg_replace_callback('/\[번호\]/u', static function () use (&$no) { return (string) $no--; }, $html) ?? $html;
        $html = preg_replace_callback('/\[부서\]/u', static function () use ($pick, $depts) { return $pick($depts); }, $html) ?? $html;
        $html = preg_replace_callback('/(<td class="hb-r">)\[0\]/u', static function ($m) use (&$i) { return $m[1] . number_format(120 + (crc32((string) $i++) % 2300)); }, $html) ?? $html;
        // 푸터 링크를 못 모았으면 실측 빈도순 기본 링크
        $html = str_replace('<ul class="hb-footer-links"></ul>', '<ul class="hb-footer-links">' . implode('', array_map(
            static fn ($l, $j) => '<li' . ($j === 0 ? ' class="is-strong"' : '') . '><a href="#">' . $l . '</a></li>',
            ['개인정보처리방침', '저작권정책', '이메일무단수집거부', '찾아오시는 길', '누리집 이용안내'], [0, 1, 2, 3, 4])) . '</ul>', $html);
        $html = str_replace('<p>© ' . $org . '. All rights reserved.</p>', '<p>' . $p['domain'] . ' · Copyright © ' . $org . '. All rights reserved.</p>', $html);
        return self::scrubReal($html, $p);
    }

    /** 수집 텍스트(메뉴 이름·제목)에 남은 실제 기관명·지명을 가상 이름으로 */
    public static function scrubReal(string $html, array $p): string
    {
        $real = trim((string) ($p['real'] ?? ''));
        if ($real === '') { return $html; }
        // <style>·<script> 안은 건드리지 않는다 — 글꼴 주소 '…/pkg@1.0/…' 가 이메일로 보여 'help@…' 로 바뀌어 글꼴 4종이 404 였다(2026-10-12 mock-page-code-font-url-corrupted-by-persona-email)
        $keep = [];
        $html = preg_replace_callback('/<(style|script)\b[^>]*>.*?<\/\1>/isu', static function ($m) use (&$keep) { $k = "\x01HBK" . count($keep) . "\x01"; $keep[$k] = $m[0]; return $k; }, $html) ?? $html;
        $cut = static fn (string $s): string => (string) preg_replace('/(특별자치도|특별자치시|광역시|특별시|청|부|처|시|군|구|도|위원회|공단|공사|진흥원|원|공익재단|복지재단|문화재단|장학재단|재단|종합사회복지관|사회복지관|복지관|아트센터|센터|협회|학회|대학교|대학|교육청|의회|주식회사|㈜)$/u', '', $s);
        // '강릉시청' → '강릉시' → '강릉' 까지 — 끝말을 한 번만 떼면 '강릉고향사랑기부제'·'강릉관광'이 남았다(2026-10-12 build-leaks-real-org)
        $stems = array_unique(array_filter([$real, $cut($real), $cut($cut($real))], static fn ($s) => is_string($s) && mb_strlen($s) >= 2));
        usort($stems, static fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a)); // 긴 이름부터 바꿔야 '강릉시청'이 '한빛시청'으로 온전히 바뀐다
        $stem = mb_substr($p['org'], 0, 2);
        // '대전광역시 서구'처럼 띄어 쓴 이름은 뒤 단어('서구')도 — 섹션 이름 '서구랑'이 가상 기관 목업에 그대로 나왔다(2026-09-30 MCP 테스트)
        $parts = preg_split('/\s+/u', $real) ?: [];
        $tail = count($parts) > 1 ? (string) preg_replace('/(?<=[시군구])청$/u', '', (string) end($parts)) : ''; // '서구청' → '서구'
        if (mb_strlen($tail) >= 2) { $stems[] = $tail; }
        // '강원 강릉시' 의 뒤 단어 줄기('강릉')도 — 메뉴 '강릉관광'이 남았다(2026-10-12)
        $tailStem = $tail !== '' ? $cut($tail) : '';
        if (mb_strlen($tailStem) >= 2 && !in_array($tailStem, $stems, true)) { $stems[] = $tailStem; }
        // '월드비전 하루팔찌' 처럼 띄어 쓴 이름의 앞 단어('월드비전')와 영문 앞머리('LG공익재단' → 'LG')도 — 메뉴·탭에 '월드비전 소식'·'LG아트센터'가 남았다(2026-10-12 mock-draft-leaks-real-org)
        if (count($parts) > 1) {
            $head = (string) $parts[0];
            foreach ([$head, $cut($head)] as $h) { if (mb_strlen($h) >= 2 && !in_array($h, $stems, true)) { $stems[] = $h; } }
        }
        if (preg_match('/^([A-Za-z]{2,})(?=[가-힣])/u', $real, $lm) && !in_array($lm[1], $stems, true)) { $stems[] = $lm[1]; }
        $full = $stems; // 이 이름들은 가상 기관 이름 전체로 바꾼다
        // 기관장 실명 등 덧붙여 받은 이름(기관장 이름은 가상 기관장 이름으로)
        $extra = [];
        foreach ((array) ($p['real_extra'] ?? []) as $k => $v) {
            $v = trim((string) $v);
            if (mb_strlen($v) >= 2 && !in_array($v, $stems, true)) { $stems[] = $v; $extra[$v] = is_string($k) && $k === 'head' ? (string) ($p['name'] ?? $p['org']) : $p['org']; }
        }
        usort($stems, static fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a));
        foreach ($stems as $s) {
            $to = $extra[$s] ?? (($s === $real || $s === $tail || (in_array($s, $full, true) && (preg_match('/^[A-Za-z]+$/', $s) || (count($parts) > 1 && ($s === $parts[0] || $s === $cut((string) $parts[0])))))) ? $p['org'] : $stem);
            // 태그 밖 텍스트에서만 (속성·URL 은 그대로)
            $html = preg_replace_callback('/>([^<]*)</u', static fn ($m) => '>' . str_replace($s, $to, $m[1]) . '<', $html) ?? $html;
            // 화면 낭독·툴팁으로 읽히는 속성도 — 캐러셀 aria-label '모두의 가슴에 국민대학교 이전'이 남았다(2026-10-14). URL 속성(src·href)은 그대로
            $html = preg_replace_callback('/\b(aria-label|alt|title|placeholder)="([^"]*)"/u', static fn ($m) => $m[1] . '="' . str_replace($s, $to, $m[2]) . '"', $html) ?? $html;
        }
        // 수집 텍스트의 실제 전화·이메일·도메인도 가상 값으로 (푸터 링크에 원 기관 대표번호가 그대로 남던 것 — 2026-09-25 테스트)
        $html = preg_replace_callback('/>([^<]*)</u', static function ($m) use ($p) {
            $t = preg_replace('/(?<!\d)(?!1234-)(?:0\d{1,2}|1\d{3})[-.)\s]\d{3,4}(?:[-.]\d{4})?(?!\d)/u', $p['phone'], $m[1]) ?? $m[1];
            $t = preg_replace('/국번\s?없이\s?\d{3,4}/u', '국번없이 1234', $t) ?? $t;
            $t = preg_replace('/(?<![\/\w.+-])[\w.+-]+@[\w-]+(\.[\w-]+)+/u', 'help@' . preg_replace('/^www\./', '', $p['domain']), $t) ?? $t;
            $t = preg_replace('/\bwww\.[a-z0-9-]+\.(go|or|re)\.kr\b/iu', $p['domain'], $t) ?? $t;
            return '>' . $t . '<';
        }, $html) ?? $html;
        // 기관장·대표 실명 — DB 에 이름 칸이 없어 직함 옆 세 글자 이름을 가상 이름으로('시장 안대윤'·'구광모 회장'이 남던 것, 2026-10-13 mock-draft-leaks-real-head)
        $who = (string) ($p['name'] ?? '');
        $titles = '시장|군수|구청장|도지사|지사|교육감|총장|학장|이사장|회장|부회장|대표이사|대표|관장|원장|사장|장관|차관|청장|위원장|의장|센터장|교장';
        $sur = '김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|유|전|홍|고|문|양|손|배|백|허|남|심|노|하|곽|성|차|주|우|구|민|진|나|지|엄|채|원|천|방|공|현|함|변|염|여|추|도|소|석|선|설|마|길|연|위|표|명|기|반|왕|금|옥|육|인|맹|제|모|탁|국|어|은|편|용|예|경|봉|사|부|황보|남궁|제갈|선우';
        if ($who !== '') {
            // 이름처럼 보이는 세 글자 일반어 — '시장 인사말'의 '인사말'을 사람 이름으로 바꾸면 안 된다
            $notName = ['인사말', '집무실', '비서실', '동정란', '연설문', '기고문', '프로필', '공약사', '이력서', '일정표', '소개글', '안내문', '전통시', '도매시', '임원진', '위원회', '이사회', '사무실', '부속실', '정책실', '기획실', '대변인', (string) $p['org'], mb_substr((string) $p['org'], 0, 3)]; // 가상 기관명('한빛시 시장')을 사람 이름으로 보면 안 된다
            $html = preg_replace_callback('/>([^<]*)</u', static function ($m) use ($titles, $sur, $who, $notName) {
                $t = preg_replace_callback('/(?<![가-힣])((?:' . $sur . ')[가-힣]{2})(\s*(?:' . $titles . ')(?![가-힣]))/u', static fn ($n) => (in_array($n[1], $notName, true) ? $n[1] : $who) . $n[2], $m[1]) ?? $m[1];
                $t = preg_replace_callback('/((?<![가-힣])(?:' . $titles . ')\s+)((?:' . $sur . ')[가-힣]{2})(?![가-힣])/u', static fn ($n) => $n[1] . (in_array($n[2], $notName, true) ? $n[2] : $who), $t) ?? $t;
                return '>' . $t . '<';
            }, $html) ?? $html;
            // 섹션 코드(조직도·인사말)는 제목·부제가 사람 이름 하나뿐인 경우가 있다('<h2>안대윤</h2><p>장응두</p>' — 2026-10-13 section-code-leaks-staff-name)
            if (!empty($p['scrub_names'])) {
                $notName = array_merge($notName, ['조직도', '조직표', '기관장', '부서장', '담당자', '연락처', '홍보관', '안내도', '문화원', '도서관', '전시관', '공연장', '장학금', '정보화', '민원실', '이용료', '주요업', '조직개', '사업소', '보건소', '연구소', '연구원', '전문가', '고객님', '방문객', '오시는', '사무국', '사무처', '이사진', '자원봉', '후원금', '장애인', '노인복', '아동복', '청소년', '기부금', '한빛시', (string) $p['org'], mb_substr((string) $p['org'], 0, 3)]);
                $html = preg_replace_callback('/>(\s*)((?:' . $sur . ')[가-힣]{2})(\s*)</u', static fn ($m) => '>' . $m[1] . (in_array($m[2], $notName, true) ? $m[2] : $who) . $m[3] . '<', $html) ?? $html;
            }
        }
        // 속성 속 전화·메일(href="tel:…", "mailto:…")도 — 글은 바뀌었는데 링크에 원 기관 번호가 남았다
        $html = preg_replace('/href="tel:[^"]*"/u', 'href="tel:' . preg_replace('/\D/', '', (string) $p['phone']) . '"', $html) ?? $html;
        $html = preg_replace('/href="mailto:[^"]*"/u', 'href="mailto:help@' . preg_replace('/^www\./', '', (string) $p['domain']) . '"', $html) ?? $html;
        return $keep === [] ? $html : strtr($html, $keep);
    }

    /** 기관장 호칭: 한빛시+시장=한빛시장, 새솔군+군수=새솔군수, 푸른구+구청장=푸른구청장, 그 밖은 띄어 쓴다(인사말이 '한빛시시장'이던 것 — 2026-10-12 mock-greeting-head-doubled). */
    public static function head(array $p): string
    {
        $org = (string) ($p['org'] ?? ''); $t = (string) ($p['title'] ?? '');
        if ($org === '' || $t === '') { return $org . $t; }
        if (in_array($p['kind'] ?? '', ['local', 'gov', 'edu', 'council'], true) && mb_substr($t, 0, 1) === mb_substr($org, -1)) { return mb_substr($org, 0, -1) . $t; }
        return $org . ' ' . $t;
    }

    private static function hasBatchim(string $w): bool
    {
        $c = mb_substr($w, -1);
        $o = mb_ord($c);
        return $o >= 0xAC00 && $o <= 0xD7A3 && (($o - 0xAC00) % 28) !== 0;
    }
}
