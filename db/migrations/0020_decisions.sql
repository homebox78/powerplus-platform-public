-- keep:always
-- 0020 빠른 판단 기록 — OpenRouter 의 판단 전용 모델(TypeSafe Jev)에 물은 질문과 답을 남긴다.
-- 같은 질문(task + 입력 해시)은 다시 묻지 않고 이 표의 답을 쓴다. 관리자가 판단 결과를 되짚어 볼 때도 이 표를 본다.
-- 비용은 장표 변환과 같은 과금 기록(deck_ai_usage, kind='jev')에도 남겨 관리자 '이력·과금' 화면 하나로 본다.
-- 운영에서 쌓이는 데이터라 매번 IF NOT EXISTS 로 보장한다(기존 행은 덮지 않는다).
CREATE TABLE IF NOT EXISTS core_decisions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  task VARCHAR(40) NOT NULL,                 -- 어느 판단인가(contact_kind·search_intent·mcp_scope …)
  input_hash CHAR(40) NOT NULL,              -- sha1(task + 정규화한 입력) — 같은 질문은 다시 묻지 않는다
  ref VARCHAR(64) NULL,                      -- 판단 대상(문의 public_id 등)
  state_text TEXT NOT NULL,                  -- 넘긴 입력(개인 정보는 넣지 않는다)
  answer JSON NOT NULL,                      -- 모델 답 그대로(choice·probabilities·confidence)
  model VARCHAR(64) NOT NULL,
  cost_usd DECIMAL(10,8) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_task_hash (task, input_hash),
  KEY idx_task_time (task, created_at),
  KEY idx_ref (ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 판단 결과를 대상 행에도 붙여 목록에서 바로 거른다(문의 = 실제 주제·모듈·급함·스팸, 커뮤니티 글 = 광고·비방·분류 제안).
ALTER TABLE core_contacts ADD COLUMN IF NOT EXISTS ai JSON NULL;
ALTER TABLE comm_posts ADD COLUMN IF NOT EXISTS ai JSON NULL;
