-- keep:always
-- 옛 운영 데이터(파워플러스 사용자·홈박스 커뮤니티·시안·파워덱 작업) 이관용 legacy 매핑 열.
-- 이관 스크립트(db/migrate-legacy/*.mjs)가 같은 옛 행을 두 번 넣지 않게(멱등) 자연키가 없는 표에 legacy_key 를 둔다.
-- 값 형식: '<원천>:<표>:<옛 id>' 예) 'hb:notif:12', 'hb:coll:3'. 새로 생기는 행은 NULL — UNIQUE 는 NULL 을 여럿 허용한다.
-- 전부 ADD ... IF NOT EXISTS 라 몇 번 실행해도 같다.

ALTER TABLE core_notifications    ADD COLUMN IF NOT EXISTS legacy_key VARCHAR(64) NULL AFTER read_at;
ALTER TABLE core_notifications    ADD UNIQUE KEY IF NOT EXISTS ux_notif_legacy (legacy_key);

ALTER TABLE comm_comments         ADD COLUMN IF NOT EXISTS legacy_key VARCHAR(64) NULL AFTER body;
ALTER TABLE comm_comments         ADD UNIQUE KEY IF NOT EXISTS ux_cc_legacy (legacy_key);

ALTER TABLE core_collections      ADD COLUMN IF NOT EXISTS legacy_key VARCHAR(64) NULL AFTER shared_at;
ALTER TABLE core_collections      ADD UNIQUE KEY IF NOT EXISTS ux_coll_legacy (legacy_key);

ALTER TABLE core_contacts         ADD COLUMN IF NOT EXISTS legacy_key VARCHAR(64) NULL AFTER handled_at;
ALTER TABLE core_contacts         ADD UNIQUE KEY IF NOT EXISTS ux_contact_legacy (legacy_key);

ALTER TABLE core_removal_requests ADD COLUMN IF NOT EXISTS legacy_key VARCHAR(64) NULL AFTER resolution;
ALTER TABLE core_removal_requests ADD UNIQUE KEY IF NOT EXISTS ux_removal_legacy (legacy_key);

-- 홈박스 갤러리 좋아요·열람은 행 자체에 PK(gallery_id,user_id) 가 있어 별도 열 불필요.
-- 파워덱 deck_* 는 옛 id(CHAR 16·BIGINT)를 그대로 쓰므로 별도 열 불필요.
