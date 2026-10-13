-- keep:always
-- 저장(북마크)·컬렉션 — 플랫폼 모듈 교차(자산·시안 갤러리·커뮤니티 글).
-- 출처: homebox-handoff api/routes/collections.php 의 collections·collection_items 를 콘텐츠 공통 열(public_id·owner·org·visibility)로 재설계.
-- 대상은 숫자 PK 가 아니라 각 모듈의 외부 식별자(item_public_id)로 저장한다 — 갤러리는 public_id 가 없어 mock_gallery.id 문자열.
-- 운영에서 사용자가 만드는 데이터라 keep:always (덤프 제외).

CREATE TABLE IF NOT EXISTS core_collections (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id      CHAR(16) NOT NULL,
  owner_user_id  BIGINT UNSIGNED NOT NULL,
  org_id         BIGINT UNSIGNED NULL,
  visibility     ENUM('internal','partner','pro','free','public','private') NOT NULL DEFAULT 'private',
  name           VARCHAR(80) NOT NULL,
  memo           VARCHAR(2000) NULL,
  is_default     TINYINT(1) NOT NULL DEFAULT 0,
  share_token    VARCHAR(32) NULL,
  shared_at      DATETIME(3) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_coll_public (public_id),
  UNIQUE KEY ux_coll_share (share_token),
  KEY ix_coll_owner (owner_user_id, is_default, id),
  CONSTRAINT fk_coll_owner FOREIGN KEY (owner_user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS core_collection_items (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  collection_id   BIGINT UNSIGNED NOT NULL,
  item_type       ENUM('asset','gallery','post') NOT NULL,
  item_public_id  VARCHAR(32) NOT NULL,
  note            VARCHAR(300) NULL,
  sort            INT UNSIGNED NOT NULL DEFAULT 0,
  added_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_citem (collection_id, item_type, item_public_id),
  KEY ix_citem_item (item_type, item_public_id),
  CONSTRAINT fk_citem_coll FOREIGN KEY (collection_id) REFERENCES core_collections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
