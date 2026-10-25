-- 0047 MCP·API 하루 호출 한도 10배(사용자 2026-10-25 "mcp 호출한도를 10배로 늘려줘").
-- 운영 값(free 100·pro 1000·team 5000·staff 5000)을 확인하고 정한 값으로 둔다 — 곱하지 않고 값을 적어 다시 돌려도 같다.
UPDATE core_plans SET limits = JSON_SET(limits, '$.api_daily', 1000)  WHERE code = 'free';
UPDATE core_plans SET limits = JSON_SET(limits, '$.api_daily', 10000) WHERE code = 'pro';
UPDATE core_plans SET limits = JSON_SET(limits, '$.api_daily', 50000) WHERE code IN ('team', 'staff');
