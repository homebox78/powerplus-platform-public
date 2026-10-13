-- keep:always
-- 0030 powerDeck 개선 체크리스트 — 장표 작업 결함 증적 + 다음 작업 엔진 지시로 되먹임(자가 개선).
-- 구조는 mock_checklist(0017)와 같다. 쌓이는 곳: 와이어 검사·엔진 확인 목록·사용자 의견·실패 사유·관리자 직접.
-- 운영에서 쌓이는 데이터라 매번 IF NOT EXISTS 로 보장한다.
CREATE TABLE IF NOT EXISTS deck_checklist (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL,
  area VARCHAR(24) NOT NULL DEFAULT 'misc',
  title VARCHAR(200) NOT NULL,
  detail TEXT NULL,
  origin ENUM('wire','report','user','fail','manual') NOT NULL DEFAULT 'manual',
  status ENUM('open','fixing','fixed','watch','wontfix') NOT NULL DEFAULT 'open',
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  regressed TINYINT(1) NOT NULL DEFAULT 0,
  evidence JSON NULL,
  fix_note VARCHAR(1000) NULL,
  fix_commit VARCHAR(40) NULL,
  first_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  fixed_at DATETIME(3) NULL,
  UNIQUE KEY uq_deck_checklist_slug (slug),
  KEY idx_deck_checklist_status (status, hits),
  KEY idx_deck_checklist_area (area, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
