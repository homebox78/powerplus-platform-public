# powerPlus 플랫폼 — 제작 설계서 (연계 · 백엔드 · MCP · 성능 · 보안)

> 기획(PLAN.md)이 "무엇을"이라면 이 문서는 "어떻게 만드나"다. 표·경로·함수 이름은 제작할 때 그대로 쓴다.
> DB 표 사전·이관 매핑은 `db-design.md`. 작성 2026-10-06, 근거는 네 저장소의 현재 코드(홈박스 48표·파워플러스 11표·파워덱 14표·Solid Flow 토큰 빌드).

## 0. 설계 원칙 다섯 가지 (코드 리뷰 체크리스트 겸용)
1. **콘텐츠는 어디서 왔든 `core_contents` 축 하나로 권한 판정** — `visibility × owner × org` 를 읽는 함수는 `Access::can()` 하나. 모듈 코드는 이 함수 밖에서 권한을 판단하지 않는다.
2. **모듈 간 호출은 HTTP 가 아니라 같은 PHP 프로세스의 서비스 클래스** — `Assets\Service::find()` 처럼. 네트워크·키·직렬화가 끼면 느려지고 권한이 샌다.
3. **파생물(썸네일·색인·캐시·MCP 응답)은 원본 표가 바뀌는 순간 같이 갱신** — "visibility 가 internal 로 바뀌면 파생물 삭제 잡" 을 이벤트 하나로.
4. **무거운 일은 전부 `core_jobs` 큐** — 캡처·판정·이미지 생성·색인·이관. 웹 요청 안에서 10초 넘는 일은 없다.
5. **운영 DB 가 원본, 배포는 마이그레이션만** — 로컬 덤프로 운영을 덮는 `--db` 는 이 플랫폼에 없다.

## 1. 모듈 연계 지도 — 무엇이 무엇을 쓰나

```
                 ┌────────────── powerAssets (자산 창고) ──────────────┐
                 │ 아이콘·일러·사진·배너·로고·서명·장표낱장 · 스타일 세트 │
                 │ 검색(동의어·오타·자모) · 태그 · 공개 등급 · 사용 기록   │
                 └───────┬───────────────┬────────────────┬────────────┘
   삽입(애드인)          │ 재현 묶음 샘플  │ 아이콘 교체     │ 랜딩 '최근 자산'
                         ▼               ▼                ▼
   PowerPoint ◄── 애드인   powerMock ◄─────┼──── powerDeck   플랫폼 홈/assets
                           │   (MCP·시안)  │   (장표 변환)
   레퍼런스 토큰 ──────────┼───────────────┤
                           ▼               ▼
                        powerGuide (토큰·부품·KRDS·규칙) ──► 둘 다 theme.css 형식으로 받음
                           ▲
                        와이어프레임 엔진(파워덱 WireLayout) ──► powerMock 기획 목업
```

### 1.0 이관하지 않는 기능(삭제)
- **외부 이미지 검색(Openverse `imagesearch`·`imageproxy`, 애드인 "웹 이미지" 탭)** — 사용자 2026-10-06 "그 기능은 삭제". 외부 저작물 유입 경로이자 SSRF 면이라 플랫폼엔 만들지 않는다. 자산은 powerAssets 등록분만.

### 1.1 홈박스 디자인 샘플 → powerAssets 로 전부 이관 (사용자 제안)
- 지금: 홈박스 `api/data/sample-images.json` 2,204장 + `storage/homebox-public/samples` 87MB. MCP 재현 묶음·목업 조립이 이 파일을 읽는다. 같은 이미지가 파워플러스 `assets` 에 **따로 또 등록**돼 있다(photo 610·icon 3,042·illust 1,774 중 상당수) — 두 벌 관리, 태그 체계도 둘.
- 이관 후: **원본은 `asset_items` 하나**. 홈박스 매니페스트의 필드는 자산 표의 열·태그로 흡수한다.

