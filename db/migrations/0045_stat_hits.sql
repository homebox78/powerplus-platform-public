-- keep:always
-- 0045 방문자 통계(사용자 2026-10-20 "관리자 모드에 방문자 통계 전체·솔루션별·브라우저·디바이스별 등 디테일한 통계 관리 페이지"). 설계 docs/db-design.md §6.2.
-- stat_hits: 한 줄 = 페이지 보기 1번(웹·애드인 화면이 POST /stats/hit 로 알림) 또는 키 호출 1번(MCP — 서버가 직접).
--   · vid 방문자(브라우저 저장 무작위) · sid 방문(30분 쉬면 새로) · ip_hash = sha256(ip+서버 비밀) 앞 16자 — IP·UA 원문은 두지 않는다.
--   · 보관 400일(api/bin/retention.php). 운영에서 쌓이는 표라 keep:always. IF NOT EXISTS 라 다시 돌려도 안전.
CREATE TABLE IF NOT EXISTS stat_hits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  day DATE NOT NULL,
  vid CHAR(16) NOT NULL,
  sid CHAR(16) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  path VARCHAR(255) NOT NULL,
  module VARCHAR(16) NOT NULL,
  channel VARCHAR(8) NOT NULL,
  browser VARCHAR(24) NOT NULL DEFAULT '',
  os VARCHAR(24) NOT NULL DEFAULT '',
  device VARCHAR(8) NOT NULL DEFAULT '',
  w SMALLINT UNSIGNED NULL,
  ref_host VARCHAR(120) NULL,
  lang VARCHAR(12) NULL,
  ip_hash CHAR(16) NOT NULL DEFAULT '',
  KEY ix_day_module (day, module),
  KEY ix_day_channel (day, channel),
  KEY ix_vid_day (vid, day),
  KEY ix_user_day (user_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
