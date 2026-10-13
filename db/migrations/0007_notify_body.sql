-- 알림 설명 한 줄(홈박스 알림 패널처럼 제목 아래 두 줄까지) — 출처: homebox-handoff notifications.body
ALTER TABLE core_notifications ADD COLUMN IF NOT EXISTS body VARCHAR(500) NULL AFTER title;
