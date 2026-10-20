-- keep:always
-- 0046 자산 받은편지함(사용자 2026-10-20 "내가 이미지를 올려두면 알아서 일정시간 서버가 확인 후 자동 등록"). 설계 docs/db-design.md §3.
-- asset_inbox: 한 줄 = 관리자가 올린 그림 한 장. 관리자 › powerAssets › 자산 받은편지함 에서 올리고,
--   api/bin/asset-inbox.php(크론 10분)가 중복 확인 → 줄이기·변환 → AI 판정 → 등록(asset_items) 또는 검토 필요로 돌린다.
--   · path 는 <storage.dir>/inbox/ 아래 상대 경로(웹 밖). 원본은 등록·중복·빼기 뒤 지우고 미리보기(.thumb.webp)만 남긴다.
--   · 운영에서 쌓이는 표라 keep:always. IF NOT EXISTS 라 다시 돌려도 안전.
CREATE TABLE IF NOT EXISTS asset_inbox (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  batch CHAR(16) NOT NULL,
  set_name VARCHAR(120) NOT NULL,
  kind_hint ENUM('auto','photo','illust','icon') NOT NULL DEFAULT 'auto',
  orig_name VARCHAR(255) NOT NULL DEFAULT '',
  path VARCHAR(255) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  bytes INT UNSIGNED NOT NULL DEFAULT 0,
  w SMALLINT UNSIGNED NULL,
  h SMALLINT UNSIGNED NULL,
  status ENUM('pending','processing','done','review','dup','failed','rejected') NOT NULL DEFAULT 'pending',
  reason VARCHAR(300) NULL,
  ai_name VARCHAR(200) NULL,
  ai_ko JSON NULL,
  ai_en JSON NULL,
  ai_category VARCHAR(16) NULL,
  ai_has_text TINYINT(1) NULL,
  item_id BIGINT UNSIGNED NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  tries TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_inbox_public (public_id),
  KEY ix_inbox_status_id (status, id),
  KEY ix_inbox_sha (sha256),
  KEY ix_inbox_batch (batch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