| 홈박스 샘플 필드 | powerAssets 표 | 비고 |
|---|---|---|
| `id`(예 `icon-blue-361`) | `asset_items.legacy_key` | 재현 묶음 응답의 옛 id 호환 |
| `kind`(37종: sub-visual·popup·emblem·signature·icon-glass…) | `asset_items.category` + `asset_tags(kind=…)` | 아이콘·사진·일러스트는 기존 6종 카테고리로. **글자 박힌 배너·팝업·카드뉴스·포스터·로고·서명·기관장 사진은 새 카테고리 `mockup_sample`(목업용 샘플)** — 사용자 결정 2026-10-06 |
| `use_for`(섹션 유형 연결) | `asset_tags(use:quick_links…)` | `Samples::FOR_SECTION` 표를 태그로 |
| `tags`·`alt` | `asset_tags(lang=ko/en)` + `alt` 열 | |
| `w·h·aspect·has_text·text_safe` | `asset_items.w/h/has_text/text_safe(JSON)` | 목업이 글자 얹을 자리를 쓴다 |
| `대상:gov/corp/edu` | `asset_tags(target:gov)` | |
| `temporary`·`source` | `asset_items.visibility=internal` + `source` 열 | 임시본은 internal 로 두면 외부에 안 나간다 |
| 파일 `samples/<id>.webp`·`.thumb.webp` | `asset_files(kind=original/thumb/mcp)` | 파일 하나에 파생 여러 개 |

- **MCP 는 어떻게 쓰나**: `Assets\Service::pick(['use'=>'quick_links','style'=>'icon-blue','target'=>'gov','exclude'=>$used])` — 지금 `Samples::find()` 를 **같은 시그니처로 자산 서비스에 옮긴다**. 재현 묶음·조립기·판정은 호출부 한 줄만 바뀐다. 반복 방지(`Samples::remember`)는 `asset_uses(user/key, asset_id, used_at)` 표로.
- **`mockup_sample` 카테고리 노출 규칙(사용자 2026-10-06)**: 파워플러스(powerAssets)에 넣되 **애드인에는 노출하지 않는다** — 관리자 화면과 MCP(재현 묶음·조립·판정)에서만 쓴다. 구현은 카테고리 하나로 끝낸다: 애드인 자산 API(`/assets/items`)는 `category != 'mockup_sample'` 을 기본 조건으로, 관리자 목록은 탭으로 보이고, `AssetsService::pick()` 은 `use:` 태그로 고른다. 애드인에 안 보이는 이유를 코드에 적는다(글자가 박혀 장표 소재가 아니고, 실제 기관처럼 보이는 가상 기관명이 들어 있다).
- **애드인에서도 보인다**(일반 6종만): 이관 즉시 파워포인트 작업창에서 홈박스 샘플(서브 비주얼·배너·마스코트)이 검색된다. 반대로 애드인에 등록되는 자산은 `use:` 태그만 붙으면 MCP 시안 재료가 된다 — **등록 경로 하나, 소비 경로 셋**(애드인·MCP·장표 변환).
- 이관 절차: `db/migrate-legacy/samples.php` — 매니페스트 → `asset_items` upsert(legacy_key 기준, 멱등) → 파워플러스 기존 등록분과 **md5 로 중복 대조**해 같은 파일이면 한 행에 두 legacy_key(샘플 id·파워플러스 id)를 묶는다 → 파일은 `storage/assets/<public_id>/` 로 복사, 홈박스 경로는 1년간 301.

### 1.2 powerMock(MCP) → powerAssets 연계로 생기는 새 서비스
| 서비스 | 무엇 | 왜 지금은 안 되나 |
|---|---|---|
| **재료 묶음에 "실제 자산 검색"** | `mock_get_replica_kit` 가 기관 종류·섹션별 자산을 **동의어·오타 교정 검색**으로 고른다(지금은 태그 정확 일치) | 검색 엔진이 파워플러스에만 있다 |
| **시안 판정이 자산 출처 검증** | `mock_check_mockup` 이 시안 안 이미지 URL 이 우리 자산인지·등급 밖 자산(internal)이 섞였는지 검사 → 유출 게이트 | 자산 표와 시안 표가 다른 DB |
| **자산 사용 통계가 하나** | 애드인 삽입 + MCP 시안 사용 + 장표 변환 교체를 `asset_uses` 한 표에 → "가장 많이 쓰인 아이콘 세트"가 세 경로를 합산 | 파워플러스 usage_log 에 애드인만 |
| **세트 단위 제공** | MCP 가 아이콘을 낱개가 아니라 `style_group` 으로 받아 한 시안에 한 세트(C67 규칙)를 서버가 보장 | 홈박스 쪽 styleOf 는 종류 접두 추정 |
| **콘텐츠 요청 → 제작 → 등록 루프** | MCP 가 "없는 샘플"(샘플 부족 체크리스트)을 `asset_requests` 에 자동 기록 → 관리자가 생성(Higgsfield 등 개발 도구) → 등록 → 다음 시안부터 쓰임 | 수동 프롬프트 파일 |
| **애드인에서 시안 받기** | 애드인에 "이 장표에 맞는 관공서 레퍼런스" 탭 — powerMock 검색을 같은 세션으로 | 계정이 다르다 |

