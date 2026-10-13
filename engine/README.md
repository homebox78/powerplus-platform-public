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
