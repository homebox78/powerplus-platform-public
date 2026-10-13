-- keep:always
-- 문의(/contact)·삭제요청(/removal) — 정보·정책 페이지 이식(2026-10-06).
-- 출처: homebox-handoff api/routes/requests.php(contact → requests kind=contact)·removal.php(removal_requests)
--   → core_contacts 새 표 + core_removal_requests 에 권리자·대상·상세·처리 결과 열 추가.
-- 운영에서 사용자가 만드는 데이터라 덤프 교체 대상이 아니다(§16.2).

CREATE TABLE IF NOT EXISTS core_contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  user_id BIGINT UNSIGNED NULL,                  -- 로그인 상태로 보냈으면 회원
  topic VARCHAR(20) NOT NULL,                    -- general·team·data·bug·partner
  module VARCHAR(10) NULL,                       -- 관련 모듈(assets·deck·mock·guide)
  name VARCHAR(60) NOT NULL,
  email VARCHAR(190) NOT NULL,
  org VARCHAR(120) NULL,
  seats INT UNSIGNED NULL,
  message TEXT NOT NULL,
  status ENUM('open','answered','closed') NOT NULL DEFAULT 'open',
  ip VARCHAR(45) NULL,                           -- 마지막 옥텟 0 으로 익명화(Audit::ip)
  handled_by BIGINT UNSIGNED NULL,
  handled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_contact_public (public_id),
  KEY ix_contact_status (status, id),
  KEY ix_contact_email (email, created_at),
  CONSTRAINT fk_contact_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE core_removal_requests
  ADD COLUMN IF NOT EXISTS claimant_name VARCHAR(80) NULL AFTER content_id,
  ADD COLUMN IF NOT EXISTS claimant_org VARCHAR(120) NULL AFTER claimant_name,
  ADD COLUMN IF NOT EXISTS claimant_phone VARCHAR(30) NULL AFTER requester_email,
  ADD COLUMN IF NOT EXISTS target_url VARCHAR(300) NULL AFTER claimant_phone,
  ADD COLUMN IF NOT EXISTS reason_kind ENUM('copyright','privacy','other') NOT NULL DEFAULT 'other' AFTER target_url,
  ADD COLUMN IF NOT EXISTS resolution TEXT NULL AFTER handled_at,
  ADD KEY IF NOT EXISTS ix_removal_email (requester_email, created_at);