### 1.3 파워덱 와이어프레임 엔진 → powerMock 기획 목업 (사용자 아이디어 2026-10-06)
- 이식 대상: `WireLayout.php`(줄·12칸·쌓기 → 좌표, 글 양 높이, `check()`), 배치 틀 12종, `Wireframe.tsx`(회색 상자·X 그림자리·그 자리 편집), `prompt_wire.md` 규칙.
- 웹용 상자 종류 = **홈박스 섹션 유형 그대로**(header·masthead·main_visual·news_tabs·quick_links·banner_zone·popup_zone·board_list·board_view·form·greeting·org_chart·info_table·faq_list·footer…). 장표 전용(gantt·phase·badge)은 뺀다. 그러면 레퍼런스 줄·칸 → 와이어 rows 변환이 1:1.
- 도구 세 개(§3 표): `mock_get_wireframe`(레퍼런스·섞기 → 와이어 HTML + rows JSON) · `mock_check_wireframe`(check 이식 + 화면 종류 필수 섹션) · `mock_get_replica_kit(wire=…)`(와이어 JSON 을 배치로 받아 시안 재료). 흐름: **기획 와이어 → 판정 → 디자인 시안 → 판정 → 게시**.
- 공통 엔진은 `packages/wire`(TS, 좌표·검사·렌더)로 두고 PHP 는 같은 규칙을 포팅한 `api/src/Wire/Layout.php` — 파워덱(장표 3:2)·powerMock(웹 1920·390)이 캔버스 비율만 다르게 쓴다. 틀(tpl)·상자 종류는 `packages/shared/wire.json` 데이터.
- 웹 관리자 화면 `/mock/wire/<id>`: 파워덱 Wireframe.tsx 를 옮겨 **사람이 상자를 끌어 고치고** 그 결과를 시안 재료로 넘긴다(기획자가 쓰는 화면).

### 1.4 powerGuide ↔ powerMock ↔ powerDeck 토큰 한 형식
- `mock_get_design_system` 이 내는 CSS 변수와 Solid Flow `tokens.json` 빌드 출력, 파워덱 `theme.css` 를 **한 스키마(`packages/shared/tokens.schema.json`: color·type·space·radius·shadow)** 로. 레퍼런스에서 뽑은 토큰을 powerGuide 형식으로 내려받고, 장표 변환이 같은 토큰으로 시안 색을 맞춘다.
- powerGuide 부품 카탈로그 = 홈박스 `packages/kit`(KRDS 77종 React·Vue) 를 P4 에서 실측 후 합치는 것이 기본 가정. 합치면 MCP `mock_get_page_code` 가 주는 코드 = 카탈로그 부품 = 가이드 문서 예시가 한 소스.

## 2. 백엔드 구조 — 메뉴·경로·권한을 한 표로

### 2.1 저장소·프로세스
```
powerplus-platform/
├─ apps/web          React 19·RR8 SPA (하나) — 메뉴 = 라우트 접두 /assets /deck /mock /guide /account /admin
├─ apps/addin        파워포인트 애드인(별도 빌드, Office.js) — 로그인·검색은 /api/v1/assets
├─ apps/worker       Node 워커: 수집(Playwright Firefox)·판정(chromium)·색인·이미지 파생·이관 — core_jobs 폴링. **서버 상주**(사용자 결정 2026-10-06, PC 실행 폐지)
├─ engine/           파워덱 리눅스 엔진(Python) — core_jobs(kind=deck.convert) 폴링
├─ packages/mcp      powerMCP (Node, Streamable HTTP :3100) — PHP REST 가 아니라 **PHP 와 같은 DB 를 직접 읽지 않고** /api/v1 내부 호출(키 전달) — 단 이미지·대용량은 서명 URL
├─ packages/shared   taxonomy·zod·플랜 표·토큰 스키마·와이어 틀
├─ packages/kit      KRDS 부품(React·Vue·CSS)
├─ packages/wire     와이어프레임 좌표·검사·렌더(TS)
├─ api/              PHP 8.5 프론트 컨트롤러 하나 + 모듈 폴더
└─ db/               schema.sql · migrations/ · seed/ · migrate-legacy/
```
프로세스 4개 전부 서버 systemd: Apache+PHP(웹·REST) / Node MCP / Node 워커(수집·판정·파생·색인) / Python 엔진. 메모리 예산: Apache+PHP 1.5G · MariaDB 2G(innodb_buffer_pool 1.5G) · Meilisearch 1G · MCP 0.5G · 엔진 1.5G · **워커 2.5G**(Firefox 캡처 1개 ≈ 1G, 판정 chromium ≈ 0.7G) = 약 9G → **서버 16GB 권장**(현 VM 은 수집·판정 동시 1건으로 제한). 워커 운영 규칙: 수집은 `core_jobs` priority 낮음·야간 집중(02~07시 동시 2, 주간 1), 판정은 priority 높음·즉시, 브라우저는 2분 유휴 시 종료, 잡 시간 제한(캡처 6분·그 외 15분)과 20분 running 회수는 홈박스 현행 그대로. 수집 산출물(원본 캡처·스냅샷)은 서버 `storage/` 에 바로 쌓이므로 **PC↔서버 동기화·`--db` 가 사라진다**(두 PC 불일치 사고 계열 종료).

