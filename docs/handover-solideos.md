# solideos(Solid Flow) → powerGuide 인계서

| | |
|---|---|
| 넘기는 것 | `D:\solideos` — SOLIDEO Design System, 내부명 Solid Flow, HEAD `5dcdb89` v1.3.2 |
| 받는 곳 | `powerplus-platform` 의 **powerGuide** 메뉴 (`/guide/`), 기획 `docs/PLAN.md` §4 · P4 |
| 작성일 | 2026-10-06 |
| 같이 읽을 것 | `docs/inventory/solideos.md` — **무엇이 들어 있나**(토큰 194개·산출물 15종·부품 29개 등 목록). 이 문서는 겹치지 않게 **어떻게 넘기고 무엇이 충돌하나**만 적는다 |

---

## 0. 한 장 요약

Solid Flow 는 **문서 사이트 하나가 아니라 "토큰 원본 + 생성기 + 검사기"** 다. 화면은 그 결과를 보여주는 껍데기에 가깝다. 이관의 본체는 다음 셋이고, 나머지는 선택이다.

1. `tokens/tokens.json` (194개) + `tokens/build.mjs` (530줄, 의존성 0) → 산출물 15종
2. `npm run check` 게이트 — 토큰 생성 → 아이콘 → CSS 검증 → KRDS 생성 → 대비 검증 → 폐쇄망 감사
3. KRDS 대응 데이터 (`app/src/data/krds.ts` 82KB, `krds-patterns.ts` 26KB) + 수집 캐시

**가장 조심할 것 — 이 셋은 그냥 옮기면 깨진다.**

| 충돌 | 지금 | 플랫폼 | 처리 |
|---|---|---|---|
| 라우터 | HashRouter (감사 규칙 `DEPLOY-01` 이 BrowserRouter 를 **금지**) | 통합 라우터 RR8 = BrowserRouter | §6-① — 규칙을 지우지 말고 **범위를 가를 것** |
| 브랜드색 | 토큰 이름이 `crimson` 자체, `build.mjs` 에 하드코딩 | 공용 규칙이라 회사색 제거 대상 | §4 — 이름까지 바꾸면 산출물 15종 전부 영향 |
| 치수 규칙 | `PARITY-01` 이 `h-8~11`·`rounded-md/lg` 를 금지 | 외관 베이스는 홈박스 | §6-② — powerGuide 하위로 범위 한정 |

---

## 1. 지금 상태

- **운영 중**. 현 개발 VM 의 정적 경로 `/solideos` 에 빌드 산출물만 올라가 있다(주소는 `docs/PLAN.md` §1). 응답 200 확인(2026-10-06).
- **저장소에 배포 스크립트가 없다.** `npm run build` 로 `app/dist` 를 만들어 tar → scp → 서버에서 해제하는 수작업이다. SSH 키는 저장소 밖 작업자 PC 에 있다. → **이관 담당자가 서버 접근 권한을 따로 넘겨받아야 한다.**
- 백엔드·DB·로그인 **없음**. 정적 사이트라 이관 시 데이터 마이그레이션이 없다. 이게 네 저장소 중 가장 가벼운 이유다.
- 커밋 3개뿐(`5dcdb89` v1.3.2 / `bbbcceb` Pretendard 통일 / `ba3e056` 초기 v1.3.1). 이력에서 얻을 맥락이 거의 없으니 **이 문서와 인벤토리가 사실상 전부**다.

---

## 2. 가져갈 것 / 손볼 것 / 버릴 것

### 그대로 가져간다 (의존성 0, 손댈 이유 없음)
| 대상 | 비고 |
|---|---|
| `tokens/build.mjs` · `tokens/verify.mjs` | Node 내장만 쓴다. 폐쇄망 전제라 패키지를 안 쓴 것이 그대로 장점 |
| `tools/build-krds.mjs` · `build-krds-patterns.mjs` + `tools/krds-cache/` 3파일(약 500KB) | 캐시가 있어 **네트워크 없이 재생성**된다. 원문 갱신 시 `--fetch` |
| `tools/audit-offline.mjs` | 규칙 7종. §5 참조 — 이 저장소에서 가장 값진 산출물 |
| `tools/build-components-css.mjs` · `build-icons.mjs` · `build-react-kit.mjs` | |
| 문서 **콘텐츠** (Foundations · Patterns · UX Writing · AI Interaction 본문) | 회사색만 걷으면 그대로 SI 공용 규칙 |
| KRDS 대응표·지침 데이터 | KRDS 55종 중 45종 대응 + 기본 패턴 12/12 |

