-- 가입 동의 기록(기획 §17.1·§17.3 "사내 출시 전"): 만 14세 이상 확인 + 동의 4분리
-- (이용약관·개인정보 수집·이용·국외 이전(OpenRouter AI 처리)은 필수, 마케팅 수신은 선택·기본 해제).
-- 한 행 = 한 사용자가 한 문서 판(version)에 한 동의. 약관 판을 올리면(Consents::VERSION) 다음 로그인 때 다시 묻는다.
-- 마케팅은 동의·거부 둘 다 남긴다(agreed 0/1). 현재 값은 core_users.marketing_opt_in 이 정본.
CREATE TABLE IF NOT EXISTS core_consents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('age14','terms','privacy','overseas','marketing') NOT NULL,
  version VARCHAR(20) NOT NULL,
  agreed TINYINT(1) NOT NULL DEFAULT 1,
  agreed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip VARCHAR(45) NULL,
  UNIQUE KEY ux_consent (user_id, kind, version),
  KEY ix_consent_user (user_id),
  CONSTRAINT fk_consent_user FOREIGN KEY (user_id) REFERENCES core_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
