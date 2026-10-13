# 홈박스 목업 동작 규약 (hb-behavior)

목업은 모양만 그리면 안 된다. 눈에 보이는 조작 요소는 전부 실제로 움직여야 한다.
`hb-behavior.js` 를 `</body>` 앞에 `<script>` 로 그대로 넣고, 마크업에 아래 속성을 붙인다.
외부 라이브러리는 쓰지 않는다.

## 공통 규칙

- 누를 수 있는 것은 `<button type="button">` 또는 `<a href="…">` 로 쓴다. `href` 없는 `<a>`, 누를 수 있게 생긴 `<span>` 은 금지.
- 갈 곳이 없는 링크는 `href="#"` (스크립트가 튀는 것을 막는다). 같은 페이지 안 이동은 `href="#섹션id"`.
- 감춰 둘 것은 `hidden` 속성으로 감춘다. 스크립트가 `hidden` 을 붙였다 뗀다.
- 자리(폭·높이)는 감싼 상자가 정한다. 슬라이드·패널이 바뀌어도 레이아웃이 흔들리지 않게 상자에 크기를 준다.

## 캐러셀 — 팝업존·배너·알림판·카드 넘김·검색어 흐름

```html
<div data-hb="carousel" data-hb-auto="5000">
  <div data-hb-slide>첫 장</div>
  <div data-hb-slide hidden>둘째 장</div>
  <div data-hb-slide hidden>셋째 장</div>
  <span data-hb-current>1</span> / <span data-hb-total>3</span>   <!-- 뿌리에 data-hb-pad="2" 를 주면 01 / 03 -->
  <button type="button" data-hb-prev aria-label="이전">(chevron_left)</button>
  <button type="button" data-hb-pause aria-label="자동 넘김 정지">
    <span data-hb-when="playing">(pause)</span><span data-hb-when="paused" hidden>(play_arrow)</span>
  </button>
  <button type="button" data-hb-next aria-label="다음">(chevron_right)</button>
</div>
```

- 슬라이드는 2장 이상 실제 내용으로 만든다. 숫자만 "4 / 12" 라고 써 놓지 않는다.
- `data-hb-per="3"`: 한 번에 3장씩 보이고 3장씩 넘어간다(카드 줄). 슬라이드는 6장·9장처럼 배수로 만든다.
- `data-hb-auto` 를 빼면 자동 넘김이 없다(정지 단추도 뺀다).
- `data-hb-start="4"`: 처음 보일 장.
- `data-hb-dot`: 몇 번째 장으로 바로 가는 단추(장 수만큼).
- 올려놓거나 초점이 들어가면 자동 넘김이 멈춘다. 움직임 줄이기 설정이면 자동 넘김을 하지 않는다.

## 탭 — 소식 분류·서비스 분류·세로 탭

패널을 바꾸는 방식:

```html
<div data-hb="tabs">
  <button type="button" data-hb-tab="notice" class="on">공지사항</button>
  <button type="button" data-hb-tab="job">채용공고</button>
  <div data-hb-panel="notice">…</div>
  <div data-hb-panel="job" hidden>…</div>
</div>
```

한 목록을 거르는 방식(‘전체’ 탭은 `all`):

```html
<div data-hb="tabs">
  <button type="button" data-hb-tab="all" class="on">전체</button>
  <button type="button" data-hb-tab="job">채용공고</button>
  <a href="#" data-hb-cat="notice">…</a>
  <a href="#" data-hb-cat="job">…</a>
</div>
```

- 선택된 탭에는 `on` 클래스가 붙는다(`data-hb-on="active"` 로 이름을 바꿀 수 있다). 모양은 그 클래스로 꾸민다.
- 탭마다 실제로 다른 내용이 있어야 한다. 분류마다 항목을 2개 이상 넣는다.
- 탭 패널 안에 캐러셀을 넣어도 된다(감춰진 패널 안 캐러셀은 열렸을 때 동작하면 된다).
- 재생·화살표 같은 아이콘을 장식으로만 쓰지 않는다 — 단추나 링크 안에 넣는다. 조작 요소처럼 보이는데 동작이 없으면 검사에 걸린다.
- 방향키·Home·End 로 옮겨 갈 수 있다.

## 주 메뉴 — 올리면 하위 메뉴가 열린다

```html
<nav data-hb="menu">
  <div data-hb-menu><a href="#">종합민원</a>
    <div data-hb-sub hidden><a href="#">민원안내</a><a href="#">여권</a></div>
  </div>
</nav>
```

- 메뉴마다 하위 항목을 4개 이상 넣는다. 열린 항목에는 `open` 클래스가 붙는다.
- 하위 메뉴는 `position:absolute` 로 띄워 본문을 밀지 않게 한다.

### 전체 펼침 판 — 판 하나를 모든 메뉴가 같이 쓴다

머리 아래 화면 폭 가득한 판에 모든 하위 메뉴를 열로 펼칠 때는, 메뉴마다 `data-hb-sub` 를 복제하지 않고 판 하나에 `data-hb-mega` 를 붙인다. 열에는 `data-hb-col="메뉴 순번(0부터)"` — 올린 메뉴의 열에 `on` 클래스가 붙는다.

