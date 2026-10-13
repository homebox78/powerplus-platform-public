-- keep:always
-- 0028 분석 보고서 — powerMCP 로 받은 답(자산 추천·레퍼런스 정리 등)을 사이트 디자인의 보고서 한 장으로 남긴다.
-- 사용자 지시(2026-10-08): "MCP 결과를 하나하나 보여 주는 것도 좋지만 UI/UX 가 갖춰진 분석 종합 페이지 — 썸네일과 함께 보고서처럼".
-- 링크(/r/{public_id})를 아는 사람은 로그인 없이 본다(noindex). 자산 그림은 비회원도 볼 수 있는 등급만 — 나머지는 잠금 칸으로 그린다(서버가 저장 때 정함).
-- payload = {question, summary, blocks:[{type:assets|text|table|list, heading, …}]} — 화면 ReportPayload 와 같은 모양.
CREATE TABLE IF NOT EXISTS core_reports (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  public_id CHAR(16) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  api_key_id BIGINT UNSIGNED NULL,
  module VARCHAR(20) NOT NULL DEFAULT 'assets',
  title VARCHAR(200) NOT NULL,
  payload JSON NOT NULL,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_report_pid (public_id),
  KEY ix_report_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
