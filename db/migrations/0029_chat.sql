-- keep:always
-- 0029 메인 채팅 — 홈 한가운데 입력창에서 제안서를 단계별로 진행한다(docs/powerplus-main-chat-design.md).
-- 실제 작업은 powerDeck 작업(deck_jobs, kind=design) 하나가 한다 — 채팅은 그 위에서 단계를 묻고 결과 카드를 보여 주는 층.
-- 무료 한도는 월 단위(매월 1일 초기화, 이월 없음), 결과가 완성됐을 때 센다(실패는 세지 않음).
CREATE TABLE IF NOT EXISTS chat_projects (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  public_id CHAR(16) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  step VARCHAR(20) NOT NULL DEFAULT 'intent',      -- intent·upload·review·outline·plan·mockup·script·export·done
  deck_job_id CHAR(16) NULL,
  state JSON NULL,                                -- 단계 진행 기록(카드를 이미 붙였는지 등)
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_chat_pid (public_id),
  KEY ix_chat_user (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(10) NOT NULL,                      -- user·ai·system
  kind VARCHAR(20) NOT NULL DEFAULT 'text',       -- text·summary·outline·plan·mockup·limit·actions·progress
  body TEXT NULL,
  card JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_chatmsg_project (project_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_usage (
  user_id BIGINT UNSIGNED NOT NULL,
  ym CHAR(7) NOT NULL,                            -- 2026-10
  plan_n INT UNSIGNED NOT NULL DEFAULT 0,
  mock_n INT UNSIGNED NOT NULL DEFAULT 0,
  upload_n INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, ym)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