### 2.2 PHP api/ 구조
```
api/public/index.php           프론트 컨트롤러: 라우팅 → 인증 → 모듈 컨트롤러
api/src/Core/   Router Response Db Config Session Auth(OTP·OAuth) Access(can) Keys Jobs Events Audit Mail Cache RateLimit Upload(ClamAV)
api/src/Assets/ Controller Service Search(동의어·오타) Tags Sets Import
api/src/Deck/   Controller Service Jobs Wire(파워덱 WireLayout 포팅) Credits
api/src/Mock/   Controller Sites Screens Sections Insights ReplicaKit Wireframe Check Publish Gallery Points
api/src/Guide/  Controller Tokens Docs Proposals
api/src/Comm/   Posts Comments Notifications
api/routes/<모듈>.php          경로 → 컨트롤러 매핑(아래 표의 소스)
```
- 모듈 서비스는 **다른 모듈 서비스를 직접 호출**(예 `Mock\ReplicaKit` → `Assets\Service::pick`). 컨트롤러끼리는 부르지 않는다.
- 응답 규약: 성공 `{data, total?, page?, limit?, meta?}` / 실패 `{error, code, hint?}`, 오류 코드는 `packages/shared/errors.ts` 와 같은 목록. 날짜 ISO 8601 UTC. 숫자 PK 는 응답에 없고 `public_id` 만.
- 인증 세 가지가 한 미들웨어: ① 세션 쿠키(`pp_sid`, HttpOnly·Secure·SameSite=Lax) ② `Authorization: Bearer pp_live_…`(REST·MCP 공용 키) ③ 워커·엔진 전용 키(`pp_worker_…`, scope=jobs). 결과는 항상 `Actor{user, org, kind, plan, roles, key?}` 하나로 컨트롤러에 들어간다.

