# powerMCP 개선 체크리스트 (통합본)

> MCP 를 고치거나 시험하기 전에 이 파일부터 훑는다.
> 흩어진 MCP 문서·시험 보고서·재발 방지 표·프로젝트 기록을 한 곳에 모았다. 중복은 하나로 합쳤다(2026-10-15).
> 원자료는 지우지 않았다. 날짜별 증거는 §7 출처를 본다.

- **1부(§1~§3)** = 고칠 때마다 쓰는 체크리스트.
- **2부(§4~§6)** = 영역별 이력과 남은 일.
- 새 결함을 잡으면 §2 표에 `MC-` 번호를 하나 더한다(지우지 않는다). 남은 일 §5 는 고치면 줄을 긋고 커밋을 적는다.
- 관리자 개선 체크리스트(mock/deck/site_checklist)와 함께 쓴다. DB 적재는 slug 로(§1 ⑤).

---

## 1. 한 바퀴 절차 (시험 → 보고 → 수정 → 재발 방지 → 재시험)

| 단계 | 할 일 | 도구·명령 |
|:---:|---|---|
| ① 준비 | staff 시험 키를 만든다. deploy 키는 하루 100건이라 여러 에이전트 시험에 못 쓴다. 띄우기 전에 `에이전트 수 × 장 수 × 판정 횟수`를 한도와 맞춰 본다 | 서버 `sudo php8.4 api/bin/mcp-test-key.php issue <파일>` (하루 5000). 키 파일 길이 48자 확인 |
| ② 시험 | 도구·카테고리·요청을 매번 다르게 고른다. 음성 대조(빈 입력·치명 입력·과다 입력)도 넣는다. 안내 페이지 예시 문구는 **그대로** 친다 | 로컬 powerMCP 또는 claude.ai 커넥터(운영 키). 로컬 재료(캡처)가 운영과 같은지 먼저 본다 |
| ③ 보고 | 결과를 `docs/MCP-<주제>-<날짜>.md` 로 남긴다. 표 = 증상 · 원인 · 수정 · 확인 · 상태 | — |
| ④ 수정 | 원인을 고친다. 증상만 막지 않는다. 판정을 바꾸면 기준 시안 3곳을 같은 날 다시 잰다 | §2 체크리스트 |
| ⑤ 적재 | 관리자 개선 체크리스트에 slug 로 쌓는다(재발 = hits+1, 고친 뒤 다시 걸리면 regressed) | 운영 `api/bin/mock-checklist-import.php` / 로컬 `node scripts/mcp-loop-import.mjs <items.json>` |
| ⑥ 배포 | powerMCP·mockref·api 는 배포 스크립트가 각각이다 | `deploy-mcp.sh` · `deploy-mockref.sh` · `deploy.sh` (R05). 기본 CSS·동작 스크립트를 고쳤으면 `api/bin/mock-refresh.php` 까지 |
| ⑦ 재시험 | 같은 질문을 다시 돌려 고친 것을 확인한다 | 1차·고친 뒤를 나란히 표로 |
| ⑧ 정리 | 시험 산출물은 deploy "내 시안"으로 옮긴다. 시험 키는 폐기한다 | `mcp-test-key.php revoke`(옮기고 폐기) · `transfer`(옮기기만) · `lend <token…>`(관리자 시안 잠깐 빌리기) |

---

## 2. 고칠 때 체크리스트

번호는 이 파일 고유(MC-). 괄호 안은 원래 번호(R = 오류-재발방지-체크리스트, D = 판정 규칙, MCP-/MCK- = 사이트-품질-체크리스트, G = 홈박스 기록).

### 2.1 지침 문구 · 도구 설명 · 안내 페이지

| 번호 | 확인할 것 | 왜 (실제 사례) | 확인 방법 |
|:---:|---|---|---|
| MC-01 | 기본 경로를 바꾸면 instructions·모든 description 을 grep 해 옛 기본 문구를 지운다 | "시안은 get_replica_kit 기본"과 "홈페이지는 build_homepage 하나로"가 함께 있어 claude.ai 가 초안 도구를 골랐다 | `grep -n build_homepage packages/mcp/src` |
| MC-02 | "빠른 초안 전용" 같은 꼬리표는 description **맨 앞**에 둔다 | 뒤에 두면 무시된다 | tools/list 응답 첫 줄 |
| MC-03 | 일반 지식으로 답할 만한 질문(접근성·KRDS·디자인 선호·아이콘·"할 수 있어?")은 "powerplus 도구 먼저"를 instructions 와 description 첫 줄에 쓴다 | 3차 시험에서 예시 6개가 도구를 안 불렀다(check_request·get_checklist·design_preferences·assemble_screen·design_brief·assets_pick) | claude.ai 새 대화에서 예시 문구 그대로 |
| MC-04 | 안내 예시 질문은 운영에서 직접 쳐 보고 나서 적는다. 실제 도구가 하는 일 안에서만 약속한다 (R24, MCP-002) | "파란 톤 보안 아이콘" 예시에 무전기·반도체가 나왔다 | mcp-examples.ts 예시를 운영 키로 재실행 |
| MC-05 | 도구 표·도구 수는 손으로 쓰지 않고 registerTool 목록에서 빌드 때 만든다 (MCP-001·010) | 안내문 7곳이 실제 도구와 어긋났다 | `packages/mcp/scripts/gen-tools.mjs` 산출물과 tools/list 수 대조 |
| MC-06 | enum 인자는 description 에 허용값을 적는다. 틀리면 허용값 목록을 돌려준다 (MCK-004) | `kind:"hero"` 첫 호출이 -32602 로 실패 | 일부러 틀린 값 |
| MC-07 | kit 지시를 더하기 전에 같은 낱말로 procedure·acceptance·variation·base.rule 을 grep 해 충돌부터 지운다 (R34) | 구역 간격 지시가 세 군데서 달라 편차 50~140px | grep 결과 한 값만 남았는지 |
| MC-08 | 지시와 채점이 반대 방향인지 본다 | "본문 늘리지 말라"인데 높이 차 6% 를 치명으로 채점 → AI 가 min-height 로 늘리고 검사를 피함 | 지시 문장과 판정 규칙을 나란히 |
| MC-09 | 서버가 채우는 것(hb:use header·꺾쇠·바닥글 여백·동작 스크립트)은 kit 이 명시한다 | 안 알려서 서브 h1 2개·꺾쇠 2번 | 서브 시안 판정 감점 0 |
| MC-10 | 외부 이미지가 막힌 곳(claude.ai 아티팩트)용으로 게시 주소를 같이 안내한다. SVG 로 그림을 대신 그리지 말라고 쓴다 | 아티팩트에서 AI 가 만화 같은 그림을 지어냄 | 지침 문구 확인 |
| MC-11 | "통과할 때까지 고쳐 다시 판정, 미통과는 결과로 남지 않는다"를 지침에 둔다 (R20) | 미통과 시안이 그대로 남았다 | 지침 문구 |
| MC-12 | kit 문구 강조는 큰따옴표나 「」. 작은따옴표 금지 | PHP 문자열이 끊겼다 | `php -l` |
| MC-13 | 사용자 화면에 함수 이름(mock_get_wireframe 등)을 그대로 쓰지 않는다 | 평가 리포트 권고 | /powermcp 문구 |

