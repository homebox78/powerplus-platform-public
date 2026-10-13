# powerMCP "재료 제공 + 사용자 AI 제작 + 내 서버 판정" 연구 (2026-10-07)

읽기 전용 조사. 근거는 파일:줄. 원가는 로컬 DB(운영에서 내려받은 옛 powerDeck `deck_ai_usage`) 실측.

## 0. 결론 먼저
- **된다.** powerDeck 의 기획·대본·와이어프레임은 이미 "AI 가 JSON 을 쓰면 서버가 결정적으로 계산·검사"하는 구조라 powerMock 의 replica_kit/check_mockup 모양으로 그대로 뺄 수 있다.
- **서버 과금의 47%는 장표 제작 에이전트(Opus)다.** 기획 글(eplan)이 35%, 시안 이미지가 10% 안팎이다. 앞단(기획·와이어·대본)을 사용자 AI 로 넘기면 글 비용은 거의 0이 된다.
- 단, **pptx 렌더와 글줄 실측은 서버에 남아야 한다.** 마스터 틀·서체 수치표·LibreOffice 렌더·자산 교체는 사용자 AI 가 못 한다. 이 부분은 원가가 거의 0(CPU)인 결정적 단계라 크레딧으로 받기 좋다.
- powerAssets·powerGuide 도구는 지금도 LLM 과금이 없다. powerMock 도 판정의 브라우저 렌더(CPU)뿐이다. 실제 돈이 나가는 곳은 powerDeck 하나다.
- 가이드와 목업은 **메뉴는 나누고, MCP 재료는 하나로 합친다**(가이드가 토큰·부품의 정본, 목업 재료가 그것을 참조).

## 1. powerDeck 파이프라인 — 단계별 원가와 분리 가능성

### 1.1 실측 원가 (deck_ai_usage, kind 별)
| kind | 호출 | 합계 $ | 건당 $ | 모델 | 실제 청구? |
|---|---|---|---|---|---|
| engine (장표 제작 에이전트) | 9 | 56.91 | **6.32** | claude-opus-5-5(×3 병렬 포함) | 구독 환산(AiKeys.php:450 SUBS_SQL) — API 로 바꾸면 실청구 |
| eplan (기획, CLI) | 99 | 42.34 | 0.43 | Opus/Haiku | 구독 환산 |
| image (시안 이미지, OpenRouter) | 99 | 7.46 | 0.075 | openai/gpt-image-2.5-flare 등 | **실청구** |
| edigest (자료 정리, CLI) | 12 | 6.74 | 0.56 | Sonnet(design.py:63 CLI_MODEL) | 구독 환산 |
| hf (Higgsfield 이미지) | 48 | 5.13 | 0.11 | gpt_image_2_5·nano_banana_2 | 구독 크레딧 |
| plan (OpenRouter 글) | 16 | 1.91 | 0.12 | muse·gemini 등 | 실청구 |
| digest (OpenRouter) | 6 | 0.73 | 0.12 | | 실청구 |
| script (대본·예상 질문) | 10 | 0.14 | 0.014 | | 실청구 |

글 기본 모델은 `meta/muse-spark-1.3-contributor`(AiKeys.php:32), 추론 강도는 기획 xhigh·제작 high(AiKeys.php:114~120). muse 로 돌면 기획 한 번 $0.0001 수준이라, **실제 비용 위험은 '장표 제작 에이전트를 API 로 돌리는 순간'**이다(작업당 $6 내외). 지금은 구독(CLI)이라 숨어 있다.

