-- keep:always
-- 결제(구독·크레딧) — billing.visible 플래그 뒤에서 쓰는 열·표(기획 §12.3·§15).
-- 출처: homebox-handoff api/routes/billing.php (subscriptions·invoices) 를 core_ 표에 맞춰 보강.
-- - core_subscriptions.card_label: 결제 수단 표시용(예: "신한 ****1234"). 카드 번호 원문은 저장하지 않는다(토스가 보관).
-- - core_invoices.order_id·title·credits: 토스 주문번호(중복 승인 차단)·청구서 항목명·크레딧 묶음 수.
-- - core_billing_events: 토스 웹훅 수신 기록(서명 검증 결과·처리 시각). 같은 본문은 한 번만(ux_bev_hash).
-- 운영에서 생기는 데이터라 keep:always(덤프 제외). 전부 IF NOT EXISTS 라 다시 돌려도 안전.

ALTER TABLE core_subscriptions
  ADD COLUMN IF NOT EXISTS card_label VARCHAR(60) NULL AFTER billing_key_enc;

ALTER TABLE core_invoices
  ADD COLUMN IF NOT EXISTS order_id VARCHAR(64) NULL AFTER kind,
  ADD COLUMN IF NOT EXISTS title VARCHAR(120) NULL AFTER order_id,
  ADD COLUMN IF NOT EXISTS credits INT NULL AFTER title,
  ADD UNIQUE KEY IF NOT EXISTS ux_inv_order (order_id);

CREATE TABLE IF NOT EXISTS core_billing_events (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type   VARCHAR(60) NOT NULL,
  payment_key  VARCHAR(200) NULL,
  order_id     VARCHAR(64) NULL,
  status       VARCHAR(40) NULL,
  verified     ENUM('signature','api','none') NOT NULL DEFAULT 'none',
  body_hash    CHAR(64) NOT NULL,
  payload      MEDIUMTEXT NOT NULL,
  processed_at DATETIME(3) NULL,
  note         VARCHAR(200) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_bev_hash (body_hash),
  KEY ix_bev_order (order_id),
  KEY ix_bev_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