### 손봐서 가져간다
| 대상 | 손볼 내용 |
|---|---|
| `tokens.json` | `crimson` 9단계를 중립 이름으로(§4). semantic 41개는 이름이 이미 중립이라 그대로 |
| 문서 화면 8개 | HashRouter 제거, 홈박스 틀 안으로 편입. `app/src/data/ia.ts`(357줄) 한 곳만 고치면 GNB·LNB·검색이 따라오는 구조는 **유지할 것** |
| `css/solideo-components.css` (517줄, `.sds-*` 73클래스) | 접두 이름 결정 필요(§7-③) |
| 스타터 킷 `starters/html/` | "사내 스타터"가 아니라 "SI 공용 예시"로 문구 교체 |

### 버린다
| 대상 | 이유 |
|---|---|
| `myDev/` · `CLAUDE.local.md` · `.playwright-mcp/` | 개인 컨텍스트. 이식 금지 |
| `GovBanner.tsx` (전자정부 배너, `App.tsx:38`) | 공공 사업 전용. powerGuide 는 공용이므로 **부품 카탈로그의 한 항목**으로 내리고 사이트 상시 노출은 제거 |
| `app/src/data/library.ts` | 사내 부서명·내부 링크가 섞여 있다. 자산 목록 자체는 powerAssets 와 역할이 겹치니 **이관하지 말고 powerAssets 로 흡수** |
| `package.json` name `@solideo/design-system` | 패키지명 재정의 |
| `app/public/tokens/tokens.json` 사본 | 빌드가 다시 만든다 |

### 판단 보류 — 홈박스 키트와 겹침
`docs/PLAN.md` §4 의 **검토 기준 3개**(토큰 체계가 하나로 합쳐지는가 / 홈박스 MCP 조립이 깨지지 않는가 / SSR·접근성 검사 결과가 유지되는가)로 P4 에서 실측 후 결정. 현황만 적는다.

- 이름이 겹치는 부품 약 33종(shadcn 23 + Toast·Field·Spinner·StepIndicator·StructuredList·CriticalAlert·InPageNav·GovBanner=masthead)
- **Solid Flow 에만 있는 것**: MaskedInput · Snackbar · Icon · VisuallyHidden · Scrollable · A11ySettings
- **키트에만 있는 것 약 40종**(alert-dialog · calendar · carousel · combobox · data-table · date-picker · drawer · file-upload · sidebar · slider · tag · toggle · tts …)
- 부품 수만 보면 **키트가 넓다**. Solid Flow 의 비교우위는 부품이 아니라 **토큰 생성기·검사기·KRDS 데이터**다. 합칠 때 이 점을 기준으로.

---

## 3. 이관 순서 (권장)

> 화면부터 옮기면 토큰이 두 벌이 되어 되돌리기 어렵다. **생성기 → 데이터 → 검사기 → 화면** 순서를 지킬 것.

1. **토큰 생성기 이식** — `tokens/` + `tools/build-*.mjs` 를 `packages/guide-tokens/`(가칭)로. 이 단계에서 `npm run check` 가 플랫폼 저장소에서 통과하는지부터 확인한다.
2. **브랜드 중립화**(§4) — 산출물 15종을 다시 굽고 `verify.mjs` 대비 검사 재통과 확인. 색을 바꾸면 **대비가 깨질 수 있다**(§5-① 사례).
3. **KRDS 데이터 이식** — 캐시 포함. `--fetch` 는 인터넷 되는 환경에서만.
4. **감사 규칙 범위 조정**(§6) — DEPLOY-01·PARITY-01 을 powerGuide 하위로 한정하고 플랫폼 CI 에 연결.
5. **화면 편입** — HashRouter 제거, 홈박스 틀 적용, `/guide/` 마운트. `ia.ts` 단일 원본 구조 유지.
6. **옛 주소 처리**(§9).

---

## 4. 회사 종속 제거 체크리스트

공용화의 90%는 **색 이름 하나**에 달려 있다. `#C12554` 는 `tokens.json:119` 가 원천이지만, **`crimson` 이라는 이름이 생성기 곳곳에 하드코딩**돼 있어 값만 바꿔선 안 된다.

- [ ] `tokens/tokens.json:119` — primitive 색 9단계
- [ ] `tokens/build.mjs` — `ALIASES` · `SHADCN` · Quasar · Tailwind · 고대비 · `DARK` 블록에 `crimson` 이름이 박혀 있다(참조 57곳). **이름을 바꾸면 이 6곳을 함께**
- [ ] "솔리데오/SOLIDEO" 문자열 약 50파일 — 주요 지점: `Resources.tsx`(33) · `library.ts`(17) · `package.json`(19) · `SiteFooter`(저작권) · `ia.ts`(org)
- [ ] `.sds-` 접두 73클래스 — §7-③ 결정 뒤 일괄
- [ ] `GovBanner` 상시 노출 제거(부품 카탈로그에는 남김)
- [ ] 스타터 킷 문구

