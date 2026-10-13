-- 관리자 자산 백오피스(2026-10-06): 콘텐츠 요청 처리 열(답변·처리자) 추가. 자산 소프트 삭제는 asset_items.deleted_at 그대로.
-- 출처: powerPlus server/admin(콘텐츠 요청 상태 new/done/rejected) — 답변·처리 기록을 core_contacts 와 같은 모양으로.
ALTER TABLE asset_requests
  ADD COLUMN IF NOT EXISTS reply TEXT NULL AFTER detail,
  ADD COLUMN IF NOT EXISTS handled_by BIGINT UNSIGNED NULL AFTER handled_item_id,
  ADD COLUMN IF NOT EXISTS handled_at DATETIME(3) NULL AFTER handled_by,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER created_at;

-- 삭제된 자산 목록·복원용
ALTER TABLE asset_items ADD INDEX IF NOT EXISTS ix_items_deleted (deleted_at);