### 2.2 인자 · 응답 · 오류 형식

| 번호 | 확인할 것 | 왜 | 확인 방법 |
|:---:|---|---|---|
| MC-20 | 모르는 인자를 조용히 버리지 않는다. 별칭(q→query·count→limit·site→slug) + `ignored_args` 로 알린다 | 기본값으로 답해 엉뚱한 결과 | 별칭 인자로 호출 |
| MC-21 | 처리기 오류는 전부 `{error:{code,message}}`. 범위 밖 = 403 `FORBIDDEN_SCOPE`, 키 없음 = UNAUTHORIZED, 잘못된 인자 = -32602, 없는 것 = NOT_FOUND (MCK-002·MCP-004) | SDK 가 일반 글로 바꿨다. 범위 밖이 "키가 유효하지 않습니다"로 나왔다 | 경계 호출 4종 |
| MC-22 | 결과는 `content`(text JSON) + `structuredContent` 둘 다. 실패는 `isError:true`. 이미지는 base64 image 블록. 401 에는 `WWW-Authenticate` | claude.ai 는 서명 URL 을 못 연다 | `npx @modelcontextprotocol/inspector --cli` |
| MC-23 | 응답 크기를 잰다. 기본은 요약, 원문·좌표는 `full`·`detail:true` 일 때만 | 재현 묶음 600KB, 와이어 판정 58KB | 응답 글자 수 표 |
| MC-24 | 여러 건은 한 번에 받게 한다(assets_get ids≤20, suggest_keywords words[]). 모든 응답에 `meta.quota`(남은 횟수·초기화 시각) | 아이콘 8개에 상세 8번, 검색어 추천 10번 → 하루 100건 소진 | 호출 수 세기 |
| MC-25 | 빈 결과는 이유를 말한다(`images_missing`, 0건 힌트, 시작 안내) | 참고 이미지 0장을 말없이 줌, deck_jobs 빈 배열만 | 빈 입력 호출 |
| MC-26 | 외부로 나가는 id 는 `public_id`. 숫자 PK·실제 기관 글을 싣지 않는다 | — | 응답 grep |
| MC-27 | 헬스의 버전·도구 수는 코드에서 계산한다 | 손으로 적어 재배포 뒤에도 옛 값 | `/mcp/health` 와 tools/list 수 |

### 2.3 키 · 권한 · 한도 · 유출

| 번호 | 확인할 것 | 왜 | 확인 방법 |
|:---:|---|---|---|
| MC-30 | 프록시형 MCP 는 키가 곧 신원이다. 검증한 플랜을 뒤 API 까지 넘긴다(X-Pp-Plan, 서비스 키가 유효할 때만 믿음) | Pro 키로 Free 응답. staff 가 재현 묶음에서 "Pro 이상" 거부 | 같은 호출을 무키·free·staff 키로 세 번 |
| MC-31 | 권한 판정은 `Access::can()` 하나. MCP 응답·검색·컬렉션·공유 링크 모든 출구가 지난다 (G30) | 상세만 잠그고 검색 출구는 원본 URL | 출시 전 외부 Free 계정 `leak-audit`(MCP 도구 포함) internal/pro 0건 |
| MC-32 | REST 를 키로 직접 불러도 MCP 와 같은 일 한도·범위를 적용한다 (MCP-006) | REST 직접 호출은 한도·범위 모두 통과였다 → Router 한 곳에서 범위 검사 후 집계(0b4d1fe) | mock 전용 키로 `/api/v1/assets/items` |
| MC-33 | powerMCP 경유 이중 집계 건너뛰기는 HMAC 헤더(X-Pp-Mcp)로만 인정 | 헤더만으로 흉내 낼 수 있었다 | 헤더 위조 호출 |
| MC-34 | 판정 결과는 서버가 만든 서명(HMAC `token|score|pass`, PP_JUDGE_SECRET)이 있을 때만 받는다. 비밀이 비면 로그를 남긴다 (MCK-007, R11) | 클라이언트가 보낸 `{score:95,pass:true}`로 게시까지 됐다. 비밀이 빠지면 점수가 조용히 NULL | 위조 점수 POST → 거부 |
| MC-35 | 시험 산출물 소유자를 확인한다. 끝에 deploy 로 옮기고 시험 키 폐기 (R13) | 시험 시안 11건이 임시 계정에 남아 안 보였다 | `mock_mockups.owner` |
| MC-36 | 커넥터 키는 헤더 어디에 있든(값만·X-API-Key·Bearer) 인정. 로컬 127.0.0.1 주소는 커넥터에 넣지 않는다(https 필수) | 헤더 칸이 없어 전부 UNAUTHORIZED | 3형식 호출 |
| MC-37 | 목업 샘플(mockup_sample)은 웹 목록 제외, 키 호출이면 권한 판정 | MCP 키로도 늘 막혔다 | free·staff 키로 샘플 검색 |

### 2.4 재료(kit) · 가상화