### 1.2 단계별 표 — 지금 / 재료형으로 뺄 수 있나 / 서버에 꼭 남는 것
| 단계 | 지금 서버가 하는 일 (근거) | 재료형 분리 | 서버에 남을 것 |
|---|---|---|---|
| ① 자료 정리(digest) | 업로드 글·pptx·md 를 16만 자까지 읽어 요약(design.py:533 load_context, :588 digest_context, :607) | **가능.** 사용자 AI 가 자기 자료를 이미 들고 있다. 서버는 "요약 형식·필수 항목(사업명·발주처·평가항목·수치)" 재료만 준다 | 파일 텍스트 추출(pptx_text design.py:202, doc_text :452)은 사용자가 파일만 있을 때 필요 → 무료 도구로 |
| ② 기획(plan) | 장 나누기·장별 title/message/type/device/layout/scene/content(design.py:824 make_plan, :721 plan_in_stages, :619 parse_plan_md) | **가능.** 재료 = 기획 규칙·장 유형·장치 목록·예시 기획 2~3개·JSON 스키마. 사용자 AI 가 plan.json 작성 | 결정적 검사: 장 수·필수 필드·수치 누락(design.py:1284 fact_check 를 서버 판정으로) |
| ③ 대본·예상 질문 | 장별 목표 초 계산 후 AI 호출(Script.php:226 make, :274·:136·:324 AiKeys::ask) | **가능.** 목표 초 배분은 결정적 코드(Script.php:244~258)라 재료로 그대로 내줄 수 있다 | 시간 계산(paused :157, secOf :174)·문서 렌더(md :499, html :539) — 무료 |
| ④ 와이어프레임 | AI 가 rows/cols/tpl JSON 을 쓰고(WireAi.php:43, 규칙 prompt_wire.md) 서버가 좌표 계산(WireLayout.php:333 fromAi, :258 applyTpl, :109 build)·검사(:344 check — 헤드라인 침범·화면 밖·겹침·글 넘침·빈 상자·자리표시·같은 크기 나열·결론 띠 중복·기획 수치 누락) | **가장 쉽다.** 이미 "AI JSON → 서버 결정적 계산·검사" 구조. 재료 = prompt_wire.md + 틀 12종(wire_templates.json) + 예시. 판정 = fromAi+check | 좌표 계산·check·SVG/PNG 미리보기(design.py:1100 wire_png) — CPU |
| ⑤ 시안 이미지 | 이미지 모델 호출(design.py:1337 make_mockup, :1531 gen_image, Higgsfield :1620) | **부분 가능.** 사용자 AI 가 이미지 생성 도구가 있으면(ChatGPT 이미지·Gemini) 재료 = IMAGE_TEMPLATE·스타일 필드·덱 앵커 이미지. 없으면(Claude) **HTML/SVG 시안**으로 대체 가능 | 이미지 생성을 서버에서 하면 그대로 크레딧. 시안을 HTML 로 받으면 렌더·판정만 |
| ⑥ 장표 pptx 제작 | Opus 에이전트가 시안 실측→python-pptx 로 조립→LibreOffice 렌더→대조(prompt_design.md:1~8, worker.py:586 build_parallel, :49 build_model) | **불완전.** 사용자 AI 가 pptx 를 직접 만들 수는 있으나(claude.ai 코드 실행) 마스터 틀·서체 수치·자산 교체·글줄 실측을 못 한다 | **서버 고정:** 슬라이드 마스터(고정 틀), ppt_metrics.json 서체 글줄 수치(ppt_metrics.py 1~10행 — PowerPoint 실측표), vcenter·finalize(세로 가운데·고아 줄), LibreOffice 렌더(lo.py), powerPlus 자산 교체, 로고 배치 |
| ⑦ 판정 | 재검수 9×10 점수표(stages.ts STAGES '재검수'), 자동 탐지 56항목 | **판정만 서버에** — 이게 '내 서버의 가치' | 렌더 + 규칙 판정 |

**핵심 대안 — ⑥을 "명세 → 서버 조립"으로 바꾼다.** 사용자 AI 는 pptx 바이너리 대신 **장표 명세 JSON**(와이어 좌표 + 글 + 자산 id + 색 역할)을 보내고, 서버가 결정적 코드(python-pptx + 마스터 + ppt_metrics + finalize)로 조립·렌더한다. 이러면 LLM 0, 서버는 CPU 렌더만. 와이어 JSON 이 이미 x·y·w·h·k·t·d 를 가지므로(WireLayout.php:344 check 가 쓰는 필드) 명세의 뼈대는 있다. 빠진 것은 "상자 종류(k)별 pptx 그리기 함수"(panel·card·table·flow·gantt·phase·kpi·badge·band) — 새로 만들 일.

