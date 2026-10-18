-- keep:always
-- 0044 완성 산출물 다운로드 링크(사용자 2026-10-18 "내보내기 완료된 산출물 장표나 전체 파일을 url 로 보낼 수도 있게, 대신 경로 노출은 안 되게").
-- deck_share_links: 작업 주인(또는 관리자)이 결과 화면에서 만든 받기 링크. 주소 = /api/v1/d/{토큰} — 로그인 없이 받는다(Router OPEN_PATHS '/d/').
--   · 토큰은 32바이트 무작위(base64url 43자). 원문은 만들 때 한 번만 돌려주고 DB 에는 sha256(token_hash)만 둔다.
--   · kind: result(결과 장표 pptx) · export(전체 묶음 zip, 서체 포함) · fonts(서체 묶음 zip). 받을 때마다 그 시점 최신 결과로 만든다.
--   · expires_at(1·7·30일, 기본 7일) · revoked_at(주인이 끊음) · downloads·last_download_at(받은 횟수·때).
--   · token_tail: 토큰 끝 4자 — 목록에서 어느 링크인지 알아보는 용도(원문 복원 불가).
--   · 작업을 지우면 Jobs::delete 가 같이 지운다(옛 deck_ 표처럼 FK 없음). 행이 남아도 받기는 작업이 없으면 404.
-- 운영에서 쌓이는 표라 keep:always. IF NOT EXISTS 라 다시 돌려도 안전(MariaDB 10.11).
CREATE TABLE IF NOT EXISTS deck_share_links (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  token_tail CHAR(4) NOT NULL,
  job_id CHAR(16) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  downloads INT UNSIGNED NOT NULL DEFAULT 0,
  last_download_at DATETIME NULL,
  UNIQUE KEY ux_token (token_hash),
  KEY ix_job_created (job_id, created_at),
  KEY ix_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