| 번호 | 확인할 것 | 왜 | 확인 방법 |
|:---:|---|---|---|
| MC-40 | 원문이 들어갈 수 있는 필드(sections·title·name·메뉴·본문·섹션 코드)를 **한 번에 전부** 훑어 실명·전화·기관장·게시물 제목을 지운다 | 고칠 때마다 새 필드에서 실명이 나왔다(강릉·강원, 기관장 이름) | 응답에서 레퍼런스 기관명 grep 0건 |
| MC-41 | 고객 기관명(org_name)·종류를 그대로 쓴다. 비면 org_name 으로 짐작하되 요청 종류 먼저 | OO시 요청에 '푸른구', 도서관을 미술관으로 | org_name 이 title·로고·h1 에 있는지(D5) |
| MC-42 | 배치는 레퍼런스의 행·열·폭을 따른다. 통계는 빠진 블록 보충에만 | 고정 틀 하나라 레퍼런스를 바꿔도 같은 시안 | 레퍼런스 3개 결과 나란히 |
| MC-43 | 좌표는 0~화면 폭으로 자르고 절반 넘게 밖이면 뺀다 | 음수·폭 초과 좌표 | 응답 좌표 범위 |
| MC-44 | 이미지는 web 판(긴 변 1920, mozjpeg 72), 섞기 합계 380KB 상한, 조각당 1장 보장 | 15MB 원본, 750KB 묶음 | 응답 크기 |
| MC-45 | 샘플은 대상(gov·corp·edu)·아이콘 스타일 하나·시안 간 반복 없음. 샘플 id 를 계산하지 않는다 | 초록 사이트에 파랑 아이콘, 번호가 밀려 참조 깨짐 | 시안 이미지 목록 |
| MC-46 | 폴더·주소를 옮기기 전에 DB 의 보관 HTML 을 grep 한다 | /homebox 삭제로 옛 시안 샘플 404 | 보관본 주소 200 |
| MC-47 | 기본 CSS·동작 스크립트를 고치면 보관 시안도 갱신한다 (R37) | 이미 만든 시안에 옛 판이 박혀 있었다 | `mock-refresh.php` 후 보관본 grep |
| MC-48 | CssPrune 은 괄호 안(`:not(:has(.x))`) 선택자를 필수로 세지 않는다 (R18) | 높이 상한 규칙이 통째로 버려졌다 | 생성 HTML grep |

### 2.5 판정기 (mock_check_mockup · deck_check_* · guide_check_code)

| 번호 | 확인할 것 | 왜 | 확인 방법 |
|:---:|---|---|---|
| MC-50 | 판정을 고치면 음성 대조 3종(빈 입력·치명 입력·과다 입력)이 실패하는지 본다 (R16) | 빈 기획·시간 2배 대본·오류 섞인 HTML 이 통과했다 | 음성 입력 3개 |
| MC-51 | 0 이 나오면 "통과"가 아니라 측정기가 동작했는지부터 본다 (R14) | 키를 잘못 읽어 0건 | 일부러 걸리는 입력 |
| MC-52 | 치명 1개 이상이면 최대 84점(통과선 85 아래) | 치명이 있어도 85 넘으면 통과 | 치명 입력 점수 |
| MC-53 | 판정 규칙을 바꾸면 기준 3곳(청운시청·새솔군청·대학)과 자동 초안을 같은 날 다시 잰다. 운영은 /tmp/pp-stage 에서 통과 후 설치 (R23) | 엄격화 뒤 build_homepage 100→52 | 기준 점수 표 |
| MC-54 | 통과 시안을 사람 눈 C 등급과 대조한다. C 는 걸리고 A·공사 재현본은 통과해야 한다 (R21·R35) | 85~100점 통과 중 C 등급 18건, 20장이 엉성 | 58건 재판정 |
| MC-55 | 지적받은 화면은 계측부터 만들고 → 판정으로 옮기고 → 기존 시안 전부에 다시 돌린다 | 새 시안만 막으면 옛 시안은 그대로 | slug `ux-1015-*` 0 |
| MC-56 | 오탐도 품질 결함이다. 오탐을 피하려 디자인을 망치게 된다 | 회색 카드를 투명으로, 카드 제거 | 6묶음 시험 오탐 수 |
| MC-57 | 점수가 흔들리면 두 번 재고 고정 감점만 고친다 | 조립 재료가 실행마다 바뀜 | 2회 점수 |
| MC-58 | 판정기 JS·PHP 정규식은 Edit 도구로만 고친다(R02·R38). preflight 6번이 깨진 정규식을 찾는다 | 역슬래시가 빠져 검사 3개가 배포 내내 안 돌았다 | `scripts/preflight.sh web` + 일부러 깨뜨린 줄 |
| MC-59 | 가로 넘침은 W 와 W-17(스크롤바) 둘 다. 1920·1440·1280·390 넘침은 치명 | 헤드리스엔 스크롤바 자리가 없어 통과 | 4폭 렌더 |
| MC-60 | 색·밝기는 DOM 이 아니라 캡처 픽셀로 잰다 | DOM 배경색으로 3% | 캡처 대조 |
| MC-61 | 통과 뒤에도 캡처를 연다 | 100점인데 405px 어두운 상자가 윗줄을 덮음 | 캡처 확인 |
| MC-62 | 판정 브라우저는 사설·루프백·메타데이터 주소와 웹소켓을 막는다 (SEC-007, G28) | iframe 으로 서버 내부가 샜다 | netguard.mjs 시험 |
| MC-63 | 수치 판정은 같은 수치를 한 번만 센다(500억/500). 번호 뒤 마침표·규격 이름·단어 첫 글자를 단위로 읽지 않는다 | "2. 개", "ISO 27001", "24 위", 치명 6건 중 실제 2종 | 오탐 문장 묶음 |
| MC-64 | 토큰 대체 제안은 대비 기준을 다시 재서 만족하고 용도가 맞는 것만 | #4A90E2 에 primary-40 제안(바꿔도 대비 미달), 버튼에 information 색 | 제안 토큰 대비 재측정 |
| MC-65 | 원본(정본) 데이터는 한 곳에서 읽는다. 관리자 덮어쓰기가 모든 도구에 반영되는지 본다 | guide_krds 만 taxonomy 를 따로 읽음 | 숨긴 항목 음성 대조 |

### 2.6 배포 · 운영

