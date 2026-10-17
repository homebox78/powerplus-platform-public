-- keep:always
-- 0042 운영 보강(2026-10-17 백엔드·보안·운영 점검).
-- ① core_rate_limits: 로그인 없이 부르는 경로(OTP 요청·문의·삭제요청·테스트 로그인 실패)의 IP·전역 횟수 제한.
--    고정 창(시간·하루) 단위로 센다. bucket 에는 IP 원문 대신 해시를 넣는다. 이틀 지난 행은 retention.php 가 지운다.
-- ② deck_jobs.attempts: 엔진이 작업을 잡을 때마다 +1. 연결이 끊겨 되돌릴 때 3번째면 대기열로 돌리지 않고 실패로 끝낸다
--    (엔진을 죽이는 작업이 무한히 다시 잡히던 것). 판정은 Deck\Jobs::reap — 엔진 요청과 api/bin/deck-reaper.php 크론이 같이 부른다.
-- ③ deck_ai_usage 인덱스: 관리자 이력·과금 화면이 기간·종류로 거르는데 email 로 시작하는 인덱스뿐이라 표 전체를 읽었다.
-- 운영에서 쌓이는 표라 keep:always. 전부 IF NOT EXISTS 라 다시 돌려도 안전(MariaDB 10.11).
CREATE TABLE IF NOT EXISTS core_rate_limits (
  bucket VARCHAR(120) NOT NULL,
  win_start DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, win_start),
  KEY idx_win (win_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE deck_jobs
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0 AFTER progress;

ALTER TABLE deck_ai_usage
  ADD INDEX IF NOT EXISTS idx_created (created_at),
  ADD INDEX IF NOT EXISTS idx_kind (kind, created_at);
