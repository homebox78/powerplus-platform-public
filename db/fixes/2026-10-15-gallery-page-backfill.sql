-- 2026-10-15 갤러리 '구분: 메인'에 서브가 섞이던 것 — 판정 전(works 가져오기) 시안은 page 가 비어 메인으로 분류됐다. 마크업·제목으로 채운다.
UPDATE mock_mockups m SET m.page = 'content'
 WHERE m.deleted_at IS NULL AND COALESCE(m.page,'')='' AND COALESCE(m.ref_id,'') NOT LIKE 'mix1:%' AND COALESCE(m.base_token,'')=''
 AND ( m.html REGEXP 'class="[^"]*(hb-subvisual|sub-visual|subvisual|sub_visual|hb-lnb|lnb|snb|sub-nav|subnav)[^"]*"'
    OR m.html REGEXP 'aria-label="(경로|현재 위치|breadcrumb)"'
    OR m.html REGEXP 'class="[^"]*(hb-path|breadcrumb|location)[^"]*"'
    OR (COALESCE(m.title,'') REGEXP '인사말|게시판|목록|상세|조직도|오시는|찾아오시는|연혁|FAQ|자주 묻는|공지|사업 개요|주요일정|board_|greeting|content|location|org_chart' AND COALESCE(m.title,'') NOT REGEXP '메인') );
SELECT ROW_COUNT() AS to_sub;
UPDATE mock_mockups m SET m.page = 'main'
 WHERE m.deleted_at IS NULL AND COALESCE(m.page,'')='' AND COALESCE(m.base_token,'')='';
SELECT ROW_COUNT() AS to_main;
UPDATE mock_mockups SET title='청주시청 메인 시안 B' WHERE id=498;
UPDATE mock_gallery SET title='청주시청 메인 시안 B' WHERE mockup_id=498;
UPDATE mock_mockups SET title='우리대학교 메인' WHERE id=502;
UPDATE mock_gallery SET title='우리대학교 메인' WHERE mockup_id=502;
