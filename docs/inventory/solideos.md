# solideos (Solid Flow) 인벤토리 (D:\solideos, HEAD 5dcdb89 v1.3.2, 2026-10-06)
## 토큰 tokens/tokens.json 194개
primitive 87(static2 gray20 crimson9 ink9 green9 blue9 amber9 red9 opacity11) · semantic 41(text10 bg5 fill13 border6 icon5 accent2) · space12 · radius6 · font15 · line-height3 · letter-spacing1 · shadow4 · duration3 · easing2 · layout5 · breakpoint4 · component11(control height-sm/md/lg 32/40/48, radius, padding-x, font-size, target-min 24 / button.font-weight / badge height22, radius, padding-x). alias 32.
build.mjs(530줄, 의존성 0) 산출 dist 14종: solideo-tokens.{css,scss,less,js,cjs,d.ts,properties,flat.json} · tailwind.preset.cjs · quasar.variables.sass · SolideoTokens.java · solideo-shadcn.css(@theme inline, data-contrast) · solideo-figma.tokens.json · solideo-dark.css + app/public/tokens/tokens.json 사본. verify.mjs: 대비 4.5/3, 다크 배경, Accent/Critical 구별.
## 라우트 HashRouter 8 (App.tsx:47-54, 데이터 app/src/data/ia.ts 357줄)
/ Home · /foundations · /components(1315줄) · /patterns · /visual-communication · /ux-writing · /ai-interaction · /resources(library.ts·css-classes.ts·KrdsCoverage)
데이터: krds.ts 82KB(55 중 45 대응, kwcag/usage/a11y/interaction/dev) · krds-patterns.ts 26KB(12/12) · library.ts(사내 부서·내부 링크 포함) · css-classes.ts(.sds-* 73 자동) · tools/krds-cache 3파일 약 500KB. 화면 KrdsGuide.tsx·KrdsCoverage.tsx.
## 컴포넌트 app/src/components/ui 29
shadcn 24(accordion alert badge breadcrumb button card checkbox dialog dropdown-menu input label pagination progress radio-group select separator sheet skeleton sonner switch table tabs textarea tooltip) + 자체 5(field.tsx: TextField·TextareaField·CheckboxField·RadioField·SwitchField·SelectField / krds-components.tsx: VisuallyHidden·CriticalAlert·StepIndicator·StructuredList·Spinner·Snackbar·InPageNav / masked-input / scrollable / icon + icons.generated.ts 39개). docs 9, layout 6(A11ySettings DocLayout GovBanner SideNav SiteFooter SiteHeader).
CSS 판 css/solideo-components.css 517줄 — .sds-* 73 클래스, 35 블록(파일 1개). component 토큰은 CSS·React 양쪽이 참조(PARITY-01).
## 회사 종속 요소(공용화 때 걷어낼 것)
크림슨 #C12554 원천 tokens.json:119(생성물·문서 예시 다수, build.mjs 에 crimson 이름 하드코딩 ALIASES/SHADCN/Quasar/Tailwind/고대비/DARK). "솔리데오/SOLIDEO" 약 50파일(build.mjs 57, Resources 33, package.json 19 `@solideo/design-system`, library.ts 17, SiteFooter 저작권, GovBanner, ia.ts org). 클래스 접두 `.sds-` 73개 전부. 전자정부 배너 GovBanner.tsx(App.tsx:38). 스타터 킷 starters/html 5파일(+public 사본). myDev·CLAUDE.local.md·.playwright-mcp 는 이식 X.
## 검증 도구
tools/audit-offline.mjs 규칙 7: CDN-01/02/03 외부 참조, NET-01 외부 전송, A11Y-01 text-[Npx] 금지, DEPLOY-01 BrowserRouter 금지, PARITY-01 h-8~11·rounded-md/lg 금지(button input textarea select badge), PII-01 스토리지 키. build-components-css.mjs 검사 4(미정의 토큰·색 하드코딩·px 글자·포커스 제거). tokens/verify.mjs. `npm run check` 전체. 접근성 A11ySettings(data-font-scale·data-contrast localStorage), 본문 바로가기.
## 홈박스 키트 대조
키트 React 77·Vue 264(하위 단위). 같은 이름 약 33종(shadcn 23 + Toast·Field·Spinner·StepIndicator·StructuredList·CriticalAlert·InPageNav·GovBanner=masthead). 솔리데오에만: MaskedInput·Snackbar·Icon·VisuallyHidden·Scrollable·TabBar·BottomSheet(마지막 둘은 문서 데모)·A11ySettings. 키트에만 약 40(alert-dialog avatar calendar carousel coach-mark combobox command data-table date-picker drawer file-upload header help-panel sidebar slider tag toggle tts …).
이식 가치 큰 것: 문서 콘텐츠(Foundations·Patterns·UX Writing·AI Interaction), KRDS 대응표·지침 데이터, 감사 규칙. 부품은 키트가 넓다.
## 수치 불일치
README "67종 중 64종" vs krds.ts "55 중 45". git 커밋 3개(5dcdb89 v1.3.2, bbbcceb Pretendard, ba3e056 초기 v1.3.1).