**검증**: 바꾼 뒤 `npm run verify` 로 대비 재확인, `npm run audit` 로 잔여 참조 확인. 문자열 전수는 `git grep -i "solideo\|crimson\|C12554"`.

---

## 5. 넘기는 핵심 자산 — 검사 규칙과 그 이유

**이 저장소에서 가장 값진 것은 코드가 아니라 이 규칙들이다.** 전부 "실제로 결함을 잡아서" 생긴 것이라, 이유를 모르면 플랫폼에서 되돌리기 쉽다. 규칙마다 사연을 붙인다.

| 규칙 | 잡아낸 실제 결함 |
|---|---|
| `verify.mjs` 대비 4.5/3 | 입력 필드 테두리가 **2.23:1** 로 KWCAG 3:1 미달이었다 → gray.300 → gray.400. **색을 바꿀 때마다 다시 돌려야 하는 이유** |
| `A11Y-01` `text-[Npx]` 금지 | 토큰이 px 고정이라 **"글자 크게" 설정을 눌러도 본문이 안 커졌다**. 전량 rem 으로 전환 |
| `DEPLOY-01` BrowserRouter 금지 | 폐쇄망에 **정적 반입하면 새로고침 시 404**. rewrite 설정 없이 도는 환경이 실제로 있다 |
| `PARITY-01` `h-8~11`·`rounded-md/lg` 금지 | React 판 버튼 36px/8px, CSS 판 40px/4px 로 **두 판이 갈라져 있었다**. 문서가 정한 값을 React 가 어기고 있었음. 이후 `component.*` 토큰을 양쪽이 함께 읽게 함 |
| `CDN-01/02/03`, `NET-01` | 폐쇄망에서 폰트·아이콘·스크립트 외부 요청이 하나라도 있으면 화면이 깨지고 이용자 IP 가 밖으로 나간다 |
| `PII-01` 스토리지 키 | 개인정보가 `localStorage`·URL 에 남지 않게 |
| `build-components-css.mjs` 검사 4종 | 미정의 토큰 · 색 하드코딩 · px 글자 · 포커스 제거 |

**그 외 사연 있는 수정 — 같은 함정을 다시 밟지 않도록**

- Radix 의 Checkbox·Radio·Switch·Select 는 내부가 `<button>` 이라 **`<label>` 만으로는 이름이 안 붙는다**(35건 발견). `field.tsx` 가 그 구조적 해결책이다. 키트와 합칠 때 이 역할이 사라지지 않게 할 것.
- 체크박스 클릭 대상이 16px 라 WCAG 2.5.8(24px) 미달이었다 → **시각 크기는 두고 히트 영역만** 넓혔다.
- v1.3.2 에서 드러난 것: **"문서 사이트가 동작한다 ≠ 배포물이 동작한다."** 글자 크기 규칙이 문서 사이트 CSS 에만 있고 배포 토큰 CSS 에는 빠져 있어 HTML·JSP 에서 무효였다. 이관 후에도 **배포물만으로 검증**할 것.
- `dist/react/` 는 그래서 생겼다 — 문서는 `@/components/ui/button` 을 안내하는데 그 파일이 `app/` 안에만 있어 **실제로 가져다 쓸 수 없었다**.

---

## 6. 플랫폼과 충돌하는 지점

### ① DEPLOY-01 (BrowserRouter 금지) — 지우지 말고 가를 것
플랫폼은 서버 rewrite 가 있으므로 BrowserRouter 가 맞다. 하지만 **폐쇄망 정적 반입용 배포본**은 여전히 해시 라우팅이나 그에 준하는 대비가 필요하다. 규칙을 통째로 없애면 그 수요를 놓친다.
→ 권장: 규칙을 **"정적 반입 산출물에 한해 적용"** 으로 바꾸고, 플랫폼 웹앱은 예외로 명시.

### ② PARITY-01 — powerGuide 하위로 범위 한정
플랫폼 외관 베이스는 홈박스다. `h-8~11`·`rounded-md/lg` 금지를 플랫폼 전역에 걸면 홈박스 톤과 싸운다.
→ 권장: 감사 대상 경로를 powerGuide 와 그 배포 산출물로 한정.

### ③ 토큰이 두 종류라는 것을 잊지 말 것
`docs/PLAN.md` §13.1 정정대로 **플랫폼 UI 토큰(홈박스)** 과 **powerGuide 가 배포하는 SI 공용 규칙 토큰**은 **다른 산출물**이다. 이관 중 하나로 합치려는 유혹이 생기는데, 합치는 판단은 §4 검토 기준 3개로 P4 에서 실측한 뒤에.

