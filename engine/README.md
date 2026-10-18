# powerDeck 엔진 (Python)

출처: 옛 powerDeck 저장소 `worker/` (2026-10-05 판) — 리눅스 서버(구글 클라우드 gcp-server)에서 돌던 코드를 2026-10-07 이 폴더로 옮겼다.
이제 이 폴더가 원본이다. 서버(`~/powerDeck/worker`)에는 `scripts/deploy-engine.sh` 로만 올린다.

- 서버 서비스: `powerdeck-worker`(systemd), 가상환경 `~/powerDeck/worker/.venv`, 글꼴 `fonts/`(서버에만)
- 설정: `config.json`(서버에만, git 제외) — 예시는 `config.example.json`
  - `api_parallel`(선택): OpenRouter 로 돌 때 기획·와이어 동시 호출 수. 없으면 기획 6 · 와이어 8
- 서버와 주고받는 주소: `https://powerplus.hom2box.com/api/v1/deck` (`/worker/*`)

## 2026-10-07 속도 점검으로 바꾼 것
- 상세 기획·와이어프레임 동시 호출을 OpenRouter 일 때 넓힘(3→6, 4→8) — 구독(CLI) 시절 한도가 남아 있었다
- 얇은 장 다시 쓰기(선택 단계)는 170초에 끊는다(전에는 300초 기다리다 실패)
- 기획 호출이 시간 초과(502·timed out)면 한 번 더 요청
- AI 가 쓴 잘못된 역슬래시(`\uZZ12` 등)를 고쳐 읽는다 — 와이어 한 묶음이 이것 하나로 버려졌다

## 서체 (언어별 서체 — 2026-10-18, R82)
- **목록** `fonts/fonts.json`(저장소 · 웹 `apps/web/.../data/fonts.json` 과 같은 파일): 제목 7종·본문 6종, `lang_default`(언어마다 기본 제목·본문), `avoid`(지원율은 넘어도 쓰지 않는 언어), `samples`(언어별 견본 문장).
- **지원율 표** `fonts/font_cover.json` = `python fontcover.py` 가 서체 파일 cmap 으로 잰 값(손으로 고치지 않는다). 언어 지원율 = 글자 묶음(한글 2,350·가나·JIS 1수준 한자·GB2312 1급·베트남어 성조 146·악센트·기본 라틴)별 % 중 최솟값. 95% 미만이면 그 언어에 못 쓴다.
- **판단 함수 하나** `fontset.for_lang(제목, 본문, 언어, 글)` — 고른 서체가 지원율 95% 이상이고 기획 글의 그 언어 글자를 다 가지면 그대로, 아니면 그 언어 기본 서체 → 목록 순. 바꾼 내용은 진행 기록과 확인 목록에 남는다.
  기획·시안 그림 글자(design.apply_lang_fonts) · 장표 제작 지시·마무리·틀·앞장(worker.font_env → 환경변수 `PD_FONT_TITLE·PD_FONT_BODY·PD_LANG`) · 세로 제안서(vertical) · 회사소개서(company.lang_faces)가 모두 이것을 쓴다.
- **pptx**: 마무리(finalize)가 글 런마다 `a:latin·a:ea·a:cs` 를 고른 서체로, 한국어가 아니면 `lang`(ja-JP·zh-CN·vi-VN …). 일본어 장표에 남은 G마켓 산스 같은 제목 서체도 언어 제목 서체로 바꾼다.
- **섞인 언어·동봉** `fontbundle.py`: 글 런에 서체에 없는 글자가 있으면 그 글자를 다 가진 같은 굵기 서체로 그 런만 바꾸고(한국어 장표 속 일본어 문장 → Noto Sans JP), 결과 pptx 에 실제로 적힌 서체 파일 + `서체_라이선스.txt` + `서체_설치안내.txt` + OFL 문서를 `_fonts` 에 모은다 → 산출물 extra → zip '5_서체' · `GET /deck/jobs/{id}/fonts.zip`.
- **서체 파일**은 저장소에 두지 않는다(.gitignore, Noto Sans JP 4개 22MB·SC 4개 42MB). 배포(deploy-engine.sh)가 서버에 없는 파일만 올리고, 워커가 시작할 때 fonts_install 이 `~/.local/share/fonts/powerdeck` 에 깐다. 대신 그리기 순서는 `scripts/fontconfig/65-powerdeck-lang.conf`(ja → Noto Sans JP·CJK JP, zh-cn → SC).
- 새 서체를 넣으면: 파일을 `fonts/` 에 → fonts.json 한 줄 → `python fontcover.py`(표 두 벌) → `python ../scripts/font-previews.py`(견본) → Windows PC 에서 `python ppt_metrics.py "<서체 이름>"`(글줄 수치) → `python -X utf8 tests/test_fontlang.py`.
