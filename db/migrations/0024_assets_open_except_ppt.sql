-- 2026-10-07 사용자 결정: PPT 장표를 제외한 에셋은 모두 열람 가능(public).
-- 장표(ppt)는 사내 전용 그대로, 목업 샘플(mockup_sample)은 관리자·MCP 전용이라 그대로 둔다.
UPDATE asset_items SET visibility = 'public'
WHERE deleted_at IS NULL
  AND category NOT IN ('ppt', 'mockup_sample')
  AND visibility IN ('internal', 'pro');
