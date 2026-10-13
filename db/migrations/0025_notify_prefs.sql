-- 알림 받는 방법(사용자 2026-10-07) — 사이트 알림(우측 상단 종)은 항상, 메일은 종류별로 끄고 켠다.
-- NULL = 기본값(Notify::DEFAULTS). {"work":1,"request":1,"comment":0,"notice":0}
ALTER TABLE core_users ADD COLUMN IF NOT EXISTS notify_mail JSON NULL;
