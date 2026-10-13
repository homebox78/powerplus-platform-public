-- 자산 한 행에 옛 키 두 벌(파워플러스 id + 홈박스 샘플 id) — db-design §7 "legacy_key 두 벌 보존".
-- legacy_key(UNIQUE) 는 먼저 들어온 쪽(파워플러스), legacy_alt_key 는 같은 그림으로 판정된 다른 쪽.
ALTER TABLE asset_items ADD COLUMN IF NOT EXISTS legacy_alt_key VARCHAR(64) NULL AFTER legacy_key;
ALTER TABLE asset_items ADD INDEX IF NOT EXISTS ix_items_legacy_alt (legacy_alt_key);
