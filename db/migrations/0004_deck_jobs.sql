-- keep:always
-- powerDeck 장표 변환 (설계서 db-design §4 deck_*). 출처: powerDeck api/schema.sql uploads·jobs·job_files·job_events 를
-- 콘텐츠 공통 6열(public_id·owner·org·visibility·시각)로 재설계. 엔진(워커)은 pp_worker_ 키 + X-Worker 로 붙는다.
-- 운영에서 생기는 표라 keep:always — 덤프 제외(§16.2).

-- 분할 업로드(8MB 조각 PUT 원본 바이트). 조각 수신 여부는 received 비트맵 대신 CSV(옛 방식 유지 — 단순·행 잠금).
CREATE TABLE IF NOT EXISTS deck_uploads (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id      CHAR(16) NOT NULL,
  owner_user_id  BIGINT UNSIGNED NOT NULL,
  filename       VARCHAR(255) NOT NULL,
  bytes          BIGINT UNSIGNED NOT NULL,
  chunk_size     INT UNSIGNED NOT NULL,
  chunks         INT UNSIGNED NOT NULL,
  received       TEXT NOT NULL,                        -- "0,1,2"
  purpose        ENUM('source','doc') NOT NULL DEFAULT 'source',
  job_id         BIGINT UNSIGNED NULL,                 -- purpose=doc 일 때 붙일 작업
  status         ENUM('open','done','aborted') NOT NULL DEFAULT 'open',
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_dupload_public (public_id),
  KEY ix_dupload_owner (owner_user_id, created_at),
  CONSTRAINT fk_dupload_owner FOREIGN KEY (owner_user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 작업. 상태·단계는 옛 파워덱 집합 그대로(엔진 계약 유지).
CREATE TABLE IF NOT EXISTS deck_jobs (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id        CHAR(16) NOT NULL,
  owner_user_id    BIGINT UNSIGNED NULL,
  org_id           BIGINT UNSIGNED NULL,
  visibility       ENUM('internal','partner','pro','free','public','private') NOT NULL DEFAULT 'private',
  share_level      TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0 끔 · 1 로그인 의견 · 2 로그인 편집 · 3 링크만 있으면 보기(§19)
  title            VARCHAR(255) NOT NULL,
  filename         VARCHAR(255) NULL,
  bytes            BIGINT UNSIGNED NOT NULL DEFAULT 0,
  slides           INT UNSIGNED NULL,
  kind             ENUM('polish','design') NOT NULL DEFAULT 'polish',
  source_kind      ENUM('pptx','md','text') NOT NULL DEFAULT 'pptx',
  brief            MEDIUMTEXT NULL,                      -- design 일 때 내용
  note             TEXT NULL,                            -- 요청 사항
  status           ENUM('hold','queued','running','review','done','failed','canceled') NOT NULL DEFAULT 'queued',
  phase            ENUM('pilot','full','plan','build','edit') NOT NULL DEFAULT 'full',
  pilot_slide      INT UNSIGNED NULL,
  feedback         TEXT NULL,
  opts             JSON NULL,
  theme            VARCHAR(16) NULL,                     -- 강조색 #RRGGBB
  plan_json        MEDIUMTEXT NULL,
  review_json      MEDIUMTEXT NULL,
  report_json      MEDIUMTEXT NULL,
  result_name      VARCHAR(255) NULL,
  stage            VARCHAR(80) NULL,
  pct              TINYINT UNSIGNED NOT NULL DEFAULT 0,
  worker           VARCHAR(80) NULL,
  cancel_requested TINYINT(1) NOT NULL DEFAULT 0,
  credits_used     INT UNSIGNED NOT NULL DEFAULT 0,
  error            TEXT NULL,
  queued_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  claimed_at       DATETIME(3) NULL,
  heartbeat_at     DATETIME(3) NULL,
  started_at       DATETIME(3) NULL,
  finished_at      DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at       DATETIME(3) NULL,
  UNIQUE KEY ux_djob_public (public_id),
  KEY ix_djob_owner (owner_user_id, deleted_at, created_at),
  KEY ix_djob_queue (status, queued_at),
  KEY ix_djob_heartbeat (status, heartbeat_at),
  CONSTRAINT fk_djob_owner FOREIGN KEY (owner_user_id) REFERENCES core_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 작업 파일. kind 는 옛 11종 유지(엔진이 올리는 종류). 파일은 storage/deck/jobs/{public_id}/{kind}/{name}.
CREATE TABLE IF NOT EXISTS deck_job_files (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id     BIGINT UNSIGNED NOT NULL,
  kind       ENUM('source','result','before','after','extra','live','frames','draft','pilot','mockup','brand','doc') NOT NULL,
  slide      INT UNSIGNED NULL,
  name       VARCHAR(255) NOT NULL,
  bytes      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_dfile (job_id, kind, name),
  CONSTRAINT fk_dfile_job FOREIGN KEY (job_id) REFERENCES deck_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 작업 기록(진행 이벤트). 화면이 after=id 로 이어 받는다.
CREATE TABLE IF NOT EXISTS deck_job_events (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id     BIGINT UNSIGNED NOT NULL,
  kind       ENUM('info','warn','error','done','think','stage') NOT NULL DEFAULT 'info',
  message    TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_devent_job (job_id, id),
  CONSTRAINT fk_devent_job FOREIGN KEY (job_id) REFERENCES deck_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 엔진 AI 사용(구독 환산·실제 청구 한 표, §19)
CREATE TABLE IF NOT EXISTS deck_ai_usage (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id     BIGINT UNSIGNED NULL,
  user_id    BIGINT UNSIGNED NULL,
  kind       VARCHAR(24) NOT NULL,                      -- engine·eplan·edigest·escript·ewire(구독 환산) / text·image(실제 청구)
  model      VARCHAR(128) NOT NULL DEFAULT '',
  cost_usd   DECIMAL(10,5) NOT NULL DEFAULT 0,
  tokens_in  INT UNSIGNED NOT NULL DEFAULT 0,
  tokens_out INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_dai_job (job_id),
  KEY ix_dai_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 엔진 생존 기록
CREATE TABLE IF NOT EXISTS deck_workers (
  name       VARCHAR(80) PRIMARY KEY,
  info       VARCHAR(255) NULL,
  seen_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
