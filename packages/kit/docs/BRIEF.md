# 홈박스 키트 — 부품 작업 규칙 (작업자 공통)

목표: KRDS 와 shadcn/ui 의 부품을 **전부** 홈박스 키트로 옮긴다. React 판과 Vue 판을 둘 다 만든다.
두 판은 **같은 마크업·같은 클래스**를 내보내고, 모양은 하나의 CSS(`dist/css/kit.css`)가 정한다.

## 기준
- **KRDS 에 있는 부품**: `krds/examples/<이름>.html`(마크업·클래스·ARIA)과 `krds/scss/_<이름>.scss`(스타일)를 먼저 읽는다.
  마크업과 클래스는 KRDS 그대로 쓴다. 그러면 KRDS CSS 가 이미 kit.css 에 들어 있어 모양이 자동으로 맞는다.
  KRDS 의 `krds/ui-script.js` 에 그 부품 동작이 있으면 참고한다(단, jQuery식 DOM 조작 대신 React·Vue 상태로).
- **shadcn 에만 있는 부품**: 사용법(props·하위 부품 이름)은 shadcn/ui(React)·shadcn-vue 를 따른다.
  모양은 KRDS 토큰으로 새로 짓는다 → `css/parts/<묶음>.css` 에 쓴다.
- 동작 라이브러리: React 는 `radix-ui`(umbrella: `import { Dialog } from "radix-ui"`), Vue 는 `reka-ui`.
  **새 npm 패키지는 추가하지 않는다.** 없는 것(캐러셀·토스트·명령 팔레트·크기 조절 등)은 직접 만든다.

## 파일 규칙 (여러 작업자가 동시에 작업한다 — 남의 파일을 고치지 않는다)
| 무엇 | 위치 | 규칙 |
|---|---|---|
| React 부품 | `react/<kebab>.tsx` | 이름 있는 export 만(PascalCase). 요소를 감싸면 `React.forwardRef`, `className` 을 넘겨받아 `cx()`(./utils) 로 붙인다. 기본 export 금지. |
| Vue 부품 | `vue/<PascalName>.vue` | 파일 하나 = 부품 하나, **파일 이름이 곧 export 이름**. 하위 부품도 각 파일(`DialogContent.vue`). |
| CSS | `css/parts/<묶음>.css` | KRDS 에 없는 것만. 클래스는 `hb-` 접두. 값은 `var(--krds-…)` 토큰(색·간격·모서리·글자), 단위 px. 요소 전역 선택자 금지(항상 클래스로). |
| React 데모 | `preview/demos/react/<id>.tsx` | 맨 위에 `export const meta = { id: "<id>", title: "<한글 이름>", group: "<묶음>", source: "krds"\|"shadcn"\|"both", note?: "…" };` + `export default function Demo()`. `import … from "../../../react"`. |
| Vue 데모 | `preview/demos/vue/<id>.vue` | React 데모와 **같은 id·같은 내용**. `import … from "../../../vue"`. |
| 목록 파일 | `react/index.ts`·`vue/index.ts`·`preview/demos/**/index.ts`·`registry.ts` | **손대지 않는다** — `node scripts/gen-index.mjs` 가 만든다. |

- export 이름은 전체에서 겹치면 안 된다. 담당 부품 이름만 쓴다(`docs/BRIEF.md` 아래 목록).
- 기존 파일(button·tabs·accordion·utils·skins·react-app·VueApp)은 담당자가 아니면 고치지 않는다.

## 레이어(포털) 부품
대화상자·팝오버·메뉴처럼 body 끝에 붙는 내용은 **그 최상위 요소에 `hb-kit` 클래스를 함께 붙인다.**
(초기화 스타일과 파생 토큰이 `.hb-kit` 안에서만 적용되기 때문. 스킨은 문서 루트에도 걸리므로 색은 따라온다.)

## 접근성 (KRDS 체크리스트 기준)
- 실제 `<button>`·`<a>`, 아이콘만 있는 버튼은 `aria-label`, 레이블 연결(`htmlFor`/`id`).
- WAI-ARIA 패턴대로: 키보드(Tab·방향키·Esc·Home/End), 포커스 가두기·복귀, `aria-expanded`·`aria-controls`·`aria-selected` 등.
- 포커스 표시를 지우지 않는다. 움직임은 `prefers-reduced-motion` 을 존중한다.
- 상태를 색으로만 표시하지 않는다(글자·아이콘 병기).