| 번호 | 확인할 것 | 왜 | 확인 방법 |
|:---:|---|---|---|
| MC-70 | powerMCP·mockref 는 deploy.sh 에 실리지 않는다. 각자 스크립트 (R05) | 운영이 옛 판으로 남았다 | preflight ℹ️ 줄 |
| MC-71 | 남의 미커밋 파일이 배포 범위에 있으면 배포하지 않고 알린다 (R04) | Session.php 때문에 mockref 보류 반복 | `git status` |
| MC-72 | deploy-mcp 는 health 를 최대 20초 재시도, 교체는 포트 기준 종료 | 재시작 2초 뒤 연결 실패, 옛 프로세스가 포트를 쥠 | 배포 로그 |
| MC-73 | api 배포는 옆 폴더 → 권한 → 이름 바꾸기(무중단) | 배포 중 config.php 를 못 읽어 publish 500 | 배포 중 호출 500 0회 |
| MC-74 | 시험 도중 api 를 고치지 않는다 | 결과가 섞인다 | — |
| MC-75 | MCP 효과는 렌더 캡처로 본다. 200·스키마 통과는 증거가 아니다 | assemble_screen 이 200 인데 렌더하니 와이어프레임 | 렌더 캡처 |
| MC-76 | 사용자 눈 지적은 판정 검사로 옮기고 **기존 시안 전부** 다시 판정·수정·같은 주소 재게시 | 10-15 판정 87~100 통과 시안이 눈으로는 엉성(20여 건). 새 시안만 막으면 내 시안 87장이 그대로 | packages/mcp/src/qa/layout.mjs · R35 |
| MC-77 | 판정 정규식은 Edit 도구로만, 새 검사는 일부러 걸리는 입력으로 먼저 | 셸 편집으로 역슬래시가 빠져 검사 3개가 배포 내내 0건 | preflight.sh 6번 · R38 |
| MC-78 | 여러 에이전트 일괄 작업은 staff 시험 키 + lend/transfer | deploy 플랜 한도 100/일 몇 분 만에 소진 | mcp-test-key.php lend·transfer·revoke |
| MC-79 | 기본 CSS·동작 스크립트를 고치면 보관 시안까지 | 판정 때 박힌 판이라 이미 만든 시안엔 안 들어감 | api/bin/mock-refresh.php · R37 |
| MC-80 | 샘플 그림 판별은 주소 열쇠로(id 아님) | id=banner-03-…·주소=2i8u… 라 글자 그림 잘림을 하나도 못 잡음 | index.ts textSampleKeys |
| MC-81 | 배포 범위에 남의 미커밋 파일이 있으면 커밋된 코드만 깨끗한 작업 트리(git worktree)에서 배포 | R04 를 지키면서 내 배포를 막지 않는다 | git worktree add --detach … HEAD |
| MC-82 | MCP 가 REST 응답을 읽는 경로는 실제 응답 키와 대조한다(타입 선언만 믿지 않는다) | mock_get_page_code 가 `{screen:{public_url}}` 를 `scr.public_url` 로 읽어 원본 화면 이미지가 늘 빠졌다(bc2324a) | 응답 JSON 을 한 번 찍어 키 경로 확인 |
| MC-83 | 한글 문자열을 바이트(substr)로 자른 뒤 `/u` 정규식에 넣지 않는다 — 글자 중간이 잘리면 preg 가 false | "보안인증 ISO 27001" 규격 검사가 앞 12바이트를 잘라 치명 오탐(349bd7e) | 한글 앞에 붙은 입력으로 음성 대조 |
| MC-84 | 만들어 두고 안 쓰는 판정 도우미가 있는지 본다(정의만 있고 호출 0) | flat()·has() 미연결로 "53 퍼센트=53%" 오탐·"19일 속 9일" 미탐(349bd7e) | `grep -n 'function 이름'` 과 호출 수 대조 |
| MC-85 | 예시 인자 값은 실제 허용값 목록(taxonomy)에 있는지 대조한다 | description 예시 `org_type=univ` 가 taxonomy 에 없어 예시대로 부르면 INVALID_ARGS(bc2324a) | 예시 문구 그대로 호출 |
| MC-86 | 요청 판정(Triage) capability 를 더하면 MCP 설명·사이트 도우미 바로가기(Assist CAP_LINKS)·낱말 규칙을 같은 이름으로 함께 | 판정은 됐는데 도우미가 "답을 찾지 못했다"(0740c1f) | /assist/scope 의 start 가 null 이 아닌지 |
| MC-87 | 판정 검사를 더하면 운영 시안 표본 40장으로 음성 대조 후 배포 | 글자 대비 검사 첫 판은 아이콘 글꼴(chevron_right)·장식 숫자('01')·카드 링크 날짜를 잡았다 — 표본으로 걸러 7/40 실제 대비 부족만 남김 | scratchpad lt.mjs 식 로컬 렌더 + layoutChecks |
| MC-88 | 판정 규칙 하나가 고치라는 방향을 다른 규칙이 치명으로 막지 않는지 규칙 표를 만들어 본다(높이 ±6% vs 히어로 900·바닥글 축소, 학교 어두운 띠 금지 vs 밝기 유사도, 구역 간격 한 값 vs 세로 간격 median) | 10-15 수리 배치가 고칠수록 다른 규칙에 걸림 — kit 고정 구간은 높이 차에서 빼고, 금지 규칙이 걸린 구간은 유사도에서 뺀다 | check.mjs height.kit_segments · frame.sec_gaps |
| MC-89 | 바탕을 찾는 계측은 조상 사슬만 보지 않는다 — absolute·fixed 로 뜬 요소는 elementsFromPoint 로 아래 면을 찾고, 그림·그라데이션이면 판정 보류. 숨긴 가상 요소(display:none·content:none)는 면이 아니다 | 투명 머리 흰 글 1.0:1, 숨긴 ::before 를 글자 뒤 면으로 본 오탐 | layout.mjs textLow · gates.mjs pseudoBg |
| MC-90 | 사람 눈 지적 시안은 '판정 통과'가 아니라 새 계측의 0건으로 닫는다 — 고치기 전 걸림·고친 뒤 0·잘 만든 표본 0 을 세 줄로 남긴다 | 88·93점 통과 시안이 엉성(R43) | docs/한국미래에너지공사-시안-점검-2026-10-15.md |
| MC-91 | 시안을 고칠 때 판정식 높이(바닥글 윗변 − 히어로)를 레퍼런스 대비로 본다 — 구역 간격은 늘리지 말고 기존 평균 이하 한 값, 빈칸은 덜어서, 카드 정렬은 글을 빼서 | 10-15 일괄 수정 표본 72 +8%·512 +15% 로 탈락. 같은 날 높이 규칙이 히어로를 빼고 재게 바뀌어 원래 시안도 이미 +6~14% 였다 | scratchpad try.mjs 높이 % · meas.mjs |
| MC-92 | 게시 시안 전체 재판정 전에 읽기 전용 조사(scripts/mock-compose-survey.mjs)로 대상부터 고른다 — 갤러리 사본이 없는 시안은 재판정에서 떨어지면 다음 날 지워진다(mock.php galleryStore). 빌릴 땐 lend-any 지도 파일을 백업 | 10-15 47장 일괄 수정: 조사 → 표본 5장 → 묶음 3개 → 미통과 재수정 → 47/47 통과·unlend, 재조사 110장 0건 | mcp-test-key.php lend-any·unlend |
| MC-93 | 글자 줄 나눔(꼬리 한 줄)은 운영 판정과 같은 서버 Chromium·글꼴로 확인한다 — 로컬 firefox 0건이어도 서버에서 걸린다. 문장은 칸 폭 80% 안(여유 20%), 낱말 중간 끊김은 keep-all | 10-15 로컬에서 고친 58·64·697 꼬리가 서버에서 다시 걸림, 74·105 는 서버에서만 | PP_QA_SERVER=1 node scripts/mock-compose-survey.mjs(서버) |
| MC-94 | 브라우저 보안 옵션은 실행 중인 프로세스 인자로 확인한다 — Playwright 는 chromiumSandbox:true 를 줘야 --no-sandbox 를 안 붙인다(args 에서 빼는 것만으론 안 켜짐). 서버 이관 때 AppArmor 프로필도 같이 깔고, 없으면 PP_JUDGE_NO_SANDBOX=1 | 10-15 --no-sandbox 를 args 에서만 빼고 배포 → 판정 브라우저 5개가 여전히 --no-sandbox | ps -eo args | grep chrome-headless-shell |

