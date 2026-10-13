-- keep:always
-- 관리자 문의 답변(2026-10-06): 답변 메모와 메일 발송 여부. 운영에서 쌓이는 데이터라 덤프 교체 대상이 아니다.
ALTER TABLE core_contacts
  ADD COLUMN IF NOT EXISTS reply TEXT NULL AFTER message,
  ADD COLUMN IF NOT EXISTS reply_sent_at DATETIME(3) NULL AFTER reply;
