-- keep:always
-- 0043 장표 작업당 비용 한도의 기준선(사용자 2026-10-18 결정 "시안 확정 때 다시 채움 + 대본 제외", 전수조사 C).
-- 예전: 작업 하나에 기획·와이어·자료 요약·시안 그림·판정·장표 제작·대본이 한 한도로 쌓여, 기획·시안에서 $1.8 를 쓰면 장표 단계는 $0.2 로 시작했다.
-- deck_jobs.budget_base_usd: 한도 판정의 기준선. 판정 = spent_usd - budget_base_usd >= budget_usd.
--   ① 시안 확정(Jobs::approveDesign mode=build) 때 budget_base_usd = spent_usd — 장표 제작 단계가 한도만큼 온전히 쓴다.
--   ② 발표 대본·예상 질문(AiKeys::ask kind=script)은 비용만큼 기준선도 같이 올린다 — spent_usd·deck_ai_usage 기록은 그대로, 작업 한도에서만 빠진다(월 상한은 본다).
-- 기존 행은 0(지금까지와 같은 판정). 운영에서 쌓이는 표라 keep:always. IF NOT EXISTS 라 다시 돌려도 안전(MariaDB 10.11).
ALTER TABLE deck_jobs
  ADD COLUMN IF NOT EXISTS budget_base_usd DECIMAL(10,4) NOT NULL DEFAULT 0 AFTER spent_usd;
