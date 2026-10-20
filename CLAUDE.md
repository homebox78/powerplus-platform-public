# powerPlus 통합 플랫폼(회사) — 개발 지침

> 운영 = 회사 서버 https://powerplus.solideos.com:46443 (2026-10-20 전환). 배포 대상은 회사 서버 하나.
> 개인 갈래 HOMEBOX 는 D:\homebox-platform(homebox78/homebox-platform, 개인 GCP) — 이 저장소와 섞지 않는다.

> 개인 작업 기록(myDev)은 이 회사 저장소에 두지 않는다(2026-10-20 서브모듈 제거) — 개인 갈래에만.

- 기획 사본: `docs/PLAN.md`.
- 결정 표기 규칙·스택·디자인 규칙은 `D:\homebox-handoff\CLAUDE.md` 를 따른다(홈박스가 디자인 베이스). 다른 점만 여기에 적는다.
- 기존 네 저장소는 읽기만. 가져온 코드는 출처를 파일 머리 주석에 남긴다.
- DB 는 `docs/db-design.md` 를 먼저 쓰고 검토받은 뒤 `db/schema.sql` 로. 옛 DB 는 `db/migrate-legacy/` 의 원천일 뿐.
- 개인 정보(개인 계정·개인 도메인)는 문서·코드에 적지 않는다.

## 재발 방지 규칙 (자세한 표: `docs/오류-재발방지-체크리스트.md`)
- 배포 스크립트 세 개(`deploy.sh`·`deploy-mockref.sh`·`deploy-engine.sh`)는 첫 줄에서 `scripts/preflight.sh` 를 돌린다. 실패하면 고치고 다시 — 검사를 끄지 않는다.
- PHP 클로저는 바깥 변수를 반드시 `use` 로 받는다(R01). PHP 는 Edit 도구로만 고친다 — sed·heredoc·node 문자열은 역슬래시를 먹는다(R02).
- 공유 작업 트리에서 `git stash`·`git checkout -- .`·`git add -A`·`-a` 금지. 커밋은 내가 고친 파일 이름만(R15).
- 다른 세션이 고치는 중인 파일이 배포 범위에 있으면 배포하지 않고 알린다(R04). `PP_ALLOW_DIRTY=1` 은 사용자 지시가 있을 때만.
- mockref·엔진·powerMCP 를 고치면 각자 배포 스크립트를 따로 돌린다(R05).
- 모르는 값을 기본값으로 가정해 고치지 않는다(R07). 외부·생성 JSON 은 빈 값부터 처리한다(R09).
- 측정·판정은 일부러 걸려야 하는 입력으로 음성 대조를 먼저 본다(R14·R16). 0 은 "통과"가 아니라 "측정기가 동작했나"부터.
- 고정 폭 표는 칸 폭 = 내용 + 30px, 모바일 합 358px 이하를 먼저 계산한다(R08).
- 정적 파일 내용을 바꾸면 파일 이름(버전)도 바꾼다(R17). 엔진이 읽는 파일은 저장소에 두고 배포가 올린다(R12).
- powerMCP(packages/mcp·mockref·MCP 가 부르는 api)를 고치거나 시험하기 전에 `docs/MCP-개선-체크리스트.md` §2·§3 을 훑는다. 새 결함은 거기에 MC 번호를 더한다.
- 새 사고가 나면 체크리스트 표에 R 번호를 하나 더하고, 가능하면 `preflight.sh` 에 자동 검사를 더한다.