### 2.3 메뉴 ↔ 라우트 ↔ API ↔ 권한 (제작 체크표)
| 메뉴(web) | 화면 라우트 | API(v1) | 읽기 권한 | 쓰기 권한 |
|---|---|---|---|---|
| 홈 | `/` | `GET /home`(모듈 4칸 요약·최근 업데이트 — 등급별 캐시) | 모두 | — |
| 통합 검색 | `/search?q=` | `GET /search`(assets·mock·guide·deck 탭, Meili multi-search) | 모두(결과는 can 필터) | — |
| powerAssets 랜딩 | `/assets` | `GET /assets/landing`(설치 안내·최근·카테고리·세트) | 모두(visibility 필터) | — |
| 자산 검색 | `/assets/search` | `GET /assets/items?q&category&tag&set&page` | 모두 | — |
| 자산 상세·세트 | `/assets/:pid` | `GET /assets/items/:pid`, `/items/:pid/set`, `/items/:pid/similar` | can(item) | — |
| 삽입·사용 기록 | (애드인) | `POST /assets/items/:pid/use` | can(item) | 로그인 |
| 콘텐츠 요청 | `/assets/requests` | `GET/POST /assets/requests` | 로그인 | 로그인 |
| 애드인 로그인 | (애드인) | `POST /auth/otp`, `/auth/otp/verify` | — | — |
| powerDeck 랜딩 | `/deck` | `GET /deck/landing` | 모두 | — |
| 장표 업로드·변환 | `/deck/new`, `/deck/jobs/:pid` | `POST /deck/uploads(조각 PUT)`, `POST /deck/jobs`, `GET /deck/jobs/:pid`, `/jobs/:pid/files/:kind`, `POST /jobs/:pid/feedback` | 소유자·admin | can(deck.use)+크레딧 |
| 와이어프레임 편집 | `/deck/jobs/:pid/wire` | `GET/PUT /deck/jobs/:pid/wire`, `POST …/wire/ai` | 소유자 | 소유자 |
| powerMock 랜딩 | `/mock` | `GET /mock/landing` | 모두 | — |
| 기관 탐색·상세·뷰어 | `/mock/sites`, `/mock/sites/:slug`, `/mock/screens/:pid` | `GET /mock/sites`, `/sites/:slug`, `/screens/:pid`(잠금은 can) | 모두(등급 잠금) | — |
| 섹션·컴포넌트·흐름 | `/mock/sections`, `/mock/sites/:slug/components` | `GET /mock/sections`, … | 모두 | — |
| 기획 와이어프레임 | `/mock/wire/:pid` | `GET/PUT /mock/wires/:pid`, `POST /mock/wires`(레퍼런스에서) | 소유자 | Pro·staff |
| 시안·갤러리 | `/mock/gallery`, `/mock/p/:token` | `GET /mock/mockups`, `/gallery`, `POST /mock/mockups/:pid/share` | 모두(공유분) | 소유자 |
| 컬렉션·평가 | `/mock/collections` | `GET/POST /mock/collections`, `POST /mock/sites/:slug/rating` | 로그인 | 로그인 |
| 삭제요청 | `/mock/removal` | `POST /mock/removal`, `GET /mock/removal/:no` | 모두 | 모두(레이트리밋) |
| powerGuide | `/guide`, `/guide/tokens`, `/guide/parts/:id`, `/guide/krds` | `GET /guide/tokens?format=css|tailwind|figma|json`, `/guide/parts`, `/guide/krds`, `/guide/docs/:slug` | 모두(무료) | — |
| 규칙 제안 | `/guide/proposals` | `GET/POST /guide/proposals` | 로그인 | 로그인 |
| 커뮤니티 | `/community` | `GET/POST /comm/posts`, `/posts/:pid/comments`, `/likes` | 모두/로그인 | 로그인 |
| 마이페이지 | `/account/*`(§8 기획) | `GET /me`, `PUT /me`, `/me/avatar`, `/me/keys`, `/me/plan`, `/me/points`, `/me/activity`, `DELETE /me`(탈퇴) | 본인 | 본인 |
| 관리자 | `/admin/*`(§9 기획) | `/admin/users`, `/admin/roles`, `/admin/assets`, `/admin/deck/jobs`, `/admin/mock/*`, `/admin/guide/*`, `/admin/flags`, `/admin/settings`, `/admin/audit` | 역할별 can | 역할별 + audit |
| MCP | — | `/mcp`(Node) → 내부 `/api/v1/*` | 키 scope | 키 scope |
| 옛 주소 | `/powerPlus/*` `/homebox/*` `/powerDeck/*` `/solideos/*` | 301 또는 프록시(1년) | — | — |

권한 열의 "can" = `Access::can($actor, $contentRow, $action)` 한 함수. 화면 메뉴 노출도 `GET /me` 가 주는 `caps[]`(서버가 계산)로만 — 프론트에 플랜 비교 코드를 두지 않는다.

## 3. powerMCP — 도구 목록·흐름·퍼포먼스

