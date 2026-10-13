-- powerAssets 시작하기 화면의 "자주 묻는 질문" 4건을 도움말 문서(assets 카테고리)로 옮긴다(사용자 2026-10-07).
-- 멱등: 같은 카테고리·slug 문서가 있으면 건너뛴다(INSERT … SELECT … WHERE NOT EXISTS). 관리자가 고친 본문은 덮지 않는다.
INSERT INTO core_help_docs (public_id, category, slug, title, body, sort_order, published)
SELECT 'a3f1c7e2b9d40561', 'assets', 'faq-pane-empty', '작업창이 비어 있거나 열리지 않습니다.', 'PowerPoint 2016 이하는 지원하지 않습니다.\n\n파일 › 계정 › PowerPoint 정보에서 버전을 확인하세요.', 5, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM core_help_docs WHERE category = 'assets' AND slug = 'faq-pane-empty');

INSERT INTO core_help_docs (public_id, category, slug, title, body, sort_order, published)
SELECT 'b84e02d6c1f9a372', 'assets', 'faq-old-icon', '아이콘이 예전 그림으로 보입니다.', 'PowerPoint 를 껐다 켜면 갱신됩니다.', 6, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM core_help_docs WHERE category = 'assets' AND slug = 'faq-old-icon');

INSERT INTO core_help_docs (public_id, category, slug, title, body, sort_order, published)
SELECT 'c5d9a1f30e7b6284', 'assets', 'faq-insert-error', '이미지가 ‘내부 오류’로 안 들어갑니다.', '슬라이드를 한 번 클릭해 커서를 둔 뒤 다시 누르세요.', 7, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM core_help_docs WHERE category = 'assets' AND slug = 'faq-insert-error');

INSERT INTO core_help_docs (public_id, category, slug, title, body, sort_order, published)
SELECT 'd2e6b8a4f7c13095', 'assets', 'faq-uninstall', '제거하려면.', 'Windows ‘앱 및 기능’에서 제거하거나 설치 마법사를 다시 실행합니다.', 8, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM core_help_docs WHERE category = 'assets' AND slug = 'faq-uninstall');
