-- 화면 용어 '자산' → '에셋'(2026-10-07 사용자 지시). DB 에 들어 있는 안내 글도 같이 바꾼다. 다시 돌려도 결과가 같다.
UPDATE core_help_docs SET title = REPLACE(title, '자산', '에셋'), body = REPLACE(body, '자산', '에셋') WHERE title LIKE '%자산%' OR body LIKE '%자산%';
UPDATE core_point_rules SET note = REPLACE(note, '자산', '에셋') WHERE note LIKE '%자산%';
