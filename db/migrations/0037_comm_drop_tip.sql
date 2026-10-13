-- 제보·제안 게시판 없앰(2026-10-13 사용자 지시) — 남은 글은 지우지 않고 자유 게시판으로 옮긴다
UPDATE comm_posts SET category = 'free' WHERE category = 'tip';
