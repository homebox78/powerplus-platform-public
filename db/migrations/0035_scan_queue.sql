-- keep:always
-- 0035 업로드 바이러스 검사 대기열(SEC-011) — 사용자가 올린 파일(장표 원본·맥락 자료·로고·프로필 사진·관리자 에셋)을
-- api/bin/scan-queue.php 크론이 clamscan 으로 배치 검사한다(clamd 상주 금지 — 서버 RAM 4GB).
-- 운영에서 쌓이는 표라 배포 덤프에서 제외(keep:always).
CREATE TABLE IF NOT EXISTS core_scan_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  path VARCHAR(1024) NOT NULL,
  kind ENUM('deck_source','deck_doc','brand','avatar','asset') NOT NULL,
  ref_id VARCHAR(64) NULL,
  user_id BIGINT UNSIGNED NULL,
  status ENUM('pending','clean','infected','error','missing') NOT NULL DEFAULT 'pending',
  result VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  scanned_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_status (status, created_at),
  KEY idx_ref (kind, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
