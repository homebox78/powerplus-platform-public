-- powerDeck 옛 스키마를 deck_ 접두로 그대로. 출처: D:/powerDeck/api/schema.sql (auth_codes·sessions 제외, ALTER 는 CREATE 에 이미 반영돼 생략)
-- 0004 가 만든 다른 모양의 표는 지우고 다시 만든다(운영 데이터 없음, 로컬 E2E 뿐).
DROP TABLE IF EXISTS deck_job_files, deck_job_events, deck_ai_usage, deck_workers, deck_jobs, deck_uploads;

CREATE TABLE IF NOT EXISTS deck_uploads (
  id CHAR(24) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  chunk_size INT NOT NULL,
  chunks INT NOT NULL,
  received TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL,
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_jobs (
  id CHAR(16) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  slides INT NULL,
  note TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  stage VARCHAR(64) NULL,
  progress INT NOT NULL DEFAULT 0,
  worker VARCHAR(64) NULL,
  claimed_at DATETIME NULL,
  heartbeat_at DATETIME NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  result_name VARCHAR(255) NULL,
  report MEDIUMTEXT NULL,
  error TEXT NULL,
  cancel_requested TINYINT NOT NULL DEFAULT 0,
  phase VARCHAR(8) NOT NULL DEFAULT 'full',
  pilot_slide INT NULL,
  feedback TEXT NULL,
  kind VARCHAR(8) NOT NULL DEFAULT 'polish',
  source_kind VARCHAR(8) NOT NULL DEFAULT 'pptx',
  brief MEDIUMTEXT NULL,
  budget_usd DECIMAL(8,2) NULL,
  spent_usd DECIMAL(10,4) NOT NULL DEFAULT 0,
  plan MEDIUMTEXT NULL,
  review MEDIUMTEXT NULL,
  theme VARCHAR(32) NULL,
  docs_purged_at DATETIME NULL,
  opts TEXT NULL,
  shared TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  INDEX idx_status (status, created_at),
  INDEX idx_email (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_job_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(16) NOT NULL,
  ts DATETIME NOT NULL,
  kind VARCHAR(24) NOT NULL,
  message TEXT NOT NULL,
  INDEX idx_job (job_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_job_files (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(16) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  slide INT NULL,
  name VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_file (job_id, kind, name),
  INDEX idx_job (job_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_workers (
  name VARCHAR(64) PRIMARY KEY,
  seen_at DATETIME NOT NULL,
  info VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_ai_settings (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_ai_user_keys (
  email VARCHAR(255) PRIMARY KEY,
  key_enc TEXT NOT NULL,
  key_hint VARCHAR(32) NULL,
  plan_model VARCHAR(128) NULL,
  image_model VARCHAR(128) NULL,
  default_budget_usd DECIMAL(8,2) NULL,
  monthly_cap_usd DECIMAL(8,2) NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_ai_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  job_id CHAR(16) NULL,
  kind VARCHAR(8) NOT NULL,
  model VARCHAR(128) NOT NULL,
  cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  INDEX idx_email (email, created_at),
  INDEX idx_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_job_comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(16) NOT NULL,
  slide INT NOT NULL,
  x DECIMAL(6,4) NOT NULL,
  y DECIMAL(6,4) NOT NULL,
  email VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  resolved TINYINT NOT NULL DEFAULT 0,
  accepted TINYINT NOT NULL DEFAULT 0,
  reply TEXT NULL,
  target VARCHAR(8) NOT NULL DEFAULT 'mockup',
  created_at DATETIME NOT NULL,
  INDEX idx_job (job_id, slide)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_job_comment_replies (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  comment_id BIGINT NOT NULL,
  job_id CHAR(16) NOT NULL,
  email VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_c (comment_id),
  INDEX idx_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_job_docs (
  id CHAR(16) PRIMARY KEY,
  job_id CHAR(16) NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 엔진 PC 에 맡기는 글 AI 작업(발표 대본 등) — 서버가 넣고 엔진이 가져가 Claude 구독으로 돌린다
CREATE TABLE IF NOT EXISTS deck_ai_tasks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(16) NULL,
  email VARCHAR(255) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'queued',
  worker VARCHAR(64) NULL,
  result MEDIUMTEXT NULL,
  error TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
