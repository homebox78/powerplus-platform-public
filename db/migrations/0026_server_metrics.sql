-- keep:always
-- 0026 서버 자원 표본 — api/bin/sample-metrics.php 가 크론(5분)으로 한 줄씩 남긴다. 관리자 대시보드 '서버 자원' 추이.
-- 서버 전체 수치(같은 서버의 다른 사이트 포함). 30일 지난 행은 표본기가 지운다.
-- 폴더별 크기(folders)는 비싸서 1시간에 한 번만 채운다(그 외 행은 NULL).
CREATE TABLE IF NOT EXISTS core_server_metrics (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sampled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  cpu_pct DECIMAL(5,1) NULL,
  load1 DECIMAL(6,2) NULL,
  mem_used_mb INT UNSIGNED NULL,
  mem_total_mb INT UNSIGNED NULL,
  swap_used_mb INT UNSIGNED NULL,
  swap_total_mb INT UNSIGNED NULL,
  disk_used_gb DECIMAL(8,2) NULL,
  disk_total_gb DECIMAL(8,2) NULL,
  data_used_gb DECIMAL(8,2) NULL,          -- 플랫폼 저장 폴더 합계(folders 를 잰 행만)
  db_mb DECIMAL(10,1) NULL,
  folders JSON NULL,                        -- [{name, mb}] 저장 폴더 바로 아래
  KEY idx_sampled (sampled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
