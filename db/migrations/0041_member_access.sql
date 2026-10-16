-- 0041 회원 전용 서비스 + 임직원 이용 기간 + 휴면 계정(사용자 2026-10-16 지시).
-- "로그인해서 pro·team 이 아니면 서비스를 이용 못 하게. solideos.com 메일로 인증한 사람은 임직원, 권한은 pro 와 같음.
--  사용 기간은 가입일로부터 1년. 마지막 로그인이 3개월 넘으면 휴면 계정, 관리자 승인 후 다시 사용."
-- - status 에 dormant(휴면) 추가. 판정은 Users::markDormantIfIdle(로그인·세션·키 요청마다) + api/bin/retention.php(매일).
-- - dormant_at: 휴면으로 바뀐 때 / dormant_requested_at: 휴면 계정이 로그인을 시도해 승인 요청이 들어간 때(관리자 화면 대기열).
-- - access_until: 임직원 이용 기간 끝. 가입일 + 1년으로 채우고, 관리자가 연장한다. NULL = 기간 없음(외부 회원은 구독 기간을 따른다).
-- 전부 IF NOT EXISTS 라 다시 돌려도 안전(MariaDB 10.11).
ALTER TABLE core_users
  MODIFY COLUMN status ENUM('active','blocked','dormant') NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS dormant_at DATETIME(3) NULL AFTER blocked_reason,
  ADD COLUMN IF NOT EXISTS dormant_requested_at DATETIME(3) NULL AFTER dormant_at,
  ADD COLUMN IF NOT EXISTS access_until DATETIME(3) NULL AFTER dormant_requested_at;

UPDATE core_users
SET access_until = DATE_ADD(created_at, INTERVAL 1 YEAR)
WHERE kind = 'staff' AND access_until IS NULL AND deleted_at IS NULL;
