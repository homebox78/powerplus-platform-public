-- keep:always
-- 0033 사이트 품질 개선 체크리스트 — 모듈 하나에 속하지 않는 사이트 전체 품질(공통 화면·탐색·접근성·SEO·보안·성능·운영 등)의 결함 증적.
-- 구조는 deck_checklist(0030)와 같다. 쌓이는 곳: 품질 판정(audit, scripts/qc-import.mjs)·시험(test)·사용자 의견(user)·관리자 직접(manual).
-- area = 사이트 품질 체크리스트 ID 접두(gen·nav·home·ast·gde·mcp·com·acc·adm·rsp·a11y·seo·sec·perf·legal·ops·data …).
-- 장표 체크리스트와 달리 엔진 되먹임은 없다. 운영에서 쌓이는 데이터라 매번 IF NOT EXISTS 로 보장한다.
CREATE TABLE IF NOT EXISTS site_checklist (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL,
  area VARCHAR(24) NOT NULL DEFAULT 'misc',
  title VARCHAR(200) NOT NULL,
  detail TEXT NULL,
  origin ENUM('audit','test','user','manual') NOT NULL DEFAULT 'manual',
  status ENUM('open','fixing','fixed','watch','wontfix') NOT NULL DEFAULT 'open',
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  regressed TINYINT(1) NOT NULL DEFAULT 0,
  evidence JSON NULL,
  fix_note VARCHAR(1000) NULL,
  fix_commit VARCHAR(40) NULL,
  first_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  fixed_at DATETIME(3) NULL,
  UNIQUE KEY uq_site_checklist_slug (slug),
  KEY idx_site_checklist_status (status, hits),
  KEY idx_site_checklist_area (area, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
