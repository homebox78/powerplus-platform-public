-- keep:always
-- 0019 변경 이력 — 모듈별 업데이트 노트를 관리자 화면에서 쓰고 고친다(/admin/changelog, 공개 /changelog?module=).
-- 이전에는 powerGuide 화면 코드(TOKEN_HISTORY)와 키트 versions.json 에 박혀 있어 배포 없이는 못 고쳤다.
-- module = 어느 서비스의 이력인가, track = 한 모듈 안 갈래(예: powerGuide 의 '부품 키트'·'토큰·규칙').
-- 운영에서 쓰는 데이터라 매번 IF NOT EXISTS · INSERT IGNORE 로 보장한다(기존 행은 덮지 않는다).
CREATE TABLE IF NOT EXISTS core_changelog (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  public_id CHAR(16) NOT NULL,
  module ENUM('platform','assets','deck','mock','guide','mcp') NOT NULL,
  track VARCHAR(40) NOT NULL DEFAULT '',
  version VARCHAR(20) NOT NULL,
  released_on DATE NOT NULL,
  title VARCHAR(200) NOT NULL,
  notes JSON NOT NULL,
  published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_changelog_pid (public_id),
  UNIQUE KEY uq_changelog_ver (module, track, version),
  KEY ix_changelog_list (module, published, released_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO core_changelog (public_id, module, track, version, released_on, title, notes) VALUES
('rb8uqe2qvt78yr47', 'guide', '부품 키트', '0.1.0', '2026-09-26', '첫 공개', JSON_ARRAY('KRDS·shadcn 부품 77종 React·Vue 두 판', '홈박스 스타일 층(기본) + KRDS 원형 모드', 'KRDS 체크리스트 274항목 판정 결과표')),
('u2qgn2w7i4tygjza', 'guide', '부품 키트', '0.2.0', '2026-10-06', 'powerPlus 로 통합', JSON_ARRAY('부품마다 상세 문서 — 미리보기·코드·설치·사용법·알아 둘 점·KRDS 지침', '설치 명령(pnpm·npm·yarn·bun)과 직접 붙여 넣기 두 방법', '예시 그림을 powerAssets 샘플 사진으로')),
('dbwg2uzfyd2gwbrk', 'guide', '부품 키트', '0.2.1', '2026-10-07', '문서 읽기 개선', JSON_ARRAY('코드 상자를 어두운 편집기 색으로, 펼친 코드 다시 접기', '부품 목록 묶음을 색과 개수로 구분', '화면 폭 최대 1920 에 맞춰 넓게')),
('bbunac9879jdgu89', 'guide', '토큰·규칙', '1.0.0', '2026-09-08', '첫 공개', JSON_ARRAY('토큰 체계 15종 산출물', 'KRDS 준수 요소(전자정부 배너·글자 크기·선명한 화면·본문 바로가기)')),
('i5nm9wtbg8wc247p', 'guide', '토큰·규칙', '1.0.1', '2026-09-08', '전체 점검', JSON_ARRAY('접근성 43건 수정(입력 테두리 대비 3:1, rem 전환, label 이름 붙이기)', '정적 반입 시 새로고침 404 해소')),
('smvjed9jm6kpnrm5', 'guide', '토큰·규칙', '1.1.0', '2026-09-09', 'KRDS 컴포넌트 55종', JSON_ARRAY('대응표 + 컴포넌트별 지침 자동 표시')),
('k2tkuquwh33sudgp', 'guide', '토큰·규칙', '1.2.0', '2026-09-09', 'KRDS 기본 패턴 12종', JSON_ARRAY('67종 중 64종(96%) 대응')),
('yr7qzf2cxeuj323d', 'guide', '토큰·규칙', '1.3.0', '2026-09-09', '실사용 관점 보강', JSON_ARRAY('CSS 전용 부품 라이브러리(.sds-* 70종)', '다크 모드·Figma Tokens·HTML 스타터 킷', '컴포넌트 토큰 신설')),
('2y3hjkr7n3fcrrki', 'guide', '토큰·규칙', '1.3.1', '2026-09-09', '재점검', JSON_ARRAY('React 판·CSS 판 치수 불일치 수정(버튼 36/8 ↔ 40/4)', '체크박스 누르는 영역 24px(WCAG 2.5.8)', '판 사이 치수 일치 검사 규칙 추가')),
('xupqc24mx2zizum9', 'guide', '토큰·규칙', '1.3.2', '2026-09-17', '예제 실사용 점검', JSON_ARRAY('글자 크기 설정 규칙을 배포 토큰 CSS 에 포함', 'React 부품 배포 묶음 신설', 'Badge·Alert 상태 변형 정식화, 아이콘 스프라이트 신설')),
('x5duz9nkxf3mt5b6', 'guide', '토큰·규칙', '1.4.0', '2026-10-06', 'SI 공용 규칙으로', JSON_ARRAY('powerPlus 의 powerGuide 메뉴로 옮김 — 로그인 없이 누구나', '토큰 16종 산출물을 한 화면에서 내려받기', 'KRDS 대응표·접근성 검증 결과를 메뉴로 분리'));
