-- 0048 첫 화면 정보 입력(팀장 2026-10-28 "회원가입 시 이름을 필수로 — 이메일만 있어 누군지 구분이 안 된다.
--      약관 동의 창 대신 그 자리에서 이름·닉네임 등 간단한 정보를 입력하고 바로 사용").
-- - nickname: 닉네임(선택). 화면에 이름 대신 쓸 짧은 이름. NULL = 없음.
-- - dept: 소속·부서(선택). NULL = 없음.
-- - profile_at: 첫 화면 창에서 정보를 저장한 때. NULL 이고 이름이 비었거나 임시 이름('사용자'·이메일 앞부분)이면
--   로그인 직후 '처음 오셨네요' 창이 뜬다(Profile::status). 한 번 저장하면 이름이 이메일 앞부분과 같아도 다시 묻지 않는다.
-- 전부 IF NOT EXISTS 라 다시 돌려도 안전(MariaDB 10.11). 기존 행은 건드리지 않는다(채우는 값 없음).
ALTER TABLE core_users
  ADD COLUMN IF NOT EXISTS nickname VARCHAR(40) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS dept VARCHAR(60) NULL AFTER nickname,
  ADD COLUMN IF NOT EXISTS profile_at DATETIME(3) NULL AFTER name_changed_at;
