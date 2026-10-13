-- keep:always
-- 0027 정책 문서 버전 — 이용약관·개인정보처리방침·저작권·이메일 무단수집 거부·수집 로봇 안내를 고칠 때마다 판을 하나씩 쌓는다.
-- 사용자 지시(2026-10-07): "약관·개인정보 등 문서는 수정 시 버전별로 관리, 셀렉터로 골라 볼 수 있어야".
-- 첫 판(1.0, 2026-10-06)은 화면 코드(lib/docs-content.ts)에 있는 원문이다 — DB 에 1.0 이 없으면 화면이 그것을 1.0 으로 함께 보여 준다.
-- spec = {title, lead, draft, blocks:[{id,title,paras?,items?,table?}]} — 화면 DocSpec 과 같은 모양(updated 는 effective_on 으로 대신).
-- 시행일이 오늘 이후인 판은 "시행 예정"으로 보이고, 현재 판은 시행일이 지난 것 중 가장 최근 것.
CREATE TABLE IF NOT EXISTS core_policy_versions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  public_id CHAR(16) NOT NULL,
  doc ENUM('terms','privacy','copyright','email','bot') NOT NULL,
  version VARCHAR(20) NOT NULL,
  effective_on DATE NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  spec JSON NOT NULL,
  published TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_policy_pid (public_id),
  KEY ix_policy_doc (doc, published, effective_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
