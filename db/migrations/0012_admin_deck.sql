-- keep:always
-- 관리자 장표 운영(기획 §9.2 powerDeck): 작업 소프트 삭제 시각. 옛 deck_jobs(0005)에는 deleted_at 이 없어 보탠다.
-- 삭제된 작업은 status='deleted' + deleted_at 로 남기고(사용 기록·과금 대조용), 파일만 storage 에서 지운다.
ALTER TABLE deck_jobs ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER created_at;
ALTER TABLE deck_jobs ADD COLUMN IF NOT EXISTS deleted_by BIGINT UNSIGNED NULL AFTER deleted_at;
