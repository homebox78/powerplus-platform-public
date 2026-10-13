-- 0032 회사 메일(solideos.com)로 검증된 로그인이 있는 계정은 모두 임직원(staff)으로.
-- 사용자 지시(2026-10-10): "*@solideos.com 으로 로그인한 모든 계정은 임직원 그룹으로".
-- 앞으로는 Users::promoteStaff 가 매 로그인마다 같은 판정을 한다. 여기서는 이미 외부로 들어와 있던 계정만 고친다.
-- 검증 안 된 로그인(네이버 연락처 메일 등)만 있는 계정은 올리지 않는다(G29).
UPDATE core_users u
SET u.kind = 'staff'
WHERE u.kind <> 'staff'
  AND u.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM core_user_logins l
    WHERE l.user_id = u.id AND l.email_verified = 1
      AND LOWER(SUBSTRING_INDEX(l.email, '@', -1)) = 'solideos.com'
  );
