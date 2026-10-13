powerPlus 카드 애니메이션
==========================

index.html      전체 미리보기 (더블클릭해 브라우저로 열기)
main/           메인 카드 4개 (16:9 = 1200x670)
                assets.html · deck.html · mock.html · guide.html
steps/          서비스별 단계 카드 17개 (1:1)
                assets-1~3 · deck-1~6 · mock-1~4 · guide-1~4
src/            다시 만들 때 쓰는 소스

사이트에 넣기
-------------
각 카드의 이미지 자리에 iframe 으로 넣습니다. 파일 하나로 동작하고(외부 파일 없음), 칸 크기에 맞춰 꽉 채웁니다.

  메인 카드
  <iframe src="/anim/main/assets.html" title="powerAssets" loading="lazy"
    style="display:block;width:100%;aspect-ratio:1200/670;border:0"></iframe>

  단계 카드
  <iframe src="/anim/steps/deck-1.html" title="자료를 정리한다" loading="lazy"
    style="display:block;width:100%;aspect-ratio:1/1;border:0"></iframe>

고치기
------
src/main.py (메인) 나 src/steps.py (단계) 를 고친 뒤
  python src/build.py
를 실행하면 main/ 과 steps/ 의 21개가 다시 만들어집니다.
