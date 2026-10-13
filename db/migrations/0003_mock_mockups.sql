-- keep:always
-- powerMock 시안 보관·판정·갤러리 (설계서 db-design §5 mock_mockups·mock_gallery)
-- 출처: homebox-handoff mockup_pages·gallery_items·gallery_likes·gallery_unlocks 를 콘텐츠 공통 6열(public_id·owner·org·visibility·시각)로 재설계.
-- 운영에서 생기는 표라 keep:always — 덤프 제외(§16.2).

CREATE TABLE IF NOT EXISTS mock_mockups (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id      CHAR(16) NOT NULL,
  owner_user_id  BIGINT UNSIGNED NULL,
  org_id         BIGINT UNSIGNED NULL,
  visibility     ENUM('internal','partner','pro','free','public','private') NOT NULL DEFAULT 'private',
  token          VARCHAR(32) NOT NULL,                 -- 공개 주소 /p/{token}
  base_token     VARCHAR(32) NULL,                     -- 서브가 공통 부분을 빌리는 기준 시안
  api_key_id     BIGINT UNSIGNED NULL,
  title          VARCHAR(120) NOT NULL DEFAULT '',
  ref_id         VARCHAR(255) NULL,
  device         ENUM('pc','mobile') NOT NULL DEFAULT 'pc',
  html           MEDIUMTEXT NOT NULL,
  bytes          INT UNSIGNED NOT NULL DEFAULT 0,
  score          TINYINT UNSIGNED NULL,
  passed         TINYINT(1) NULL,
  check_count    INT UNSIGNED NOT NULL DEFAULT 0,
  check_json     MEDIUMTEXT NULL,
  checked_at     DATETIME(3) NULL,
  has_thumb      TINYINT(1) NOT NULL DEFAULT 0,
  views          INT UNSIGNED NOT NULL DEFAULT 0,
  published_at   DATETIME(3) NULL,
  expires_at     DATETIME(3) NOT NULL,
  discarded_at   DATETIME(3) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at     DATETIME(3) NULL,
  UNIQUE KEY ux_mockup_public (public_id),
  UNIQUE KEY ux_mockup_token (token),
  KEY ix_mockup_owner_created (owner_user_id, created_at),
  KEY ix_mockup_base (owner_user_id, base_token),
  KEY ix_mockup_expires (expires_at),
  CONSTRAINT fk_mockup_owner FOREIGN KEY (owner_user_id) REFERENCES core_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 갤러리 = 판정 81점+ 시안의 공유 상태. 시안 행과 1:1(만료되지 않게 html 사본 보관 — mock_mockups 는 30일 만료)
CREATE TABLE IF NOT EXISTS mock_gallery (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mockup_id      BIGINT UNSIGNED NOT NULL,
  owner_user_id  BIGINT UNSIGNED NULL,
  title          VARCHAR(120) NOT NULL DEFAULT '',
  score          TINYINT UNSIGNED NOT NULL,
  ref_id         VARCHAR(255) NULL,
  device         ENUM('pc','mobile') NOT NULL DEFAULT 'pc',
  html           MEDIUMTEXT NOT NULL,
  check_json     MEDIUMTEXT NULL,
  note           VARCHAR(1000) NULL,
  status         ENUM('study','shared','hidden') NOT NULL DEFAULT 'study',
  likes          INT UNSIGNED NOT NULL DEFAULT 0,
  views          INT UNSIGNED NOT NULL DEFAULT 0,
  unlocks        INT UNSIGNED NOT NULL DEFAULT 0,
  shared_at      DATETIME(3) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_gallery_mockup (mockup_id),
  KEY ix_gallery_list (status, shared_at),
  KEY ix_gallery_owner (owner_user_id, created_at),
  CONSTRAINT fk_gallery_mockup FOREIGN KEY (mockup_id) REFERENCES mock_mockups(id) ON DELETE CASCADE,
  CONSTRAINT fk_gallery_owner FOREIGN KEY (owner_user_id) REFERENCES core_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mock_gallery_likes (
  gallery_id BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (gallery_id, user_id),
  CONSTRAINT fk_glike_gallery FOREIGN KEY (gallery_id) REFERENCES mock_gallery(id) ON DELETE CASCADE,
  CONSTRAINT fk_glike_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mock_gallery_unlocks (
  gallery_id BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (gallery_id, user_id),
  CONSTRAINT fk_gunlock_gallery FOREIGN KEY (gallery_id) REFERENCES mock_gallery(id) ON DELETE CASCADE,
  CONSTRAINT fk_gunlock_user FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 포인트 규칙 보강(§15.4): 공유·열람 로열티
INSERT INTO core_point_rules (reason, delta, daily_cap, yearly_cap, note) VALUES
 ('mockup_share', 50, 3, NULL, '시안 갤러리 공유'),
 ('mockup_royalty', 10, 20, NULL, '내 시안이 열림')
ON DUPLICATE KEY UPDATE delta = VALUES(delta);
