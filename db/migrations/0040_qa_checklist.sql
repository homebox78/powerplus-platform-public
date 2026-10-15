-- 0040 솔루션별 개선 체크리스트 — powerAssets·powerGuide·powerMCP (사용자 2026-10-15 "각 솔루션마다 개선 체크리스트가 존재해야 함").
-- deck_checklist·mock_checklist·site_checklist 와 같은 모양에 module 열만 더했다. 통합 검수 화면(/admin/qa)이 여섯 표를 한 형식으로 모은다.
-- site_checklist 에 사이트 품질 항목으로 쌓여 있던 area ast·gde·mcp 줄은 각 솔루션 체크리스트로 옮긴다(같은 결함이 두 곳에 세어지지 않게).
CREATE TABLE IF NOT EXISTS qa_checklist (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  module VARCHAR(16) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  area VARCHAR(24) NOT NULL DEFAULT 'misc',
  title VARCHAR(200) NOT NULL,
  detail TEXT NULL,
  origin ENUM('audit','test','user','feed','doc','manual') NOT NULL DEFAULT 'manual',
  status ENUM('open','fixing','fixed','watch','wontfix') NOT NULL DEFAULT 'open',
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  regressed TINYINT(1) NOT NULL DEFAULT 0,
  evidence JSON NULL,
  fix_note VARCHAR(1000) NULL,
  fix_commit VARCHAR(40) NULL,
  first_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  fixed_at DATETIME(3) NULL,
  UNIQUE KEY uq_qa_checklist_slug (module, slug),
  KEY idx_qa_checklist_status (module, status, hits),
  KEY idx_qa_checklist_area (module, area, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO qa_checklist (module, slug, area, title, detail, origin, status, hits, regressed, evidence, fix_note, fix_commit, first_seen, last_seen, fixed_at)
SELECT CASE area WHEN 'ast' THEN 'assets' WHEN 'gde' THEN 'guide' ELSE 'mcp' END, slug, 'site', title, detail,
       IF(origin = 'audit', 'audit', IF(origin = 'test', 'test', IF(origin = 'user', 'user', 'manual'))),
       status, hits, regressed, evidence, fix_note, fix_commit, first_seen, last_seen, fixed_at
FROM site_checklist WHERE area IN ('ast', 'gde', 'mcp');

DELETE s FROM site_checklist s
JOIN qa_checklist q ON q.slug = s.slug AND q.module = CASE s.area WHEN 'ast' THEN 'assets' WHEN 'gde' THEN 'guide' ELSE 'mcp' END
WHERE s.area IN ('ast', 'gde', 'mcp');