## 2. 제안 도구 (deck_ 접두)
| 도구 | 입력 | 출력 | 과금 |
|---|---|---|---|
| deck_extract_text | 업로드 토큰 또는 파일 URL | pptx·docx·pdf·md 본문 텍스트(장별) | 무료(일 한도) |
| deck_get_plan_kit | 목적(발표·제안요약·보고), 장 수, 업종 | 기획 규칙·장 유형·장치 목록·JSON 스키마·예시 기획 2~3개·자주 틀리는 점 | 무료 |
| deck_check_plan | plan JSON (+자료 원문 선택) | 점수·fixes(장 수·필수 필드·수치 누락 fact_check·장 유형 편중), token | 무료~저가 |
| deck_get_wire_kit | plan token 또는 장 목록 | prompt_wire.md 규칙, 틀 12종 정의, 상자 종류 표, 예시 와이어 JSON | 무료 |
| deck_check_wireframe | rows/tpl JSON(장별) | fromAi 좌표 + check 지적 + **SVG 미리보기**(wire_png 를 SVG 로) + token | 무료(결정적, 아주 쌈) |
| deck_get_script_kit | plan/deck token, 발표 분 | 장별 목표 초 배분·대본 형식·예상 질문 형식 | 무료 |
| deck_check_script | 대본 JSON | 장별 초 초과·빠진 장·수치 불일치 | 무료 |
| deck_get_design_kit | token, 강조색, 디자인 타입 | 스타일 필드·이미지 프롬프트 틀(IMAGE_TEMPLATE)·덱 앵커 규칙·추천 powerAssets 세트 | 무료 |
| deck_render_mockup | 와이어 token + 디자인 타입 | 서버가 이미지 모델로 시안 1장(사용자 AI 에 이미지 생성 도구가 없을 때) | **크레딧 1/장** |
| deck_render_pptx | 장표 명세 JSON(와이어 좌표+글+자산 id+색 역할) | 서버 결정적 조립 pptx 다운로드 링크 + 장별 렌더 PNG + 자동 탐지 결과 | **크레딧 1/장**(CPU, LLM 0) |
| deck_check_deck | pptx 업로드 또는 render token | 9×10 점수표·고칠 목록(넘침·고아 줄·서체·색 수) | 크레딧(렌더 비용) |
| deck_jobs (기존, index.ts:782) | — | 웹에서 맡긴 작업 목록 | 무료 |

기존 서버 완성형(웹 /deck 업로드 → 엔진이 끝까지)은 **"맡기기(풀 서비스)" 상품**으로 남긴다 — 사용자 AI 가 없는 사람, 원본 pptx 정리(톤 통일·자산 교체)처럼 사람 손이 많이 드는 일.

### 산출물 형식의 현실성
| 산출물 | claude.ai | ChatGPT | Claude Code·Cursor |
|---|---|---|---|
| 기획·대본(마크다운·표) | ○ 바로 | ○ | ○ |
| 와이어프레임 SVG | ○ 아티팩트로 렌더(SVG 는 외부 리소스 없어 안전) | △ 캔버스에 코드로 | ○ 파일 |
| 시안 HTML | ○ 아티팩트 — 단 **외부 이미지 차단**(2026-10-01 홈박스 교훈) → 게시 주소(/p/{token})로 보여 줘야 한다 | △ | ○ |
| 시안 이미지 | ✕(Claude 는 이미지 생성 없음) → deck_render_mockup | ○ 자체 생성 가능 | ✕ |
| pptx | △ 코드 실행으로 직접 만들 수 있으나 마스터·서체 수치 없음 → **다운로드 링크(deck_render_pptx)가 현실적** | △ 동일 | ○ 링크 |
MCP 응답 이미지는 base64 image 블록으로 넣으면 claude.ai·ChatGPT 모두 보여 준다(mock_check_mockup 이 이미 그렇게 함, index.ts:548~595). 큰 파일은 서명 다운로드 URL.

## 3. 다른 모듈 — 서버 과금 있는 도구 / 없는 도구
| 모듈 | 도구 | 서버 비용 | 성격 |
|---|---|---|---|
| powerAssets | assets_search·get·similar·style_set·list_categories·list_topics·suggest_keywords (index.ts:690~766) | DB 조회뿐(0) | 이미 재료형 |
| powerGuide | guide_tokens·guide_krds (index.ts:662, :767) | 0 | 재료형 |
| powerMock | get_replica_kit·design_brief·section/page_pattern·sample_images·behavior_kit 등 | 0(DB·파일) | 재료형 |
| powerMock | get_main_mockup·build_homepage·assemble_screen·get_page_code | 0(결정적 PHP 조립, LLM 없음) | 서버 제작이지만 무료 원가 |
| powerMock | **check_mockup** | 헤드리스 브라우저 렌더 수십 초(CPU·메모리) | 판정 → 크레딧 후보 |
| powerMock | publish_mockup | 저장·트래픽 | 저가 |
| powerDeck | deck_jobs | 0 | (실제 제작은 웹 작업에서 과금) |