---

## 3. 시작 전 30초 점검

1. 이번에 고칠 도구의 영역 표(§2.x)를 훑었나.
2. 같은 증상이 §4 이력에 있나 → 있으면 재발이다. 관리자 체크리스트에 regressed 로 남는다.
3. 시험 키·한도·산출물 소유자 계획이 있나(§1 ①⑧).
4. 고친 뒤 음성 대조와 기준 3곳 재측정을 할 계획인가(MC-50·53).
5. 배포 스크립트가 무엇인가(MC-70).

---

# 2부 · 이력과 남은 일

## 4. 영역별 이력 (고친 것)

중복을 합쳤다. "확인"은 재시험·코드로 확인한 근거.

### 4.1 공통 · 키 · 한도
| 결함 | 수정 | 확인 |
|---|---|---|
| 키 검증만 하고 데이터는 익명 호출 → Pro 키에 Free 응답 | `Plan::keyPlan()`, 키를 뒤 API 까지 전달 | 무키·Pro 비교 |
| staff 키가 재현 묶음에서 Pro 거부 | X-Pp-Plan 전달 + mockref Plan.php staff→pro (ae4f71e) | 10-12 재호출, 코드 Plan.php:75-84 |
| 범위 밖 키 오류가 "키가 유효하지 않습니다" | 403 FORBIDDEN_SCOPE + hint | 10-10 재측정 |
| 옛 이름(get_replica_kit 등) Tool not found | 별칭 31개, tools/list 에는 숨김 | 10-10 재측정 |
| 모르는 인자 조용히 버림 | 별칭 + ignored_args | 10-12 반복 시험 |
| 처리기 오류가 일반 글 | `{error:{code,message}}` | 10-10 |
| REST 직접 호출은 일 한도 미적용 | Router 에서 `Keys::hit` | 코드 Router.php:80-84 |
| 이중 집계 건너뛰기를 헤더로 흉내 | X-Pp-Mcp HMAC | deck kit 각 1회 = 1 |
| 하루 100건이 상세·추천 반복으로 소진 | assets_get ids≤20, suggest_keywords words[], meta.quota·초기화 시각 | 10-12 |
| 커넥터 헤더 칸 없음 → UNAUTHORIZED | `?key=`, 헤더 어디든 인정 | 3형식 |
| 키 끝자리가 sha256 앞 4자리 | key_last4, key_enc 다시 보기 | — |
| 헬스 버전·도구 수 하드코딩 | 등록 도구 수 계산 | — |

### 4.2 지침 · 안내
| 결함 | 수정 |
|---|---|
| 기본 경로 충돌(replica_kit vs build_homepage) | 초안 도구는 "사용자가 직접 요청할 때만" |
| 예시 질문 6개가 도구를 안 부름 | instructions 첫 줄 "powerplus 도구 먼저" + 질문 유형별 도구 예 |
| 안내문 7곳 어긋남 | gen-tools 로 도구 표 생성 |
| enum 미기재 | 허용값 명시·오류에 목록 |
| 애매한 요청에 확신 낮은 답 하나 | 확신 0.7 미만·차이 0.3 미만이면 needs_clarification |
| 지시 충돌(이미지 그대로 vs 통일, row_gap vs 높이 6%, 간격 3곳) | 한 값·한 문구로 통일 (cbcab61) |
| 주색 면 허용으로 화면이 한 색 | theme.color_use·neutral |
| /powermcp 모바일 11,769px | 접기, 4,034px |