### 3.1 도구(모듈 접두, 옛 이름은 1년간 별칭)
| 도구 | 하는 일 | 입력 | 등급 |
|---|---|---|---|
| `assets_search` | 자산 검색(동의어·오타·자모·세트) + 썸네일 image content | q·category·tag·set·style·limit | Free 메타 / Pro 이미지 |
| `assets_get` · `assets_set` · `assets_similar` | 상세·세트·유사 | public_id | Pro |
| `assets_pick_for_mockup` | 섹션 유형·기관 종류·스타일 고정·반복 방지로 묶음 선택 | use·target·style·n·session | Pro |
| `deck_convert` | 장표 변환 작업 생성(업로드 서명 URL 반환) → `deck_status` → `deck_result` | file_url 또는 upload_id·options | Pro+크레딧 / staff |
| `deck_wireframe` | 기획 글 → 장표 와이어(rows JSON + 미리보기) | plan 텍스트·tpl | Pro |
| `mock_search_sites` · `mock_get_site` · `mock_get_screen` · `mock_search_sections` · `mock_get_page_pattern` · `mock_get_section_pattern` · `mock_get_design_system` · `mock_get_krds_guide` · `mock_get_design_preferences` | 홈박스 현행 도구(이름만) | 현행 | 현행 |
| `mock_get_wireframe` **(신규)** | 레퍼런스·섞기 → 회색 와이어 HTML + rows JSON(섹션 유형 상자·가상 문구·칸 수) | ref·page·org_name·mix | Pro |
| `mock_check_wireframe` **(신규)** | 12칸 합·겹침·글 넘침·화면 종류 필수 섹션·자리표시 | rows JSON | Pro |
| `mock_get_replica_kit` | 시안 재료(현행) + `wire=` 입력 | 현행 + wire | Pro |
| `mock_check_mockup` · `mock_publish_mockup` | 판정·게시(현행) + **자산 출처·등급 검사** 추가 | 현행 | Pro |
| `mock_get_behavior_kit` · `mock_get_sample_images`(→ assets_pick 별칭) | 현행 | | |
| `guide_tokens` | 토큰을 css·tailwind·figma·json 으로 | format·skin | Free |
| `guide_parts` · `guide_krds` · `guide_rules` | 부품 코드·KRDS 대응·규칙 | id·framework | Free |
| `me_quota` | 내 키의 오늘 사용량·한도·크레딧 | — | 모두 |

### 3.2 한 흐름으로 이어지는 시나리오 (MCP 가 "서비스"가 되는 지점)
```
요청 "한빛시 메인 + 공지 목록 시안"
 1 mock_get_wireframe(ref=mix, org_name=한빛시)      → 와이어 2장(회색 상자·역할·칸 수) — 기획자가 보고 OK
 2 mock_check_wireframe(rows)                        → 통과
 3 mock_get_replica_kit(wire=…, zoom)                → 배치·색·메뉴·자산(assets_pick 이 세트 고정)·동작 규약
 4 AI 제작 → mock_check_mockup(html)                 → 점수·fixes·자산 출처 검사(internal 0)
 5 mock_publish_mockup(token)                        → 미리보기 주소 + 갤러리(81점+) + 포인트
 6 guide_tokens(format=css, from=mockup)             → 이 시안의 토큰을 가이드 형식으로 내려받기
 7 deck_wireframe(plan=…)                            → 같은 기관 제안서 장표 와이어까지
```
파워덱 변환 중 `assets_pick` 이 같은 세트를 고르면 **장표·홈페이지 시안·가이드 토큰이 한 톤**이 된다 — 이것이 통합의 체감 가치.

### 3.3 퍼포먼스 — 지금 느린 곳과 목표
| 지점 | 현재 | 목표 | 방법 |
|---|---|---|---|
| 재현 묶음 응답 크기 | 213KB(글) + 이미지 | 글 60KB | 섹션 inner 는 요청 섹션만, 규칙 문서는 `mock_get_rules` 로 분리(한 번만 받게), 참고 이미지는 서명 URL + 인라인은 2장 |
| 시안 판정 | 4~10초(chromium 1개) | 동시 4건, 큐 대기 표시 | 판정을 `core_jobs(kind=mock.check)` 로, 워커 2 프로세스, MCP 는 즉시 job_id 반환 후 `mock_check_status` 폴링 |
| 섹션 탐색·패싯 | 0.6~1.6초(덮는 인덱스 후) | 0.3초 | `mock_sections` 자주 쓰는 열 승격(§db) + 패싯 집계 표 `mock_facet_counts`(워커가 갱신, 요청 때 세지 않음) |
| 자산 검색 | PHP LIKE + 사전(파워플러스) | 50ms | Meilisearch 에 `asset_items` 색인(ko·en 태그 분리 필드, 동의어 사전은 Meili synonyms 로 이관, 오타는 Meili typo) — PHP 사전은 폴백 |
| 썸네일·MCP 축소본 | 요청 때 sharp/GD | 0 | 등록 때 파생 4종 사전 생성(thumb 360·card 720·mcp 900 워터마크·og 1200) → `asset_files` |
| 홈·랜딩 | 쿼리 6~8개 | 1 캐시 조회 | 등급별(`kind:plan`) 파일 캐시 60초, 워커가 갱신 이벤트에 무효화 |
| MCP 키 검증 | 매 호출 DB | 메모리 | Node 쪽 5분 캐시 + 폐기 시 `keys.revoke` 이벤트로 즉시 무효 |
| 배포 | 전체 복사·수십 초 500 | 무중단 | 옆 폴더 전개 → 심링크 교체(이미 홈박스 방식), 마이그레이션만 |
측정은 `core_metrics`(요청·도구별 p50/p95, 일 집계)로 상시 — 느려지면 숫자가 먼저 말한다.

