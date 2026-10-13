-- powerPlus 플랫폼 스키마 v0.1 (core_ + asset_). 설계서 docs/db-design.md 가 원본, 이 파일이 실체.
-- MariaDB 10.11 · InnoDB · utf8mb4_unicode_ci. 운영 손 ALTER 금지 — 변경은 db/migrations/*.sql.
-- 출처: homebox-handoff db/schema.sql(users·api_keys·plans·subscriptions) + powerPlus(assets·usage_log) 구조를 설계서 규칙으로 재설계.
SET NAMES utf8mb4;
SET time_zone = '+09:00';

CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(120) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- core_ : 계정·권한·과금·운영
-- =========================================================
CREATE TABLE IF NOT EXISTS core_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(60) NOT NULL,
  avatar_url VARCHAR(500) NULL,
  kind ENUM('staff','external') NOT NULL DEFAULT 'external',
  birthday DATE NULL,
  marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  marketing_opt_at DATETIME(3) NULL,
  name_changed_at DATETIME(3) NULL,
  prefs JSON NULL,
  session_epoch INT UNSIGNED NOT NULL DEFAULT 1,
  last_seen_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY ux_users_public (public_id),
  UNIQUE KEY ux_users_email (email),
  KEY ix_users_kind (kind, deleted_at),
  KEY ix_users_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 로그인 수단: 같은 사용자에 email(OTP)·google·naver·kakao 를 여러 개 연결
CREATE TABLE IF NOT EXISTS core_user_logins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('email','google','naver','kakao') NOT NULL,
  provider_uid VARCHAR(190) NOT NULL,
  email VARCHAR(190) NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  linked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  UNIQUE KEY ux_logins_provider_uid (provider, provider_uid),
  KEY ix_logins_user (user_id),
  CONSTRAINT fk_logins_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 역할 복수 허용. superadmin 은 config 고정 계정에만 코드가 넣는다(화면 부여 불가).
CREATE TABLE IF NOT EXISTS core_user_roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('superadmin','admin','curator','support') NOT NULL,
  granted_by BIGINT UNSIGNED NULL,
  granted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_roles_user_role (user_id, role),
  CONSTRAINT fk_roles_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_orgs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  name VARCHAR(120) NOT NULL,
  kind ENUM('company','team') NOT NULL DEFAULT 'team',
  domain VARCHAR(120) NULL,
  seats SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  owner_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY ux_orgs_public (public_id),
  UNIQUE KEY ux_orgs_domain (domain),
  CONSTRAINT fk_orgs_owner FOREIGN KEY (owner_user_id) REFERENCES core_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_org_members (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('owner','member') NOT NULL DEFAULT 'member',
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_members_org_user (org_id, user_id),
  KEY ix_members_user (user_id),
  CONSTRAINT fk_members_org FOREIGN KEY (org_id) REFERENCES core_orgs(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_otp_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  ip_masked VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_otp_email_expires (email, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 플랜은 시드(db/seed/plans.sql). limits: api_daily, api_keys, credits_month, mock_screens_per_site, assets_pro…(-1 무제한)
CREATE TABLE IF NOT EXISTS core_plans (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(40) NOT NULL,
  price_month_krw INT UNSIGNED NOT NULL DEFAULT 0,
  price_year_krw INT UNSIGNED NOT NULL DEFAULT 0,
  credits_month INT NOT NULL DEFAULT 0,
  limits JSON NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  sort SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY ux_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_subscriptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  owner_type ENUM('user','org') NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  plan_id SMALLINT UNSIGNED NOT NULL,
  billing ENUM('month','year') NOT NULL DEFAULT 'month',
  status ENUM('trial','active','past_due','canceled','expired') NOT NULL DEFAULT 'active',
  seats SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  pg_customer_key VARCHAR(100) NULL,
  billing_key_enc VARBINARY(1024) NULL,
  current_period_start DATETIME(3) NULL,
  current_period_end DATETIME(3) NULL,
  renews_at DATETIME(3) NULL,
  canceled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_subs_public (public_id),
  KEY ix_subs_owner_status (owner_type, owner_id, status),
  KEY ix_subs_renews (renews_at),
  CONSTRAINT fk_subs_plan FOREIGN KEY (plan_id) REFERENCES core_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  subscription_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  kind ENUM('subscription','credits') NOT NULL DEFAULT 'subscription',
  amount_krw INT UNSIGNED NOT NULL,
  vat_krw INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  pg_payment_key VARCHAR(200) NULL,
  receipt_url VARCHAR(500) NULL,
  tax_invoice_no VARCHAR(60) NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at DATETIME(3) NULL,
  refunded_at DATETIME(3) NULL,
  UNIQUE KEY ux_inv_public (public_id),
  KEY ix_inv_sub_issued (subscription_id, issued_at),
  KEY ix_inv_user (user_id),
  CONSTRAINT fk_inv_sub FOREIGN KEY (subscription_id) REFERENCES core_subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 크레딧 = 장표 변환 1장. 잔액은 마지막 행 balance_after.
CREATE TABLE IF NOT EXISTS core_credit_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  org_id BIGINT UNSIGNED NULL,
  delta INT NOT NULL,
  kind ENUM('grant_month','purchase','use','refund','expire','point_convert') NOT NULL,
  ref_type VARCHAR(40) NULL,
  ref_id VARCHAR(40) NULL,
  balance_after INT NOT NULL,
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_credit_user_created (user_id, created_at),
  KEY ix_credit_org_created (org_id, created_at),
  KEY ix_credit_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 포인트(무상 적립만). 중복 적립 차단 = ux_dedup. 출처: homebox point_ledger
CREATE TABLE IF NOT EXISTS core_point_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(40) NOT NULL,
  ref_type VARCHAR(40) NOT NULL DEFAULT '',
  ref_id VARCHAR(40) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_point_dedup (user_id, reason, ref_type, ref_id),
  KEY ix_point_user_created (user_id, created_at),
  CONSTRAINT fk_point_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_point_rules (
  reason VARCHAR(40) PRIMARY KEY,
  delta INT NOT NULL,
  daily_cap INT NULL,
  yearly_cap INT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  note VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API·MCP 키 하나. 원문은 sha256 만 저장, key_enc 로 다시 보기. 출처: homebox api_keys + powerplus mcp_keys
CREATE TABLE IF NOT EXISTS core_api_keys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  org_id BIGINT UNSIGNED NULL,
  name VARCHAR(60) NOT NULL,
  prefix VARCHAR(12) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  key_enc VARBINARY(512) NULL,
  key_last4 CHAR(4) NOT NULL,
  scopes JSON NOT NULL,
  daily_limit INT NULL,
  ip_allow JSON NULL,
  legacy_source VARCHAR(20) NULL,
  expires_at DATETIME(3) NULL,
  last_used_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_keys_public (public_id),
  UNIQUE KEY ux_keys_hash (key_hash),
  KEY ix_keys_user (user_id, revoked_at),
  CONSTRAINT fk_keys_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_api_usage (
  api_key_id BIGINT UNSIGNED NOT NULL,
  day DATE NOT NULL,
  tool VARCHAR(48) NOT NULL,
  calls INT UNSIGNED NOT NULL DEFAULT 0,
  bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ms_sum BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, day, tool),
  CONSTRAINT fk_usage_key FOREIGN KEY (api_key_id) REFERENCES core_api_keys(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 작업 큐 하나(엔진·수집·판정·파생). claim 은 ix_jobs_claim 한 줄.
CREATE TABLE IF NOT EXISTS core_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  kind VARCHAR(48) NOT NULL,
  status ENUM('queued','running','done','failed','canceled') NOT NULL DEFAULT 'queued',
  priority TINYINT NOT NULL DEFAULT 0,
  owner_user_id BIGINT UNSIGNED NULL,
  payload JSON NULL,
  result JSON NULL,
  worker VARCHAR(60) NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  run_after DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  locked_at DATETIME(3) NULL,
  heartbeat_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_jobs_public (public_id),
  KEY ix_jobs_claim (status, priority, run_after, id),
  KEY ix_jobs_kind_status (kind, status),
  KEY ix_jobs_owner (owner_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 파생물 동기화 이벤트(visibility 변경 → 색인·썸네일 정리)
CREATE TABLE IF NOT EXISTS core_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  content_type VARCHAR(40) NULL,
  content_id BIGINT UNSIGNED NULL,
  payload JSON NULL,
  processed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_events_unprocessed (processed_at, id),
  KEY ix_events_content (content_type, content_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_key_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id VARCHAR(40) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip_masked VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_audit_target (target_type, target_id),
  KEY ix_audit_actor_created (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_settings (
  k VARCHAR(80) PRIMARY KEY,
  v TEXT NULL,
  is_secret TINYINT(1) NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_feature_flags (
  k VARCHAR(80) PRIMARY KEY,
  is_on TINYINT(1) NOT NULL DEFAULT 0,
  rollout JSON NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NULL,
  link VARCHAR(500) NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_notif_user_unread (user_id, read_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_removal_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  no CHAR(12) NOT NULL,
  content_type VARCHAR(40) NOT NULL,
  content_id VARCHAR(40) NOT NULL,
  requester_email VARCHAR(190) NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('received','reviewing','done','rejected') NOT NULL DEFAULT 'received',
  due_at DATETIME(3) NOT NULL,
  handled_by BIGINT UNSIGNED NULL,
  handled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_removal_no (no),
  KEY ix_removal_status_due (status, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  bucket VARCHAR(40) NOT NULL,
  path VARCHAR(500) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  w SMALLINT UNSIGNED NULL,
  h SMALLINT UNSIGNED NULL,
  sha256 CHAR(64) NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  visibility ENUM('internal','partner','pro','free','public','private') NOT NULL DEFAULT 'internal',
  scanned_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY ux_files_public (public_id),
  KEY ix_files_sha (sha256),
  KEY ix_files_owner (owner_user_id),
  KEY ix_files_bucket_path (bucket, path(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- asset_ : powerAssets (파워플러스 자산 + 홈박스 샘플 통합)
-- =========================================================
CREATE TABLE IF NOT EXISTS asset_sets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  name VARCHAR(120) NOT NULL,
  style VARCHAR(40) NULL,
  category VARCHAR(20) NULL,
  cover_item_id BIGINT UNSIGNED NULL,
  item_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_sets_public (public_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  org_id BIGINT UNSIGNED NULL,
  visibility ENUM('internal','partner','pro','free','public','private') NOT NULL DEFAULT 'internal',
  category ENUM('icon','photo','illust','diagram','logo','ppt','mockup_sample') NOT NULL,
  name VARCHAR(200) NULL,
  alt VARCHAR(300) NULL,
  w SMALLINT UNSIGNED NULL,
  h SMALLINT UNSIGNED NULL,
  has_text TINYINT(1) NOT NULL DEFAULT 0,
  text_safe JSON NULL,
  style_sig VARCHAR(16) NULL,
  style_group VARCHAR(48) NULL,
  set_id BIGINT UNSIGNED NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'own',
  slide_kind ENUM('package','single') NULL,
  slide_page VARCHAR(20) NULL,
  sha256 CHAR(64) NULL,
  legacy_key VARCHAR(64) NULL,
  ai_generated TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY ux_items_public (public_id),
  UNIQUE KEY ux_items_legacy (legacy_key),
  KEY ix_items_cat_vis_created (category, visibility, created_at),
  KEY ix_items_vis (visibility, deleted_at),
  KEY ix_items_set (set_id),
  KEY ix_items_sha (sha256),
  KEY ix_items_style_group (category, style_group),
  CONSTRAINT fk_items_set FOREIGN KEY (set_id) REFERENCES asset_sets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_files (
  item_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('original','thumb','card','mcp','og','slide') NOT NULL,
  file_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (item_id, kind),
  CONSTRAINT fk_afiles_item FOREIGN KEY (item_id) REFERENCES asset_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_afiles_file FOREIGN KEY (file_id) REFERENCES core_files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 태그를 행으로(파워플러스 JSON LIKE 검색·대소문자 사고 해소). axis: kw 검색어 / kind·use·target·style 은 홈박스 샘플 축
CREATE TABLE IF NOT EXISTS asset_tags (
  item_id BIGINT UNSIGNED NOT NULL,
  tag VARCHAR(64) NOT NULL,
  lang ENUM('ko','en') NOT NULL DEFAULT 'ko',
  axis ENUM('kw','kind','use','target','style') NOT NULL DEFAULT 'kw',
  PRIMARY KEY (item_id, tag, axis),
  KEY ix_tags_tag_axis (tag, axis),
  KEY ix_tags_axis_tag (axis, tag),
  CONSTRAINT fk_tags_item FOREIGN KEY (item_id) REFERENCES asset_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_tag_dict (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tag VARCHAR(64) NOT NULL,
  group_id INT UNSIGNED NOT NULL,
  lang ENUM('ko','en') NOT NULL DEFAULT 'ko',
  UNIQUE KEY ux_dict_tag_lang (tag, lang),
  KEY ix_dict_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_uses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  api_key_id BIGINT UNSIGNED NULL,
  channel ENUM('addin','mcp','deck','web') NOT NULL,
  ref_type VARCHAR(40) NULL,
  ref_id VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_uses_item_created (item_id, created_at),
  KEY ix_uses_user_created (user_id, created_at),
  KEY ix_uses_key_created (api_key_id, created_at),
  CONSTRAINT fk_uses_item FOREIGN KEY (item_id) REFERENCES asset_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_favorites (
  user_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_item FOREIGN KEY (item_id) REFERENCES asset_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  kind VARCHAR(20) NULL,
  detail TEXT NULL,
  status ENUM('new','done','rejected') NOT NULL DEFAULT 'new',
  source ENUM('user','mcp_gap') NOT NULL DEFAULT 'user',
  handled_item_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_req_public (public_id),
  KEY ix_req_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_search_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  q VARCHAR(200) NOT NULL,
  results INT UNSIGNED NOT NULL DEFAULT 0,
  user_id BIGINT UNSIGNED NULL,
  channel ENUM('addin','mcp','web') NOT NULL DEFAULT 'web',
  day DATE NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_search_day (day),
  KEY ix_search_q (q(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 플랜 시드(기획 §15.3·§13.2 표). 숫자는 추천값 — 사용자가 보고 조정.
INSERT INTO core_plans (code, name, price_month_krw, price_year_krw, credits_month, limits, is_public, sort) VALUES
 ('free',  'Free',  0,     0,     0,   '{"api_daily":100,"api_keys":1,"mock_screens_per_site":5,"assets_pro":false,"credits_trial":3}', 1, 1),
 ('pro',   'Pro',   19000, 16000, 50,  '{"api_daily":1000,"api_keys":3,"mock_screens_per_site":-1,"assets_pro":true}', 1, 2),
 ('team',  'Team',  59000, 49000, 200, '{"api_daily":5000,"api_keys":5,"mock_screens_per_site":-1,"assets_pro":true,"seats":5}', 1, 3),
 ('staff', '임직원', 0,     0,     -1,  '{"api_daily":5000,"api_keys":10,"mock_screens_per_site":-1,"assets_pro":true,"internal":true}', 0, 9)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO core_point_rules (reason, delta, daily_cap, yearly_cap, note) VALUES
 ('signup', 100, 1, NULL, '가입'), ('attend', 5, 1, NULL, '출석(일 1회)'), ('attend_streak7', 20, 1, NULL, '연속 7일'),
 ('birthday', 50, NULL, 1, '생일'), ('share_create', 20, 3, NULL, '공유 링크 만들기'), ('share_open', 5, 20, NULL, '내 공유 링크 열림'),
 ('mockup_keep', 20, 5, NULL, '시안 보관 81점+'), ('like_received', 2, 50, NULL, '좋아요 받기'), ('post', 10, 5, NULL, '글'),
 ('comment', 3, 20, NULL, '댓글'), ('guide_proposal_accepted', 100, NULL, NULL, '규칙 제안 채택'), ('asset_request_accepted', 50, NULL, NULL, '콘텐츠 요청 채택'),
 ('use_mockup_open', -30, NULL, NULL, '남의 시안 열기'), ('use_asset_preview', -50, 3, NULL, 'pro 에셋 미리보기'),
 ('use_deck_credit', -300, NULL, NULL, '장표 체험 1크레딧'), ('use_screen_unlock', -20, NULL, NULL, '잠긴 화면 1장')
ON DUPLICATE KEY UPDATE delta = VALUES(delta);

INSERT INTO core_feature_flags (k, is_on) VALUES ('billing.visible', 0) ON DUPLICATE KEY UPDATE k = k;
