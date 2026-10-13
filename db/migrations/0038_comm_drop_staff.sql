-- 사내 게시판 없앰(2026-10-13 사용자 지시 — 자유게시판을 사내 게시판으로 씀). 남은 글은 자유로 옮기되 공개 범위(internal)는 그대로 두어 임직원만 본다
UPDATE comm_posts SET category = 'free' WHERE category = 'staff';