## 4. DB — 설계 원칙과 DBA 운영 (상세 표 사전은 db-design.md)
- 엔진 MariaDB 10.11 · InnoDB · utf8mb4_unicode_ci · `sql_mode=STRICT_TRANS_TABLES`. 한 DB `powerplus`, 접두로 모듈 구분(`core_ asset_ deck_ mock_ guide_ comm_`).
- 모든 콘텐츠 표에 같은 6열: `public_id CHAR(16)`·`owner_user_id`·`org_id`·`visibility`·`created_at`·`updated_at`(+`deleted_at`). `Access::can()` 이 이 6열만 읽는다.
- 큰 JSON(홈박스 `sections.structure` 26만 행)은 **자주 조회하는 값을 열로 승격**(type·x·y·w·h·title·confidence)하고 나머지만 `extra JSON`. 집계는 승격 열 + 덮는 인덱스.
- 로그성 표(`asset_uses`·`core_api_usage`·`core_audit`·`deck_job_events`·`mock_crawl_jobs`)는 **월 파티션**(`PARTITION BY RANGE (TO_DAYS(created_at))`), 13개월 지나면 아카이브 표로 이동 후 DROP PARTITION.
- 읽기 패턴별 인덱스는 db-design.md 각 표에 "이 쿼리를 위해" 주석과 함께. 새 쿼리는 `EXPLAIN` 결과를 PR 에 붙인다.
- 운영: `slow_query_log=ON(1초)` + 주 1회 요약 / `innodb_buffer_pool_size` = RAM 의 25% / 바이너리 로그 켜고 **야간 전체 덤프 + 바이너리 로그로 시점 복구** / 덤프는 VM 밖(GCS 또는 사내 NAS)에 30일 / 월 1회 복구 리허설(빈 DB 에 덤프 넣고 `/api/v1/health?deep=1`).
- 이관은 `db/migrate-legacy/<모듈>.php` 가 옛 DB 를 **읽기 전용**으로 열어 새 표에 upsert — 멱등·건수 대조표 출력. 옛 DB 는 사내 출시 한 달 뒤까지 보존.

## 5. 보안 — 최선의 조합
### 5.1 인증·세션
- 비밀번호 없음: 이메일 OTP(6자리·10분·5회·IP 당 분 5회) + OAuth(구글·네이버·카카오, `email_verified` 만 연결 — G29). 세션 토큰은 DB 해시(`core_sessions`), 쿠키 `HttpOnly Secure SameSite=Lax`, 30일, 기기별 행(마이페이지에서 기기 로그아웃).
- API 키: 원문 1회 표시 + AES-256-GCM 보관(다시 보기), 검증은 sha256 — 홈박스 방식. `scopes`(모듈)·`plan`·일 한도·IP 허용 목록(선택).
- superadmin: `core_settings.superadmin_email` + 그 계정이 **OAuth 세션으로** 로그인했을 때만(OTP 세션은 admin 까지).

### 5.2 권한 — 출구 전부가 한 함수
- `Access::can(Actor, Content, action)`: visibility(internal/partner/pro/free/public/private) × actor.kind/plan/roles × owner/org. 모듈은 이 함수만 호출. 검색·MCP·공유 링크·갤러리·RSS·사이트맵·썸네일 URL 까지 **같은 함수**(G30 재발 방지).
- 파생물 동기화: `core_events(content_id, 'visibility.changed')` → 워커가 Meili 문서 삭제·공개 썸네일 삭제·캐시 무효화·OG 이미지 삭제. 이벤트 처리 전까지 `Access` 가 파생물 URL 에 서명을 안 붙이므로 창은 0.
- 외부 Free 계정으로 **전 출구 자동 실측 스크립트**(`scripts/leak-audit.mjs`): 랜딩·검색·세트·MCP 22도구·공유·갤러리·RSS·sitemap 을 돌려 internal/pro 자산 URL 0건 확인 — 사내 출시·외부 개방 관문의 필수 통과 항목.

