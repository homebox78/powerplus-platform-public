-- 도움말 '애드인 설치하기' — 설치 파일을 GitHub 대신 이 플랫폼(/addin/powerAssets_Setup.exe)에서 받는다.
-- 관리자가 고친 본문은 덮지 않는다(0021 이 넣은 문구일 때만).
UPDATE core_help_docs
SET body = REPLACE(REPLACE(body,
  '설치 파일은 GitHub(github.com/homebox78/powerPlus)에서 받아 실행합니다.', '설치 파일(powerAssets_Setup.exe)을 받아 실행합니다.'),
  '1. 아래 ‘GitHub 에서 받기’ 버튼으로 설치 파일을 받습니다.', '1. 아래 ‘설치 파일 받기’ 버튼으로 설치 파일을 받습니다.')
WHERE category = 'assets' AND slug = 'install' AND body LIKE '설치 파일은 GitHub(%';
