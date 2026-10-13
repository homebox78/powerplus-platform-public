-- keep:always
-- 0017 powerMock 개선 체크리스트 — 목업 제작 때 검수 항목 증적.
-- 출처: homebox-handoff db/migrations/0032_design_checklist.sql 구조 그대로(표 이름만 mock_ 접두).
-- 같은 결함은 한 줄(slug)에 횟수(hits)와 최근 근거 20개로 쌓인다. 고친(fixed) 줄이 다시 걸리면 regressed=1 로 다시 연다.
-- 쌓이는 곳: ① 시안 판정(POST /mock/mockups/{token}/check) ② 시험 보고(관리자 API) ③ 관리자 화면 직접.
-- 운영에서 쌓이는 데이터라 매번 IF NOT EXISTS 로 보장한다.
CREATE TABLE IF NOT EXISTS mock_checklist (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL,
  area VARCHAR(24) NOT NULL DEFAULT 'mockup',
  title VARCHAR(200) NOT NULL,
  detail TEXT NULL,
  origin ENUM('judge','test','pref','manual') NOT NULL DEFAULT 'manual',
  status ENUM('open','fixing','fixed','watch','wontfix') NOT NULL DEFAULT 'open',
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  regressed TINYINT(1) NOT NULL DEFAULT 0,
  evidence JSON NULL,
  fix_note VARCHAR(1000) NULL,
  fix_commit VARCHAR(40) NULL,
  first_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  fixed_at DATETIME(3) NULL,
  legacy_id BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_mock_checklist_slug (slug),
  KEY idx_mock_checklist_status (status, hits),
  KEY idx_mock_checklist_area (area, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