### 4.3 assets
| 결함 | 수정 |
|---|---|
| "데이터 베이스" → "케이스" 오교정 | 붙인 말 먼저 합치기(glue) |
| 최신순뿐(기관 로고 1위 엉뚱) | 관련도 점수 |
| 한 글자 검색 수천 건 | 정확 일치 먼저 |
| 주제 목록에 흔한 낱말 상위 | 20% 넘게 붙은 태그 제외 |
| 목업 샘플이 MCP 키로도 막힘 | 키 호출이면 권한 판정 |
| 새 키비주얼·업무 사진이 MCP 에 안 보임 | MockSamples::SET_KIND (3,075→4,708) |
| assets_pick 401(auth 라우터) | 회원·키·엔진 모두 |
| mcp·og 파생본 0 | prewarm 크론 03:30 |
| "제안서 보안 아이콘"에 무전기 | 쓰임새 말을 검색어에서 뺌(부분 해결, §5) |

### 4.4 mock 재료 · 조립 · 와이어
| 결함 | 수정 |
|---|---|
| 재현 묶음 600KB | 종류별 샘플 상한 + 380KB 상한 |
| 실명·기관장·전화 잔존(여러 필드) | 개수·길이만, scrub_names |
| "한빛시시장" | persona.head() |
| 고정 틀 배치 | 레퍼런스 행·열 따름, mixPlan(A+B·C) |
| 76KB HTML 두 번 작성(18분) | token + edits, publish 는 token 만 |
| 머리·바닥·동작 매 장 재작성 | base_token + `<!--hb:use-->`, `data-hb-behavior` 서버 채움 (서브 -70%) |
| edits CRLF·공백 실패 | 허용, 못 찾으면 보관본 일부 반환 |
| hb:use header 가 레이어 누락·h1 2개 | 로고 h1 강등·재동기화·masthead 포함 |
| 페이지 패턴 예시 미분류·중복 | 미분류 절반 이상 제외·서명 중복 제거 |
| 선호 규칙 정확·부분 일치 섞임 | 구분 + match_note |
| 좌표 화면 밖 | 자르기·제외 |
| 미사용 CSS 그대로 | CssPrune + 괄호 안 선택자 예외 (R18) |
| 주 메뉴에 유틸·가족 사이트 | 제외 |
| 서브 검색·전체메뉴 버튼 무동작 | 실제 레이어 |
| build_homepage 메인 33~54점 | D7 작업 98점, 비관공서는 통과 레퍼런스 우선(대학 91·복지관 92) |
| 와이어 원형 감점·LLM 원형에 메인 비주얼 | 원형별 예외, main_search 면 비주얼 제외 |
| assemble_screen 200 인데 와이어프레임 | 키워드·칸·이미지·폭 수정 |
| KRDS 링크 55개 404 | name_en 정확 일치 매핑 |
| 미리보기 바닥글 아래 흰 띠 | FrameHeight (R36) |

### 4.5 판정 · 게시
| 결함 | 수정 |
|---|---|
| 판정 위조 점수로 게시 | HMAC 서명 검사 (코드 mock.php:334-337) |
| 판정 비밀 누락 시 NULL 침묵 | 로그 (R11) |
| 미통과 시안 잔존 | 84 이하 즉시 폐기·하루 뒤 삭제, 목록은 passed=1 (R20) |
| 통과 시안 사람 눈 C 18건·20장 엉성 | visual·extra·behavior·layout.mjs (D1~D39, 구성 16~18종·반응형 8~10종), 기존 87장 재판정 |
| 정규식 역슬래시 누락으로 검사 3개 무동작 | Edit 도구 + preflight 6번 (R38) |
| 표준 속성(aria-expanded) 조작을 "동작 없음" 감점 | 감점 안 함 |
| 칠하지 않은 칸 안쪽 여백까지 끝선 | 여백 빼고 잼 |
| 오탐 4종(제목만 띠·rowspan·지도·::before) | cbcab61, 새 게이트 '화면 끝 글자' |
| SSRF | netguard.mjs |
| 판정 notes 미표시 | 내 시안·갤러리 상세에 표시 |
| 보고서 공개 API noindex 없음 | X-Robots-Tag (코드 reports.php:142) |

### 4.6 deck
| 결함 | 수정 |
|---|---|
| 빈 기획 점수, 치명 있어도 통과, 대본 2배 통과 | 0점, 상한 84, 시간 치명 |
| 15분에 7분 대본 통과 | 60% 미만 치명·80% 미만 경고, seconds_per_slide |
| 원자료·다른 장 수치를 지어낸 수치로 | 기획 전체+원자료 대조, 다른 장이면 경고 |
| "2. 개"·"ISO 27001" 수치 오판 | 예외 |
| 모르는 상자 종류 통과 | 경고 |
| 배점 상위 항목 뒤쪽 몰림 통과 | stat.priority 경고 |
| 짧은 원자료에 "얇은 장" | 분량 비례 기준 |
| 와이어 재료 중복·판정 58KB | full·detail 옵션 |
| 수치 중복 집계·위치 쪽 단위뿐 | 수정 (P:841) |

### 4.7 guide
| 결함 | 수정 |
|---|---|
| 오류 섞인 HTML 81점 | 오류 1개 이상이면 상한 84 |
| 한글 KRDS 분류·tokens.css·"포커스/로그인" 0건 | 대응·끝 일치·동의어·힌트 |
| 한 줄 HTML 줄 번호 1 | 요소 경로 |
| var() 폴백 hex 를 정본 밖 색으로 | 폴백 제거 후 판정 |
| onclick div 버튼 미검출 | fake_button 감점 |
| Tailwind v4 토큰 파일 없음 | solideo-tailwind.theme.css |
| guide_krds 원본 따로 읽음 | 공용 분류표 (10-14) |
| 대체 토큰 대비 미달 제안 | 대비·용도 맞는 것만, 13px 표시 (P:841 — 재측정 기록 없음, §5 참고) |

---

## 5. 남은 일 (2026-10-15 오후 갱신)

고친 것은 줄을 긋고 커밋을 적었다. 운영 배포·검증까지 마친 것만 긋는다(10-15 deploy.sh·deploy-mcp·deploy-mockref·deploy-engine, 공개본 bd8862b).