---

## 7. 미완 · 미결정

**미완 (작업 남음)**
- Figma UI Kit · 실제 프로젝트 목업 — **코드로 만들 수 없다. 디자인팀이 올려 `library.ts` 에 등록**해야 했던 항목. 플랫폼에서는 powerAssets 로 흡수될 자리.
- 스타터 킷: HTML 완료 / **React·Quasar·Spring Boot 3종 미완**
- KRDS 서비스 패턴 5종(방문·검색·로그인·신청·정책 정보 확인) 원문 지침 미반영
- KRDS 미대응 컴포넌트 10종(캐러셀·코치마크·음성지원 등) — **키트에 있는 것이 겹치니 합칠 때 같이 해소될 수 있다**
- `ia.ts` 상태값 기준 `wip` 6 · `todo` 4 (Date Picker · File Upload · Help Panel · Context Panel · 음성 입력 등)

**미결정 (받는 쪽이 정해야 함)**
1. 브랜드색 중립 이름 — `brand` / `primary` / 그 외. 15종 산출물의 변수명이 전부 따라간다.
2. 크림슨을 **"예시 스킨"으로 남길지 완전히 뺄지**(PLAN §4 는 "걷어내거나 예시 스킨으로 내린다"로 열어 뒀다).
3. `.sds-` 접두를 무엇으로 바꿀지 — 73클래스 + 문서 예시 전부 영향. 안 바꾸는 선택도 가능(SOLIDEO Design System 의 약자라는 것을 모르면 중립적으로 읽힌다).
4. 홈박스 키트와의 통합 여부 — §2 "판단 보류".

**문서 수치 불일치 (옮기기 전에 바로잡을 것)**
README 는 "67종 중 64종(96%)" 이라 하고 `krds.ts` 는 "55종 중 45종"이다. 분모가 다르다(컴포넌트 55 + 기본 패턴 12 = 67 기준인 듯하나 미확인). **공용 서비스의 공개 지표가 되므로 확정 후 표기**.

---

## 8. 외부 의존 · 라이선스

| 항목 | 상태 |
|---|---|
| **KRDS 원문** (krds.go.kr) | 캐시 3파일을 저장소에 커밋해 두었다. 정부 공개 자료지만 **라이선스 표기를 확인해 powerGuide 에 고지**해야 한다(`docs/PLAN.md` §15 #7 에도 같은 지적) |
| **Pretendard** | `app/public/fonts/` 에 woff2 4종 로컬 번들(OFL). CDN 안 씀 |
| **Material Symbols** | 쓰는 아이콘만 path 인라인(39개, `icons.generated.ts`). 폰트 파일 자체는 안 들어간다 |
| npm 런타임 의존 | 토큰·검사 파이프라인은 **의존성 0**. 의존성은 문서 사이트(React 19 · Vite 8 · Tailwind v4 · radix-ui)에만 |

---

## 9. 서비스 종료 절차

1. powerGuide `/guide/` 가 현 문서 사이트의 내용을 **대체했는지 확인**한 뒤에 진행(먼저 내리지 말 것 — 사내 SI 프로젝트가 참조 중일 수 있다).
2. 현 VM 정적 경로 `/solideos` → `/guide/` **301 리다이렉트**. HashRouter 라 기존 북마크가 `#/foundations` 형태이므로, **해시는 서버에 전달되지 않는다** → 경로 단위 리다이렉트만 가능하고 깊은 링크는 `/guide/` 홈으로 떨어진다. 주요 앵커는 안내 페이지를 두거나 JS 로 해시를 읽어 재매핑할 것.
3. `D:\solideos` 저장소는 **참조 전용으로 보존**(PLAN §16 — 기존 저장소는 손대지 않는다). 아카이브 표시만.
4. 산출물을 쓰고 있던 사내 프로젝트가 있다면 **새 토큰 패키지 경로를 공지**해야 한다. 현재 `@solideo/design-system` 으로 참조 중인 곳이 있는지 확인 필요(이 저장소만으로는 알 수 없다).

---

## 10. 인수인계 확인 목록

- [ ] 현 VM `/solideos` 배포 권한(SSH 키) 인수 — 저장소에 없다
- [ ] `npm run check` 가 플랫폼 저장소에서 통과
- [ ] §4 체크리스트 완료 후 `verify` 대비 재통과
- [ ] §6 감사 규칙 범위 조정 결정
- [ ] §7 미결정 4건 확정
- [ ] KRDS 라이선스 고지 문안
- [ ] 사내 참조처 확인 후 §9 리다이렉트
