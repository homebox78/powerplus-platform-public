-- 커뮤니티 (사용자 지시 2026-10-06 "기존 홈박스 커뮤니티를 살려 상위 메뉴로 — 공지사항부터 게시판 및 커뮤니티 용도").
-- 출처: homebox-handoff db/migrations/0024_community_notifications.sql → 설계서 §6 comm_ (콘텐츠 공통 6열 + public_id).
-- 운영에서 사용자가 만드는 데이터라 덤프 교체 대상이 아니다(설계서: 새 플랫폼은 --db 폐지, 마이그레이션만).
CREATE TABLE IF NOT EXISTS comm_posts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(16) NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  org_id BIGINT UNSIGNED NULL,
  visibility ENUM('internal','partner','pro','free','public','private') NOT NULL DEFAULT 'public',
  category VARCHAR(20) NOT NULL,                 -- notice(관리자만)·qna·showcase·tip·free·staff(사내 — visibility internal)
  title VARCHAR(200) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  module VARCHAR(10) NULL,                       -- 관련 모듈(assets·deck·mock·guide) 선택
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  comment_count INT UNSIGNED NOT NULL DEFAULT 0,
  like_count INT UNSIGNED NOT NULL DEFAULT 0,
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  legacy_key VARCHAR(64) NULL,                   -- 홈박스 community_posts.id 이관 키
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY ux_cp_public (public_id),
  UNIQUE KEY ux_cp_legacy (legacy_key),
  KEY ix_cp_cat (category, deleted_at, pinned, id),
  KEY ix_cp_owner (owner_user_id),
  CONSTRAINT fk_cp_owner FOREIGN KEY (owner_user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comm_comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY ix_cc_post (post_id, deleted_at, id),
  KEY ix_cc_user (user_id),
  CONSTRAINT fk_cc_post FOREIGN KEY (post_id) REFERENCES comm_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comm_likes (
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_cl_post FOREIGN KEY (post_id) REFERENCES comm_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cl_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