### 재료형으로 더 줄 수 있는 것
- **powerAssets**: 세트 단위 묶음(assets_get_set_kit — 한 세트 아이콘 전부 + 쓰임 규칙), 장표용 자산 추천(deck 와이어 상자 k 별 추천 자산), 부족 자산 요청 도구(assets_request — content_requests 로 바로).
- **powerMock**: 와이어 단계 신설(mock_get_wire_kit/mock_check_wireframe — deck 와 같은 packages/wire 엔진, §22 B1), 레퍼런스 토큰을 powerGuide 형식으로(get_design_system 출력 통일).
- **powerGuide**(지금 2개뿐 — 줄 수 있는 게 많다):
  - guide_get_component — 부품 77종의 React/Vue 소스·사용법·KRDS 지침(키트 빌드 산출물 kit-files/docs·r 이 이미 있음)
  - guide_search_rules — KRDS 지침 723문장·접근성 체크리스트 검색
  - guide_get_accessibility_checklist — 화면 종류별 KWCAG 2.2 항목
  - **guide_check_code** — 사용자 AI 가 만든 HTML/JSX 를 토큰 사용·대비·포커스·라벨·터치 영역으로 판정(axe + 토큰 규칙). 목업 판정과 같은 렌더 서버를 공유 → 크레딧
  - guide_get_tokens(형식 선택) — guide_tokens 의 개선판(역할별 해석·다크 포함)

## 4. 가이드와 목업 — 합칠까
| 안 | 장점 | 단점 |
|---|---|---|
| A. 완전 합침(메뉴·도구 하나) | 사용자 입장 "규칙 → 부품 → 시안"이 한 흐름. 토큰 이중 관리 없음 | powerGuide 는 **무료 유입 입구**(기획 §13.2-1)·SEO 대상이고 powerMock 은 Pro 상품 — 합치면 무료/유료 경계가 흐려진다. 메뉴 하나가 지나치게 커진다 |
| B. 완전 분리(지금) | 경계 명확 | 토큰·부품이 두 곳(guide_tokens vs mock_get_design_system·키트)에서 따로 나가 어긋난다 |
| **C. 메뉴는 분리, MCP 재료는 한 정본(추천)** | 가이드 = 토큰·부품·규칙의 **정본**(무료), 목업 재료(replica_kit)는 그 정본을 **참조 id 로** 싣는다. 목업 판정과 가이드 코드 판정이 같은 렌더 엔진·같은 규칙을 쓴다 | 정본 형식(토큰 JSON·부품 id) 하나를 먼저 정해야 함 |

**추천 C.** 이유: ① 기획에서 가이드는 무료 입구, 목업은 Pro 로 이미 갈라 놓았다(§13.2-1) ② 실제 겹치는 것은 '토큰과 부품'뿐이라 데이터만 합치면 된다 ③ 사용자 AI 에게는 "목업을 만들 때 부품은 guide_get_component 로" 한 줄로 흐름이 이어진다. 도구 이름: 가이드는 guide_* 그대로(정본), 목업 재료 응답에 `components: [{id, guide_tool:"guide_get_component"}]`·`tokens_ref` 필드. 판정은 mock_check_mockup(시안 전체) / guide_check_code(부품·화면 조각)로 역할을 가른다.

## 5. 과금 모델
| 구분 | 도구 | 과금 | 근거 |
|---|---|---|---|
| 재료 | *_kit, assets_*, guide_get_*, mock_get_* | **무료**(Free 는 일 한도·요약판, Pro 는 원본·이미지) | 원가 0, 사용자를 끌어들이는 역할 |
| 결정적 판정 | deck_check_plan·wireframe·script | **무료**(일 한도 큼) | 원가 거의 0, 품질 학습 데이터가 쌓인다 |
| 렌더 판정 | mock_check_mockup·guide_check_code·deck_check_deck | **크레딧 0.2~1** 또는 Pro 일 N회 무료 | 브라우저·LibreOffice CPU |
| 렌더 산출 | deck_render_pptx(장당 1)·deck_render_mockup(장당 1) | **크레딧** | 이미지 생성은 실청구, pptx 는 CPU |
| 풀 서비스 | 웹 /deck 맡기기(엔진 끝까지) | 장당 크레딧(§15.2 1장=1크레딧 500원) | Opus 에이전트 건당 ~$6 — 단가 유지 필요 |

