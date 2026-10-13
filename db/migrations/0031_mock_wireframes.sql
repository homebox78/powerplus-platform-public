-- keep:always
-- 0031 powerMock 기획 와이어프레임 — 홈페이지 화면 한 장의 줄·칸(12칸 격자) 구성을 저장한다(api/src/Mock/Wire.php 모양).
-- 사용자 지시(2026-10-08): 시작하기 '기획 와이어프레임 — 준비 중' 을 실제로 동작하게. 기본 공개 범위는 private(본인·관리자만).
-- json = {version, screen, org, title?, lnb, rows:[{id, zone, cols:[{span,k,t?,h?}]}]}, check = 마지막 판정 {score, pass, issues, stats}.
CREATE TABLE IF NOT EXISTS mock_wireframes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  public_id CHAR(16) NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  org_id BIGINT UNSIGNED NULL,
  visibility ENUM('internal','partner','pro','free','public','private') NOT NULL DEFAULT 'private',
  title VARCHAR(200) NOT NULL,
  screen VARCHAR(32) NOT NULL,
  org_kind VARCHAR(20) NOT NULL DEFAULT 'all',
  request TEXT NULL,
  json JSON NOT NULL,
  score TINYINT UNSIGNED NULL,
  pass TINYINT(1) NOT NULL DEFAULT 0,
  check_result JSON NULL,
  source VARCHAR(10) NOT NULL DEFAULT 'rule',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_wire_pid (public_id),
  KEY ix_wire_owner (owner_user_id, deleted_at, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
