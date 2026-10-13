-- 도움말 '애드인 설치하기' — 시작하기 다운로드 상자가 가려져 있어(features.assets_setup_visible) 받을 곳이 안 보였다. 설치 파일은 GitHub 에서 받는다고 적는다.
-- 관리자가 고친 본문은 덮지 않는다(원래 문구일 때만).
UPDATE core_help_docs
SET body = REPLACE(REPLACE(body,
  'powerAssets 시작하기 화면에서 설치 파일을 받아 실행합니다.', '설치 파일은 GitHub(github.com/homebox78/powerPlus)에서 받아 실행합니다.'),
  '1. powerAssets › 시작하기에서 설치 파일을 받습니다.', '1. 아래 ‘GitHub 에서 받기’ 버튼으로 설치 파일을 받습니다.')
WHERE category = 'assets' AND slug = 'install' AND body LIKE 'powerAssets 시작하기 화면에서 설치 파일을 받아 실행합니다.%';