### 5.3 입력·파일
- 업로드(장표 pptx·이미지·아바타): 확장자+매직넘버 검사 → ClamAV(`clamd` 소켓) → 격리 폴더 → 잡으로 파생 생성. 웹루트 밖 `storage/`, 서빙은 PHP 서명 URL(10분) 또는 `X-Sendfile`.
- 시안 HTML(사용자 콘텐츠): 게시 주소는 **같은 도메인 하위 경로** `powerplus.hom2box.com/p/{token}`(사용자 결정 2026-10-06 — 별도 도메인 없음, 모든 서비스는 하나의 도메인 아래 경로). 같은 출처라도 응답에 CSP `sandbox allow-scripts allow-popups`(`allow-same-origin` 없음)를 붙이면 시안 안 스크립트의 origin 이 null 이라 세션 쿠키·`/api` 호출이 막힌다(홈박스 현행 실측). 추가로 `/p/*` 는 `Set-Cookie` 를 절대 내지 않고, 게시 응답은 `X-Robots-Tag: noindex`. 판정 브라우저는 `netguard`(사설·루프백·메타데이터 차단)·`--no-sandbox` 제거(워커 전용 사용자로 실행).
- 변경 요청 전부 `X-Requested-With` + JSON 본문 + `SameSite=Lax` → CSRF 토큰 없이도 폼 POST 차단. OAuth state 는 세션 저장·1회.
- 레이트리밋 `core_rate(ip|user|key, bucket)` 메모리/파일 — OTP·삭제요청·검색·MCP 도구별.

### 5.4 운영·배포·시크릿
- 시크릿은 `api/config.php`(git 제외, 600, www-data) 하나 — 관리자 화면은 "있음/없음"만. 백업 사본(`config.php.bak`) 금지(G32). 배포 번들에서 `.pem .env .bak .sql` 차단은 Apache 규칙 + 번들 생성 단계 둘 다.
- 감사 로그 `core_audit`(who·what·target·before·after·ip) — 관리자 쓰기 API 전부, 2년 보존. 접속 로그 3개월.
- 의존성: `pnpm audit`·`composer audit` 를 CI 에, Node·PHP 는 LTS 고정. 외부 호출은 OpenRouter 하나(실서비스) — 키는 서버 config 만, 사용량 상한 일 $ 값(goBlog 과금 교훈).
- 개인정보: IP 는 마지막 옥텟 0 으로 저장, 탈퇴 시 즉시 삭제·콘텐츠 익명화, 결제 기록 5년(플래그 켜진 뒤).

## 6. 제작 순서(이 문서 기준) — 각 단계의 "끝" 증거
| 단계 | 만드는 것 | 끝 증거 |
|---|---|---|
| S1 뼈대 | 모노레포·api/Core·`db/schema.sql`(core_ 전부)·Access::can·OTP/OAuth·마이페이지 프로필 | 외부 메일·회사 메일 둘 다 가입, staff/external 분류, `leak-audit` 가 돌아감(대상 0) |
| S2 자산 | asset_ 표·이관(파워플러스 + 홈박스 샘플 2,204)·검색(Meili)·애드인 로그인 교체·/assets 랜딩 | 애드인에서 홈박스 샘플이 검색됨, 중복 파일 0, 랜딩 internal 0 |
| S3 powerMock 이식 | mock_ 표 이관·MCP 이름 변경(별칭)·`assets_pick` 연결·판정 큐 | 재현 묶음이 자산 서비스에서 이미지를 받음, 판정 p95 15초 |
| S4 와이어프레임 | packages/wire·`mock_get_wireframe/check`·편집 화면·파워덱 Wire 를 공용 엔진으로 | 같은 rows JSON 으로 장표·웹 와이어 둘 다 렌더 |
| S5 파워덱·가이드 편입 | deck_ 표·크레딧(플래그 뒤)·엔진 REST 키·guide_ 표·토큰 스키마 | 변환 1건 끝까지, guide_tokens 가 레퍼런스 토큰을 내려줌 |
| S6 관리자·커뮤니티·통합 검색 | §9 관리자(sidebar-09)·audit·comm_ | 관리자 세 벌 → 하나, audit 행 생성 |
| 사내 출시 | 한 달 | KPI 7종·leak-audit 통과 |
