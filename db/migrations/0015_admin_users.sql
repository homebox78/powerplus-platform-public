-- 관리자 사용자 관리 고도화(기획 §9.2 사용자): 차단·수동 플랜·포인트/크레딧 수동 조정.
-- - core_users.status: active | blocked. 차단은 세션 무효화(session_epoch+1) + 로그인 거부(Users::findOrCreateByLogin·Auth::resolve).
-- - core_subscriptions.source: pg(결제) | manual(관리자 지정) | legacy(이관). memo 는 지정 사유.
-- - core_point_ledger.memo / core_credit_ledger.memo: 관리자 조정 사유(reason='admin_adjust', kind='admin_adjust', ref = 감사 id).
-- 전부 ADD COLUMN IF NOT EXISTS 라 다시 돌려도 안전(MariaDB 10.11).
ALTER TABLE core_users
  ADD COLUMN IF NOT EXISTS status ENUM('active','blocked') NOT NULL DEFAULT 'active' AFTER kind,
  ADD COLUMN IF NOT EXISTS blocked_at DATETIME(3) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(200) NULL AFTER blocked_at;

ALTER TABLE core_subscriptions
  ADD COLUMN IF NOT EXISTS source ENUM('pg','manual','legacy') NOT NULL DEFAULT 'pg' AFTER status,
  ADD COLUMN IF NOT EXISTS memo VARCHAR(200) NULL AFTER source;

ALTER TABLE core_point_ledger
  ADD COLUMN IF NOT EXISTS memo VARCHAR(200) NULL AFTER ref_id;

ALTER TABLE core_credit_ledger
  MODIFY COLUMN kind ENUM('grant_month','purchase','use','refund','expire','point_convert','admin_adjust') NOT NULL,
  ADD COLUMN IF NOT EXISTS memo VARCHAR(200) NULL AFTER ref_id;