```html
<nav data-hb="menu">
  <div data-hb-menu><a href="#">종합민원</a></div>
  <div data-hb-menu><a href="#">분야별정보</a></div>
  <div data-hb-mega hidden>
    <ul data-hb-col="0"><li><a href="#">민원안내</a></li><li><a href="#">여권</a></li></ul>
    <ul data-hb-col="1"><li><a href="#">복지</a></li><li><a href="#">교통</a></li></ul>
  </div>
</nav>
```

## 레이어 — 전체메뉴·검색창·언어·관련 사이트

```html
<button type="button" data-hb-open="#allmenu" aria-label="전체메뉴">(menu)</button>
<div id="allmenu" data-hb-layer hidden>
  … <button type="button" data-hb-close aria-label="닫기">(close)</button>
</div>
```

- 다시 누르거나, 바깥을 누르거나, Esc 를 누르면 닫힌다. 닫히면 초점이 연 단추로 돌아간다.
- 선택 상자: 단추 안 글에 `data-hb-label`, 레이어 안 항목에 `data-hb-option` 을 붙이면 고른 글로 바뀐다.
- 닫기만 있는 띠(오늘 하루 보지 않기 등): 띠에 `data-hb-dismissable`, 닫기 단추에 `data-hb-close`.

## 검색

```html
<form data-hb="search" data-hb-results="#hb-results">
  <input type="search" placeholder="무엇을 찾고 계신가요?" aria-label="검색어">
  <button type="submit" aria-label="검색">(search)</button>
</form>
<div id="hb-results" hidden></div>
<a href="#" data-hb-query="알림마당">#알림마당</a>
```

- 제출하면 이 페이지의 글에서 찾아 결과 목록을 `#hb-results` 에 채워 보여 준다. 결과를 누르면 그 자리로 간다.
- 결과 상자는 검색창 바로 아래에 `position:absolute` 로 띄우고 모양(흰 바탕·그림자·둥글기)을 직접 꾸민다.
- 인기 검색어는 `data-hb-query` 로 누르면 바로 검색된다.
- 검색어 칸은 `data-hb-q` 를 붙인 칸 → 없으면 `type="search"` 칸 → 없으면 폼의 첫 입력칸이다. 분류 선택 상자나 숨은 칸을 앞에 두는 폼이면 검색어 칸에 `data-hb-q` 를 붙인다.
- 찾는 범위는 `<main>` 안의 링크·h2·h3·li·dd 글(2~80자)이다. 머리·바닥·검색 폼 자신은 찾지 않으므로 본문을 `<main>` 으로 감싼다. 결과는 8건까지 보여 준다.

## 그 밖

- 접기: `<button data-hb-acc>` 바로 다음 요소(또는 `data-hb-acc="#id"`)를 접었다 편다.
- 맨 위로: `data-hb-top`.

## 검사

`node scripts/mockup-qa.mjs <목업.html>` 이 실제로 눌러 본다.

- 스크립트 오류가 없는가.
- 캐러셀: 다음을 누르면 보이는 장이 바뀌는가, 이전으로 돌아오는가, 정지가 눌리는가.
- 탭: 탭마다 보이는 내용이 바뀌는가.
- 레이어: 누르면 열리고 Esc 로 닫히는가.
- 주 메뉴: 올리면 하위 메뉴가 보이는가.
- 검색: 제출하면 결과가 나오는가.
- 누를 수 있게 생겼는데 동작이 없는 요소(`href` 없는 `<a>`, 단추가 아닌 이전·다음·정지·닫기·메뉴·검색 아이콘)가 없는가.

## 검사가 추가로 보는 것 (미리 맞춘다)
- `<main>` 이 있어야 하고 header·footer 는 하나씩.
- 넘기는 단추와 장(`data-hb-slide`)은 같은 `data-hb="carousel"` 안에 둔다. `data-hb-per` 를 쓰면 첫 묶음 밖의 장은 `hidden` 으로 시작한다.
- 같은 줄 칸들의 높이 차는 8px 이내(`aside`·`nav` 는 예외).
- 말줄임표(…)와 본문에 홀로 쓴 `+`·`>` 도 글자 기호로 잡힌다. 대괄호로 감싼 글(`[모집]`)은 자리표시로 잡히니 쓰지 않는다.
- 한 줄의 칸들이 같은 아이콘을 쓰면 실패다. 다만 레이어를 여는 단추(`data-hb-open`)·선택 상자·캐러셀 단추 안의 아이콘은 같아도 된다. 영상 칸의 재생 표시처럼 장식으로 반복되는 아이콘은 `class="hb-same"` 요소로 감싼다.
- 아이콘 위·글 아래로 쌓는 배치는 괜찮다. 가로로 나란히 둘 때만 세로 중심을 맞춘다(inline-flex·align-items:center).
- 검색 결과에는 링크의 글이 그대로 나온다. 제목과 날짜·배지 사이에는 공백을 두고, '새 글' 같은 배지 글자는 CSS(::after)로 넣는다.
- `data-hb-per` 를 쓸 때 점(`data-hb-dot`)은 장 수가 아니라 묶음(쪽) 수만큼 둔다.
- 첫 제목(h2)의 첫 낱말로 검색하면 결과가 1건 이상 나와야 한다.
- 예시의 (chevron_left)·(chevron_right)·(pause) 자리는 icons 의 `prev`·`next`·`pause` 다.
