-- keep:always
-- 도움말 문서를 DB 로(관리자 편집). 출처: apps/web/app/lib/help-content.ts 의 정적 카테고리·문서 → core_help_docs.
-- 카테고리(start·assets·deck·mock·guide·account)는 코드 상수(제목·설명·아이콘)로 두고 문서만 표에 둔다.
-- 본문은 markdown — 문단은 빈 줄, 단계는 "1. " 번호 목록. 운영에서 관리자가 고치는 표라 keep:always(덤프 제외), 시드는 ON DUPLICATE 로 멱등.
CREATE TABLE IF NOT EXISTS core_help_docs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id   CHAR(16) NOT NULL,
  category    VARCHAR(20) NOT NULL,
  slug        VARCHAR(80) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        MEDIUMTEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  published   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3) NULL,
  UNIQUE KEY ux_help_public (public_id),
  UNIQUE KEY ux_help_slug (category, slug),
  KEY ix_help_list (category, published, deleted_at, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO core_help_docs (public_id, category, slug, title, body, sort_order, published) VALUES
('6e1fd2c80eb6ef77', 'start', 'what-is-powerplus', 'powerPlus 는 어떤 서비스인가요?', 'SI 실무자에게 필요한 도구를 한곳에 모은 서비스입니다.\n\n제안서 자산, 장표 변환, 홈페이지 목업, 디자인 규칙을 한 계정으로 씁니다.\n\n1. powerAssets: 장표에 넣을 아이콘·사진·일러스트\n2. powerDeck: 초안 장표를 정리된 장표로\n3. powerMock: 홈페이지 기획부터 시안·코드까지\n4. powerGuide: 디자인 토큰·부품·KRDS 규칙', 1, 1),
('f3cf095b0ba9e7ec', 'start', 'signup', '가입하고 로그인하기', '이메일로 받은 6자리 코드나 구글·네이버·카카오 계정으로 로그인합니다.\n\n회사 이메일로 인증하면 임직원 계정이 됩니다.\n\n만 14세 이상만 가입할 수 있습니다.', 2, 1),
('6633589dc7fd4647', 'start', 'where-to-start', '무엇부터 해 보면 좋을까요?', '로그인 없이도 powerGuide 와 자산 둘러보기를 쓸 수 있습니다.\n\n장표를 정리해야 하면 powerDeck, 홈페이지 시안이 필요하면 powerMock 부터 여세요.', 3, 1),
('7ccdae3c31afca5e', 'assets', 'install', 'PowerPoint 애드인 설치하기', 'powerAssets 시작하기 화면에서 설치 파일을 받아 실행합니다.\n\nOffice 2019·2021·365 에서 동작합니다. Office 2016 은 지원하지 않습니다.\n\n1. powerAssets › 시작하기에서 설치 파일을 받습니다.\n2. 파일을 실행하고 PowerPoint 를 다시 엽니다.\n3. 삽입 › 추가 기능 › 개발자 추가 기능에서 powerAssets 를 엽니다.\n4. 작업창에서 로그인합니다.', 1, 1),
('cb6ca113dca376d5', 'assets', 'search', '원하는 자산을 찾는 법', '검색은 비슷한 말과 오타를 함께 찾아 줍니다.\n\n같은 스타일 세트로 모아 보면 장표의 톤을 맞추기 쉽습니다.', 2, 1),
('c5225f3ea2380388', 'assets', 'ai-assets', 'AI 로 만든 자산은 어떻게 구분하나요?', '생성형 AI 로 만든 자산에는 AI 표시가 붙습니다. 자산 상세에서 확인할 수 있습니다.', 3, 1),
('095f4954bfa48367', 'assets', 'request', '없는 자료를 요청하려면', 'powerAssets › 자료 요청에서 필요한 자료를 적어 주세요. 등록되면 알림으로 알려 드립니다.', 4, 1),
('5e22048f04ebac9f', 'deck', 'how-it-works', '장표 변환은 어떻게 진행되나요?', '초안 pptx 나 자료를 올리면 기획 → 와이어프레임 → 시안 → 장표 순서로 진행합니다.\n\n한 장 시안을 먼저 보고 마음에 들면 나머지를 진행합니다.\n\n1. powerDeck › 변환에서 파일을 올립니다.\n2. 기획과 와이어프레임을 확인하고 고칩니다.\n3. 한 장 시안을 보고 진행을 누릅니다.\n4. 완성된 장표를 내려받습니다.', 1, 1),
('24875626d7c74902', 'deck', 'files', '올린 파일은 얼마나 보관하나요?', '작업이 끝나고 7일이 지나면 원본과 중간 자료를 지웁니다.\n\n개인정보나 대외비가 담긴 문서는 올리지 않는 것을 권합니다.', 2, 1),
('048264e298321721', 'deck', 'share', '작업을 다른 사람과 보려면', '내 작업에서 공유 링크를 만들고 권한을 고릅니다. 의견만, 편집까지, 링크만 있으면 보기 중에서 고를 수 있습니다.', 3, 1),
('4c608c1d42afa040', 'deck', 'settings', '변환 설정은 어디서 바꾸나요?', '마이페이지 › 설정 › 장표 변환에서 바꿉니다.', 4, 1),
('240a12e3c51b2ac2', 'mock', 'connect', 'AI 도구에 연결하기', '마이페이지에서 키를 만들고, 쓰는 AI 도구에 powerMCP 주소와 키를 넣습니다.\n\n1. 마이페이지 › API · MCP 키에서 키를 만듭니다.\n2. powerMCP 연결 가이드에서 쓰는 도구를 고릅니다.\n3. 보이는 설정을 그대로 붙여 넣습니다.\n4. 도구의 MCP 목록에서 connected 인지 확인합니다.', 1, 1),
('07f5ea0f83603506', 'mock', 'mockup', '목업과 코드를 받으려면', '연결한 AI 에게 만들 화면을 말하면 기획부터 시안까지 함께 만듭니다.\n\n시안은 판정을 통과하면 게시 주소로 공유할 수 있습니다.\n\n글과 연락처는 가상 값이니 실제 내용으로 바꿔 쓰세요.\n\n1. "대학교 메인 시안 만들어 줘"처럼 화면을 말합니다.\n2. 여러 안이 필요하면 "서로 다른 구성으로"라고 덧붙입니다.\n3. 코드가 필요하면 "Vue 코드로" 또는 "React 코드로"라고 말합니다.', 2, 1),
('e4a96314b8fcc002', 'mock', 'gallery', '시안을 갤러리에 공유하려면', 'powerMock › 시안에서 공유를 켜면 갤러리에 올라갑니다. 공유하면 포인트를 받습니다.', 3, 1),
('055acaa43efc7142', 'mock', 'limits', '호출 한도를 넘으면', '하루 한도를 넘으면 다음 날 자정(한국 시간)까지 429 로 응답합니다.', 4, 1),
('12cdd5e6389e0966', 'guide', 'tokens', '토큰을 내려받으려면', 'powerGuide › 토큰에서 CSS·SCSS·Tailwind 등 쓰는 형식을 골라 받습니다. 로그인하지 않아도 됩니다.', 1, 1),
('04cbb060e635514e', 'guide', 'krds', 'KRDS 대응표는 어떻게 읽나요?', 'KRDS 컴포넌트마다 대응하는 우리 부품과 적용 상태를 보여 줍니다. 부품 이름을 누르면 미리보기가 열립니다.', 2, 1),
('fc6bcad53407df98', 'account', 'keys', 'API·MCP 키 관리', '키 하나로 powerMCP 와 REST API 를 함께 씁니다.\n\n키가 새면 마이페이지에서 바로 폐기하고 새로 만드세요.', 1, 1),
('22b581d42ed2aa7b', 'account', 'settings', '설정은 어디서 바꾸나요?', '모든 설정은 마이페이지 › 설정 한곳에 있습니다.', 2, 1),
('dee55aa5de69486f', 'account', 'leave', '탈퇴하려면', '마이페이지에서 탈퇴할 수 있습니다.\n\n탈퇴하면 개인정보를 지우고, 올린 글은 작성자를 익명으로 바꿉니다.', 3, 1)
ON DUPLICATE KEY UPDATE public_id = public_id;