### 높음
| 번호 | 내용 | 상태 |
|:---:|---|---|
| ~~O-01~~ | ~~REST 범위 검사 없음~~ | 0b4d1fe — Router 한 곳에서 경로 첫 단(assets·deck·mock·guide)으로 403 FORBIDDEN_SCOPE, 범위 밖은 한도 미집계. mock 키 /assets/items 403·all 키 200 실측 |
| ~~O-02~~ | ~~check_request 가 코드 판정·지침 검색을 모름, 없는 부품 약속~~ | 0740c1f — guide_check·guide_rules·checkParts. 운영: "내 HTML 접근성 검사해줘" guide_check 0.9, "KRDS 배너 꼭 넣어야 해?" guide_rules 0.85, "비밀번호 강도 표시 부품" supported false·part_missing |
| ~~O-03~~ | ~~KRDS 출신 부품 지침 0, id 체계 셋~~ | 0740c1f — Data::KRDS_KIT 하나. 운영: top-navigation→header, gov-banner→masthead 200 |
| O-04 | 레퍼런스 이미지 공공누리 | **일부** ad08408·bc2324a·d4f3970 — 출구 차단·미제공 이유·판정 전용 원본. 남음: 인물 마스킹·로고 제외(워커·데이터 필요) |
| ~~O-05~~ | ~~게시본끼리 링크 404~~ | a0ea2cc(다른 세션) |
| ~~O-06~~ | ~~mockref 7-11 규칙 미배포~~ | 10-15 깨끗한 작업 트리(MC-81)로 deploy-mockref, health 200 |
| ~~O-44~~ | ~~레퍼런스 분석 도구에 실제 글·실명 잔존~~ | d4f3970 — structure.text 는 길이·형식만, 제목·라벨의 기관명·지명·인명은 ○○, common_titles 일반화. 운영 insights 실명 0(출처 표기 exemplars.title 만 유지) |

### 중간
| 번호 | 내용 | 상태 |
|:---:|---|---|
| ~~O-10~~ | ~~deck_kit 범위 오류 FORBIDDEN~~ | 0b4d1fe |
| O-11 | 설치 zip 주소 | **코드 완료** 0740c1f(powerguide-kit-krds.zip). 남음: 운영 서버의 옛 homebox-kit-krds.zip 삭제 |
| ~~O-12~~ | ~~토큰 체계 둘~~ | b435e92 — 정본 = 역할 토큰, 기본 brand = KRDS 주색 값, 크림슨은 skin-solideo.css 예시 스킨, kit --krds-primary 는 정본 별칭(계산 색 차이 0), 키트 0.1.1 |
| ~~O-13~~ | ~~check_code 후손 선택자·대체 색·제목 순서·lang·th~~ | 0740c1f — 대체 색 제안 1,038개 재측정 미달 0, contrast 내림 |
| ~~O-14~~ | ~~영어 동의어·KRDS en 잘림~~ | 0740c1f(읽을 때 보정). 남음: 원천 krds.ts en 잘림·krds-report.json 208·209행 확인 |
| ~~O-15~~ | ~~디자인 시스템 실측 값 오류~~ | ad08408 — 1,722곳 이상값 0 |
| ~~O-16~~ | ~~powerGuide 토큰 형식~~ | ad08408·bc2324a — format=powerguide(DTCG). tokens.schema.json 은 아직 없음(ARCHITECTURE 계획만) |
| ~~O-17~~ | ~~checkPlan 단위 오탐·금지어·시간 대비 장 수~~ | 349bd7e(+e47466c) — ISO 한글 바이트 잘림·날짜 "202"·붙은 숫자, 단위 환산 대조, 장당 3분 초과 warn |
| ~~O-18~~ | ~~checkScript 1인칭·블라인드·예상 질문~~ | e47466c + 349bd7e(블라인드 법인 표기) |
| ~~O-19~~ | ~~/docs/errors·limits~~ | 0b4d1fe |
| O-20 | 판정 남은 것 | **일부** e78c72c(이미지 배너 자리, 다른 세션). 남음: D4·D36, s02 본문 폭 오탐, 빈칸·꼬리 한 줄 미탐, 모바일 표 |
| ~~O-21~~ | ~~깨진 캡처 3장~~ | 다른 세션 scripts/capture-blank-scan.mjs(R40) — 3장 포함 173장 review |
| ~~O-22~~ | ~~사진 부족·워터마크·아이콘 스타일~~ | ef16b9b·d4f3970 + 2026-10-16 Higgsfield 54장 등록 — 모든 kind×target(대학·학교·도서관·복지·문화·협회·지자체) 칸 1장 이상(포스터 1~2, 나머지 2~6) |
| ~~O-23~~ | ~~넓히기가 핵심어를 버림~~ | 5a60932 — 남긴 낱말 무게 합 기준, Concierge '보고서' 쓰임새 꼴 |
| ~~O-45~~ | ~~공공누리 111곳 판정이 이미지 없이 대조~~ | d4f3970 — 판정기만 HMAC 서명으로 2분 만료 judge_url 을 받아 대조, 사용자 응답엔 미제공. 운영 mockref judge.secret 설정(10-15). powerMCP 배포는 다른 세션 일괄 수정 끝난 뒤 |
| ~~O-46~~ | ~~RFP 분량 상한 초과가 warn~~ | ef16b9b — 상한 명시 시 치명(실격 사유), 분·일·사진·제안요약서 분량 제외 |

