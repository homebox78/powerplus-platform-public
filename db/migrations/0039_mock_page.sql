-- 0039 시안이 어떤 페이지인지(main·greeting·board_list…) — 게시본끼리 링크(main.html → 같은 묶음 메인 주소)에 쓴다.
-- 판정 때 레퍼런스 화면의 page_type 을 기록한다(2026-10-15 시험: 게시본의 greeting.html 이 /api/v1/p/greeting.html 404).
ALTER TABLE mock_mockups ADD COLUMN IF NOT EXISTS page VARCHAR(32) NULL AFTER ref_id;