## 이 사용자의 UI 규칙
- **네이티브 `<select>` 금지** — 선택 상자는 버튼 + 목록(listbox)으로 직접 만든다.
- **같은 줄의 입력·선택·버튼은 높이가 같다**(크기 변형을 맞춘다).
- 한국어 UI. 데모 문구는 관공서 실제 화면처럼(가상 기관 "한빛시"), 자리표시자 글자("Lorem", "텍스트") 금지.
- 표: 머리칸은 가운데, 길이가 들쭉날쭉한 글은 왼쪽, 비교하는 숫자는 오른쪽, 그 외(짧은 값·날짜·상태)는 가운데.
- 모노스페이스 글꼴 금지. 단어 중간에서 줄이 끊기지 않게(keep-all 은 kit 에 이미 걸려 있다).

## 확인 (끝내기 전에 반드시)
```
cd G:/homebox-handoff/packages/kit
node scripts/gen-index.mjs
npx tsc -p tsconfig.json            # 내 파일에 오류 0
npx vue-tsc -p tsconfig.vue.json    # 내 파일에 오류 0
node scripts/build-css.mjs && node scripts/build-preview.mjs
node scripts/check-demos.mjs <내 id들, 쉼표로>
```
- 다른 작업자가 동시에 작업 중이라 **남의 파일 오류**가 보일 수 있다 — 그건 무시하고 내 파일 오류만 0 으로.
  빌드가 남의 파일 때문에 실패하면 잠시 뒤 다시 시도한다.
- `dist/shots/<react|vue>-<id>.png` 를 Read 로 **직접 눈으로 본다**. React·Vue 가 같은 모양인지, KRDS 예제와 닮았는지.
- 레이어 부품은 열린 상태도 확인한다(데모에 "열린 상태로 시작" 예시를 하나 두거나 스크립트로 눌러 본다).

## 끝나면 보고
담당 id 목록, 각 부품의 React/Vue export 이름, 만든 CSS 파일, 확인 결과(오류 수·스크린샷 소감), 남긴 한계.
**커밋·푸시하지 않는다**(통합은 총괄이 한다). 보고는 한국어로.

---

## 전체 부품 목록 (묶음 · id · 출처)

### A. 버튼·표시 (group: action)
button(기존 확장: 아이콘 버튼·아이콘 붙은 버튼·링크형 — KRDS button_icon/button_with_icon/button_text/button_hierarchy) · link · badge(숫자·크기) · tag(링크 태그 포함) · spinner · skeleton · progress · separator · kbd · avatar · aspect-ratio · text-list(글머리·번호) · empty · button-group · toggle · toggle-group

### B. 입력 (group: form)
label · input(크기·상태·아이콘) · input-group · textarea · field(도움말·오류·필수 표시, KRDS form_layout) · checkbox(크기) · radio-group · chip(선택 칩: checkbox_chip·radio_chip) · switch(toggle_switch) · select(직접 만든 선택 상자, 정렬 선택 포함) · slider · input-otp · file-upload · date-input

### C. 레이어 1 (group: overlay)
dialog(KRDS modal) · alert-dialog · sheet · drawer · popover · hover-card · tooltip(KRDS 말풍선·상자형·세로형) · toast(sonner 형)

### D. 레이어 2 (group: overlay)
dropdown-menu · context-menu · menubar · command · combobox · contextual-help · coach-mark · help-panel · tutorial-panel

### E. 탐색 (group: nav)
breadcrumb · pagination · side-navigation · in-page-navigation · step-indicator · navigation-menu(KRDS main_menu_pc) · mobile-menu(KRDS main_menu_mobile) · collapsible(KRDS disclosure) · carousel(KRDS carousel·배너형) · scroll-area · resizable · sidebar
(tabs·accordion 은 완료)

### F. 데이터·구조 (group: data / layout)
table(KRDS table) · data-table(정렬·선택·페이지) · structured-list(목록형·표형) · calendar(단일·기간) · date-picker · card · alert(KRDS critical_alerts + shadcn alert) · item

### G. 정부 서비스 공통 (group: gov)
masthead(공식 누리집 표시) · identifier(운영기관 식별자) · header · footer · skip-link · language-switcher(드롭다운·페이지형) · resize(글자 크기 조절) · tts(음성 읽기)