### 낮음
| 번호 | 내용 | 상태 |
|:---:|---|---|
| ~~O-30~~ | ~~키 없는 tools/list 200~~ | 유지 결정 — 커넥터 탐색용 표준 동작 |
| ~~O-31~~ | ~~Free 차단 API 402 / MCP 403 불일치~~ | cbb669c — MCP 도 /docs/errors 와 같은 UPGRADE_REQUIRED(402), 403 은 FORBIDDEN |
| ~~O-32~~ | ~~남의 시안 고치기 404~~ | 0b4d1fe — 403 |
| O-33 | 렌더 판정 크레딧 차감 | 과금 설계 후 |
| ~~O-34~~ | ~~판정 브라우저 --no-sandbox~~ | fd76fb1·963b543 (사용자 승인) — 실행 파일 하나만 userns 허용 AppArmor 프로필(scripts/apparmor-pw-headless-shell) + chromiumSandbox:true. 운영 판정 브라우저 --no-sandbox 0개, 재판정 점수 그대로(98·89·98) |
| O-35 | 커넥터 OAuth | 큰 작업 |
| O-36 | deck 렌더 계열 도구 | 큰 작업 |
| O-37 | check_code 결과 기록 표 | db-design 먼저 |
| O-38 | guide 데이터 잡일 | **대부분** 0740c1f(PDF 찌꺼기·출처 문구·터치 기준 token·type 허용값). 남음: 지침 117개 마침표(대부분 KWCAG 항목 이름) |
| ~~O-39~~ | ~~Tailwind v3 프리셋 누락~~ | 0740c1f — 같은 정본에서 생성, 옛 키 값 변경 0 |
| ~~O-40~~ | assets 검색 잡음·빈 메타 | **완료(2026-10-16)** e7z9fh2fmn7gheh6 채움, 크기 빈 2,204개 asset-backfill-dims.php(cbb669c), 이름 6,352·설명 4,687 빈 행 asset-backfill-names.php 로 드문 키워드+분류(「승인도장 검토완료 아이콘」)·로고는 「기관명 로고」·alt 있으면 이름=alt. 후속(선택): MCP 에 자주 나오는 자산부터 비전으로 문장 설명 다듬기 |
| ~~O-41~~ | ~~deck_jobs 실패 원인·보건소 분류·보고서 공개~~ | cbb669c — 보건소 레퍼런스 0곳이라 public_medical 별칭(수집은 O-42), 보고서 visibility link·staff·private |
| O-42 | 레퍼런스 부족(보건소 0곳·비전 등 서브 화면)·섞기 B·C 비중 | 실제 사이트 수집이 필요 — 생성 이미지로 못 메움. 수집 워커 작업으로 |
| ~~O-43~~ | ~~판정 대기열 단일 직렬~~ | 유지 결정 — 서버 메모리(판정 1건 ~2.5GB)상 전체 1건 직렬이 키당 1건보다 안전. 서버 사양을 올릴 때 다시 |
| O-47 | 숫자 PK 노출 — mock 갤러리 `/mock/gallery/{id}`, gallery.id, 댓글·알림·채팅 id (MC-26). MCP 출구엔 없음 | 웹 계약 변경 필요 |
| O-48 | `AiKeys::viaEngine` 안 쓰는 함수 — 끊긴 대체 경로인지 일부러 끈 것인지 | 확인 |
| O-49 | deploy-mcp 가 git 제외 시험 파일(.mcpcall*.mjs)까지 tar 로 싣는다 | git archive 로 바꿀지 |
| O-50 | 이 PC Node 22.15 — apps/web typecheck(react-router typegen)는 22.22 이상 필요, tsc 로 대신함 | 환경 |
| ~~O-51~~ | ~~묶음 간격이 검색 칸을 카드로~~ | 1284bd8 design.mjs ctrlBox — 97 해소, 71 탭 단추 오탐도 빠짐 |
| ~~O-52~~ | ~~꼬리 검사가 숨은 탭·넘김 다른 장·짧은 글을 안 봄~~ | 1284bd8 tailIn(한 장씩 보이게 재고 원복) — 새로 걸린 9장 + 서버 기준 5장 일괄 수정 |
| ~~O-53~~ | ~~그림자 띠·칸 위 넘김 단추 줄 빈칸 오탐~~ | 1284bd8 bandShadow·elementFromPoint |
| ~~O-54~~ | ~~꼬리 검사가 strong·b·em 안 글을 안 봄~~ | 6de34a4 — strong·b·em·dt·td·h5 포함. 서버 조사로 새로 걸린 8장(강조 태그 제목 11건)을 칸 폭 80% 안으로 줄여 수정·재게시(689 는 앞선 카드 속 틈 margin-top:auto 되돌림 86), 그 뒤 배포 |

---

## 6. 문서끼리 어긋난 것 (정리 대상)

| 항목 | 문서별 값 | 현행 |
|---|---|---|
| 통과·폐기 점수 | 사이트-품질-체크리스트 MCK-007 "80 이하 폐기", ARCHITECTURE "갤러리 81+" | **85 이상·치명 0 통과, 84 이하 폐기** (R20) |
| 도구 수 | PLAN 10-07 "31개", README "47개" | tools/list 기준(gen-tools 산출물) |
| 도구 이름 | ARCHITECTURE §3.1 `assets_pick_for_mockup`·`deck_convert`·`guide_parts`·`me_quota`·`mock_check_status`·`mock_get_rules` | 현재 이름(`assets_pick`·`deck_get_plan_kit` 등). ARCHITECTURE 가 옛 설계 |
| REST 한도 | 사이트-품질-판정 10-10 "REST 직접 호출 한도 미적용" | 고쳐짐(Router.php) — 판정 문서는 당시 기록 |
| 판정 위조 | 사이트-품질-판정 10-10 MCK-007 미흡 | 고쳐짐(HMAC) |

---

## 7. 출처

| 문서 | 내용 |
|---|---|
| docs/MCP-실호출-테스트보고서-2026-10-10.md | 99문항, D-01~D-15 |
| docs/MCP-반복시험-2026-10-12.md | 1차 반복 시험 19건 |
| docs/MCP-예시검증-2026-10-12.md | /powermcp 예시 실호출 |
| docs/MCP-품질시험-3차-2026-10-12.md | claude.ai 실사용 26문항, 도구 미호출 6건 |
| docs/mcp-materials-research.md | 재료형 설계·과금·deck 도구 제안 |
| docs/오류-재발방지-체크리스트.md | R04·R05·R11·R13·R14·R16·R18~R24·R34~R38 |
| docs/사이트-품질-체크리스트.md · 사이트-품질-판정-2026-10-10.md | MCP-001~010, MCK-001~008 |
| docs/홈페이지-10곳-시험-2026-10-15.md · 내시안-디자인·프론트-점검-2026-10-13.md | 판정 D1~D39, kit 7-9~7-11 |
| docs/남은작업-체크리스트-2026-10-12.md · ARCHITECTURE.md · PLAN.md · README.md · db-design.md | 구조·결정 |
| storage/mcp-test-1010/guide/REPORT.md · storage/qa-20261010 · storage/qc-20261010 · storage/test-20261009 | 모듈별 시험 원자료 |
| (비공개 작업 기록) · PATTERNS.md · PROJECTS/2026-solideo-platform.md · 2026-homebox.md · 2026-powerplus-addin.md | 교훈·응답 규약·이력 |