남용 방지:
- 키별 일 한도(core_api_usage 이미 있음) + **도구별 별도 한도**(판정·렌더는 따로 셈).
- 같은 token 재판정은 edits 만 허용(이미 mock 이 함) → 76KB 재전송 차단. 같은 내용 해시면 이전 결과 반환(캐시).
- 판정 동시 실행 키당 1, 서버 전체 큐(설계서 §5 워커 2개).
- 재료 응답은 등급별 캐시(같은 쿼리 재사용).
- 크레딧 0 이면 판정은 "요약 점수만"으로 강등(막지 않고 줄임) — 사용이 끊기지 않게.
- 렌더 산출물은 30일 만료(publish 와 같은 정책).

## 6. 실행 순서와 합격 기준
| 단계 | 내용 | 합격 기준 |
|---|---|---|
| 1 | **deck 와이어 재료·판정**: packages/wire 로 WireLayout(fromAi·applyTpl·build·check)과 prompt_wire.md·틀 12종을 떼어 deck_get_wire_kit·deck_check_wireframe(SVG 미리보기) 신설. mock 와이어(§22 B1)도 같은 엔진 | claude.ai 에서 기획 글 → 와이어 5장을 사용자 AI 가 만들고 check 지적 0, 웹 화면 와이어와 좌표 같음. 서버 LLM 호출 0 |
| 2 | **기획·대본 재료·판정**: deck_get_plan_kit·deck_check_plan(fact_check)·deck_get_script_kit·deck_check_script, deck_extract_text | 같은 원본 2종(식약처 4장·OO시 낱장)으로 사용자 AI 기획이 서버 기획과 장 수·필수 수치 일치 90%+, 사용자 OK |
| 3 | **guide 확장**: guide_get_component·guide_search_rules·accessibility_checklist + mock 재료에 정본 참조 | 목업 시안이 부품을 guide 에서 가져와 토큰 하드코딩 0, mock_check 통과율 하락 없음 |
| 4 | **deck_render_pptx(명세 → 결정적 조립)**: 상자 종류별 pptx 그리기 함수 + 마스터 + ppt_metrics·finalize + LibreOffice 렌더 | 같은 와이어 명세로 만든 pptx 를 기존 엔진 결과와 나란히 비교해 사용자 OK, 자동 탐지 결과 넘침·고아 줄 0, 장당 렌더 30초 이내, LLM 0 |
| 5 | **시안 단계**: deck_get_design_kit + deck_render_mockup(크레딧) + HTML 시안 경로(게시 주소로 미리보기) | 이미지 없는 클라이언트(Claude)에서도 시안 확인 가능, 크레딧 차감·환불 기록 정확 |
| 6 | **과금·한도**: 도구별 한도·크레딧 차감·캐시, 관리자 사용 통계(도구별) | 일 한도 초과 429, 크레딧 원장과 사용 로그 일치, leak-audit 0 |
| 7 | **풀 서비스와의 관계 정리**: 웹 /deck 은 "맡기기", MCP 는 "직접 만들기"로 안내(/mcp 페이지) | 두 경로 모두 같은 plan/wire JSON 형식을 써서 중간에 갈아탈 수 있음(MCP 로 기획 → 웹에서 마무리) |

## 7. 위험·주의
- **장표 품질의 핵심은 ⑥(시안을 그대로 pptx 로 옮기는 에이전트)이다.** 명세 → 결정적 조립(4단계)이 지금 에이전트 품질에 못 미치면, 렌더만 서버로 남기는 구조가 품질 저하로 보인다 → 4단계는 나란히 비교로 판단, 미달이면 "명세 + 서버 에이전트(크레딧 높게)" 하이브리드.
- 사용자 AI 가 만든 plan 에 사실 오류가 섞일 수 있다 → deck_check_plan 의 수치 대조를 필수 게이트로.
- 재료에 사내 자료(internal 템플릿·제안서 장표)가 섞이지 않게 모든 *_kit 응답이 Access::can 을 지난다(G30 교훈).
- 서버 엔진은 아직 옛 /powerDeck REST 를 본다(§21) — 1단계 전에 엔진 새 REST 연결이 선행.
