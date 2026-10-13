// 자동 생성 — scripts/gen-index.mjs. 손으로 고치지 않는다.
export interface DemoMeta { id: string; title: string; group: string; source: "krds" | "shadcn" | "both"; note?: string }
export const GROUPS: Array<[string, string]> = [["gov","정부 서비스 공통"],["action","버튼·표시"],["form","입력"],["nav","탐색"],["overlay","레이어"],["data","데이터"],["layout","구조"]];
export const METAS: DemoMeta[] = [
 {
  "id": "accordion",
  "title": "아코디언",
  "group": "nav",
  "source": "both"
 },
 {
  "id": "alert-dialog",
  "title": "확인 대화상자",
  "group": "overlay",
  "source": "shadcn",
  "note": "되돌릴 수 없는 동작 전에 묻는다. 바깥을 눌러도 닫히지 않고, 열리면 '돌아가기'에 먼저 포커스가 간다."
 },
 {
  "id": "alert",
  "title": "알림",
  "group": "data",
  "source": "both",
  "note": "안내 상자(shadcn Alert: info · success · warning · danger · neutral) + 긴급 공지 띠(KRDS critical alerts). 색과 함께 아이콘·글자로 상태를 알린다."
 },
 {
  "id": "aspect-ratio",
  "title": "비율 상자",
  "group": "action",
  "source": "shadcn",
  "note": "16:9 · 4:3 · 1:1 — 안의 사진이 상자를 채운다"
 },
 {
  "id": "avatar",
  "title": "아바타",
  "group": "action",
  "source": "shadcn",
  "note": "사진 · 사진을 못 불러오면 대체 글자 · 크기 4종 · 둥근 사각"
 },
 {
  "id": "badge",
  "title": "배지",
  "group": "action",
  "source": "both",
  "note": "테두리형 · 채움형 · 옅은 채움형 · 크기 · 숫자 배지(999+) · 점 배지"
 },
 {
  "id": "breadcrumb",
  "title": "브레드크럼",
  "group": "nav",
  "source": "both"
 },
 {
  "id": "button-group",
  "title": "버튼 묶음",
  "group": "action",
  "source": "shadcn",
  "note": "버튼을 붙여 한 덩어리로 · 글자 칸 · 세로 묶음"
 },
 {
  "id": "button",
  "title": "버튼",
  "group": "action",
  "source": "both",
  "note": "위계(주요·보조·3순위·텍스트) · 크기 5종 · 아이콘 붙은 버튼 · 텍스트 버튼 · 아이콘 버튼 · 처리 중(loading — onClick 이 Promise 를 돌려주면 끝날 때까지 스피너, 다시 눌러도 무시)"
 },
 {
  "id": "calendar",
  "title": "달력",
  "group": "data",
  "source": "both",
  "note": "하루 고르기 · 기간 고르기. 날짜 칸은 방향키로 옮기고(Home/End 주 처음·끝, PageUp/PageDown 달) Enter 로 고른다. 예시: 월요일 휴관(선택 불가)."
 },
 {
  "id": "card",
  "title": "카드",
  "group": "layout",
  "source": "shadcn",
  "note": "variant: outline(기본) · filled · elevated. CardTitle 은 기본 h3 — 문서 구조에 맞게 as 로 바꾼다."
 },
 {
  "id": "carousel",
  "title": "캐러셀",
  "group": "nav",
  "source": "both",
  "note": "위: 자동 넘김(5초) — 마우스를 올리거나 포커스가 들어가면 멈추고, 「움직임 줄이기」 환경에서는 멈춘 채 시작한다. 아래: 끝에서 멈추는 배너형."
 },
 {
  "id": "checkbox",
  "title": "체크박스",
  "group": "form",
  "source": "both",
  "note": "상태 4종, 부가 설명, 크기(medium·large), 전체 선택(일부 선택 indeterminate)."
 },
 {
  "id": "chip",
  "title": "선택 칩",
  "group": "form",
  "source": "krds",
  "note": "여러 개 고르는 체크박스 칩, 하나만 고르는 라디오 칩."
 },
 {
  "id": "coach-mark",
  "title": "코치 마크",
  "group": "overlay",
  "source": "krds",
  "note": "처음 쓰는 사람에게 화면 영역을 한 단계씩 짚어 준다. 단계가 바뀌면 말풍선으로 포커스가 옮겨 간다."
 },
 {
  "id": "collapsible",
  "title": "접기·펼치기",
  "group": "nav",
  "source": "both",
  "note": "KRDS 「디스클로저」. 두 번째는 열린 상태로 시작."
 },
 {
  "id": "combobox",
  "title": "검색 선택 상자",
  "group": "overlay",
  "source": "shadcn",
  "note": "네이티브 select 대신 입력칸 + 목록 상자. 입력해서 거르고 ↓/↑·Enter 로 고른다(Alt+↓ 열기, Esc 닫기)."
 },
 {
  "id": "command",
  "title": "명령 팔레트",
  "group": "overlay",
  "source": "shadcn",
  "note": "입력칸에 포커스를 둔 채 ↑↓ 로 고르고 Enter. 동의어(예: 이사 → 전입신고)로도 찾아진다."
 },
 {
  "id": "context-menu",
  "title": "오른쪽 클릭 메뉴",
  "group": "overlay",
  "source": "shadcn",
  "note": "마우스 오른쪽 클릭 또는 영역에 포커스를 두고 Shift+F10 으로 연다. 같은 기능을 버튼으로도 제공할 것."
 },
 {
  "id": "contextual-help",
  "title": "맥락 도움말",
  "group": "overlay",
  "source": "krds",
  "note": "물음표 버튼을 누를 때만 보인다. 아래 예시 하나는 열린 상태로 시작한다."
 },
 {
  "id": "data-table",
  "title": "데이터 표",
  "group": "data",
  "source": "shadcn",
  "note": "머리칸을 눌러 정렬(aria-sort) · 행 체크로 선택 · 아래 페이지 나눔. 선택 개수는 화면 읽기 프로그램에 알린다."
 },
 {
  "id": "date-input",
  "title": "날짜 입력",
  "group": "form",
  "source": "krds",
  "note": "숫자만 입력해도 YYYY.MM.DD 로 바뀝니다. 형식 안내가 칸 아래 붙고, 틀린 날짜는 오류 문구가 뜹니다. precision 으로 연·월만 받을 수 있습니다."
 },
 {
  "id": "date-picker",
  "title": "날짜 선택",
  "group": "data",
  "source": "both",
  "note": "입력칸에 직접 쓰거나(2026.09.25 · 20260925) 달력 버튼으로 고른다. 달력에서는 [확인] 을 눌러야 들어간다."
 },
 {
  "id": "dialog",
  "title": "대화상자(모달)",
  "group": "overlay",
  "source": "both",
  "note": "열면 포커스가 안으로 들어가 갇히고, Esc·닫기·바깥을 누르면 닫힌 뒤 열었던 버튼으로 돌아온다."
 },
 {
  "id": "drawer",
  "title": "드로어(바텀시트)",
  "group": "overlay",
  "source": "both",
  "note": "KRDS 모달의 바텀시트. 아래에서 올라오고, 위쪽 손잡이를 끌어내리거나 Esc·닫기로 닫는다."
 },
 {
  "id": "dropdown-menu",
  "title": "드롭다운 메뉴",
  "group": "overlay",
  "source": "shadcn",
  "note": "↑↓ 이동 · → 하위 메뉴 · Esc 닫기 · 글자를 치면 그 글자로 시작하는 항목으로 이동"
 },
 {
  "id": "empty",
  "title": "빈 상태",
  "group": "action",
  "source": "shadcn",
  "note": "검색 결과 없음 · 신청 내역 없음"
 },
 {
  "id": "field",
  "title": "필드(폼 레이아웃)",
  "group": "form",
  "source": "both",
  "note": "레이블·입력·도움말·오류를 한 묶음으로. 입력 요소가 id·도움말·오류를 자동으로 연결합니다."
 },
 {
  "id": "file-upload",
  "title": "파일 업로드",
  "group": "form",
  "source": "krds",
  "note": "끌어다 놓기·파일 선택, 업로드 중·완료·오류 상태, 개수·용량·형식 제한, 제한 조건으로 만든 안내 문구."
 },
 {
  "id": "footer",
  "title": "푸터",
  "group": "gov",
  "source": "krds",
  "note": "관련 사이트 버튼을 누르면 목록이 펼쳐진다(Esc 로 닫기). 로고는 logoSrc 이미지, 없으면 기관명 글자."
 },
 {
  "id": "header",
  "title": "헤더",
  "group": "gov",
  "source": "krds",
  "note": "로고는 logoSrc 이미지로 받고 없으면 누리집 이름 글자. 메인 메뉴는 children 으로 넣는다. 전체메뉴 버튼은 1024px 미만에서만 보인다."
 },
 {
  "id": "help-panel",
  "title": "도움 패널",
  "group": "overlay",
  "source": "krds",
  "note": "실제로는 화면 오른쪽에 고정된다. 미리보기는 inline 으로 상자 안에 가뒀고 열린 상태로 시작한다(접어두기 → 도움말 버튼으로 다시 열기)."
 },
 {
  "id": "hover-card",
  "title": "호버 카드",
  "group": "overlay",
  "source": "shadcn",
  "note": "링크에 마우스를 올리거나 키보드로 포커스하면 미리보기 카드가 뜬다. 카드 내용은 보조 정보 — 같은 내용이 링크한 페이지에도 있어야 한다."
 },
 {
  "id": "identifier",
  "title": "운영기관 식별자",
  "group": "gov",
  "source": "krds",
  "note": "로고는 logoSrc 이미지로 받는다(정부 상징을 코드로 그리지 않는다). 없으면 문구만. 여러 기관이 함께 운영하면 logos 배열 — 순서가 위계다."
 },
 {
  "id": "in-page-navigation",
  "title": "콘텐츠 내 탐색",
  "group": "nav",
  "source": "krds",
  "note": "KRDS 기본은 화면 오른쪽 고정(position=\"fixed\"). 여기서는 문서 안(static)에 두었다. 본문을 스크롤하면 선택이 따라온다."
 },
 {
  "id": "input-group",
  "title": "입력 그룹",
  "group": "form",
  "source": "shadcn",
  "note": "입력 앞뒤에 단위·아이콘·버튼을 붙입니다. 테두리는 그룹 하나가 갖습니다."
 },
 {
  "id": "input-otp",
  "title": "인증번호 입력",
  "group": "form",
  "source": "shadcn",
  "note": "한 칸에 한 글자, 붙여넣으면 칸마다 나눠 채웁니다."
 },
 {
  "id": "input",
  "title": "입력 필드",
  "group": "form",
  "source": "both",
  "note": "크기 4종(small·medium·large·xlarge), 상태(오류·성공·정보·읽기 전용·비활성), 비밀번호 보기·내용 삭제 버튼."
 },
 {
  "id": "item",
  "title": "항목",
  "group": "layout",
  "source": "shadcn",
  "note": "한 줄짜리 목록 항목(아이콘 + 제목·설명 + 버튼). variant: default · outline · muted, size: default · small."
 },
 {
  "id": "kbd",
  "title": "키보드 키",
  "group": "action",
  "source": "shadcn",
  "note": "단축키 안내 · 키 조합"
 },
 {
  "id": "label",
  "title": "레이블",
  "group": "form",
  "source": "shadcn",
  "note": "필수 표시는 별표와 화면낭독용 '(필수)' 글자를 함께 둡니다."
 },
 {
  "id": "language-switcher",
  "title": "언어 변경",
  "group": "gov",
  "source": "krds",
  "note": "드롭다운형은 누리집 안에서 언어를 바꾸고, 페이지형은 언어별 누리집을 새 창으로 연다. 네이티브 select 를 쓰지 않는다."
 },
 {
  "id": "link",
  "title": "링크",
  "group": "action",
  "source": "krds",
  "note": "링크색·본문색 · 밑줄 항상/마우스 올릴 때/없음 · 새 창 링크(이동 아이콘·새 창 안내) · 첨부파일 링크(다운로드 아이콘·[형식, 크기])"
 },
 {
  "id": "masthead",
  "title": "공식 배너",
  "group": "gov",
  "source": "krds",
  "note": "누리집 맨 위에 두는 '대한민국 공식 전자정부 누리집' 표시. 아래는 펼친 상태."
 },
 {
  "id": "menubar",
  "title": "메뉴 막대",
  "group": "overlay",
  "source": "shadcn",
  "note": "←/→ 로 메뉴 사이 이동 · ↓·Enter 로 열기 · 열린 채 ←/→ 면 옆 메뉴가 열린다"
 },
 {
  "id": "mobile-menu",
  "title": "전체 메뉴(모바일)",
  "group": "nav",
  "source": "krds",
  "note": "KRDS 는 1024px 이상 화면에서 이 메뉴를 숨긴다 — 여기서는 inline 으로 문서 안에 펼쳐 두었다. 실제로는 open/onOpenChange 로 여닫는 대화상자다."
 },
 {
  "id": "navigation-menu",
  "title": "주 메뉴(PC)",
  "group": "nav",
  "source": "both",
  "note": "KRDS 「메인 메뉴: 데스크탑」 메가 메뉴. 두 번째는 「민원」이 열린 상태로 시작. Esc·바깥 누르기로 닫히고, 1뎁스끼리 ←/→, ↓ 로 판 안으로 들어간다."
 },
 {
  "id": "pagination",
  "title": "페이지네이션",
  "group": "nav",
  "source": "krds",
  "note": "위: 버튼(목록만 바꿈) · 아래: 링크(주소가 바뀜) · 쪽이 적으면 말줄임 없이 모두 보인다 · 767px 이하에서는 말줄임 포함 최대 7개(mobileSiblings)."
 },
 {
  "id": "popover",
  "title": "팝오버",
  "group": "overlay",
  "source": "shadcn",
  "note": "버튼을 눌러 여는 작은 레이어. 입력·버튼을 넣을 수 있고, Esc·바깥을 누르면 닫혀 버튼으로 포커스가 돌아온다."
 },
 {
  "id": "progress",
  "title": "진행 막대",
  "group": "action",
  "source": "shadcn",
  "note": "값 표시 · 크기 · 색 · 값을 모를 때(진행 중)"
 },
 {
  "id": "radio-group",
  "title": "라디오 버튼",
  "group": "form",
  "source": "both",
  "note": "같은 묶음 안에서 방향키로 이동·선택합니다."
 },
 {
  "id": "resizable",
  "title": "크기 조절 칸",
  "group": "nav",
  "source": "shadcn",
  "note": "손잡이를 끌거나, Tab 으로 손잡이에 들어가 ←/→(세로는 ↑/↓, Shift 는 10%)·Home/End 로 조절한다."
 },
 {
  "id": "resize",
  "title": "글자 크기 조절",
  "group": "gov",
  "source": "krds",
  "note": "고른 단계만큼 대상 영역의 글자 크기 토큰을 키운다. 아래 예시는 회색 상자만 대상으로 했다."
 },
 {
  "id": "scroll-area",
  "title": "스크롤 영역",
  "group": "nav",
  "source": "shadcn",
  "note": "영역에 Tab 으로 들어가 방향키로 스크롤할 수 있다."
 },
 {
  "id": "select",
  "title": "선택 상자",
  "group": "form",
  "source": "krds",
  "note": "네이티브 select 대신 버튼+목록. ↑↓·Enter·Esc·글자 입력으로 찾기, 아래 자리가 없으면 위로 열림. 맨 아래 줄은 입력·선택·버튼 높이를 맞춘 예시."
 },
 {
  "id": "separator",
  "title": "구분선",
  "group": "action",
  "source": "shadcn",
  "note": "가로·세로 · 꾸밈(기본, 스크린리더 무시) · 뜻이 있는 구분"
 },
 {
  "id": "sheet",
  "title": "시트",
  "group": "overlay",
  "source": "shadcn",
  "note": "화면 가장자리(오른쪽·왼쪽·위·아래)에서 밀려 나오는 패널. 검색 조건·보조 메뉴처럼 본문을 두고 잠깐 여는 내용에 쓴다."
 },
 {
  "id": "side-navigation",
  "title": "사이드 메뉴",
  "group": "nav",
  "source": "krds",
  "note": "현재 페이지(여권 발급)를 품은 묶음은 처음부터 펼쳐진다. 「증명서 발급」은 4뎁스 판이 메뉴 위로 덮인다(제목 버튼·Esc 로 닫기)."
 },
 {
  "id": "sidebar",
  "title": "사이드바",
  "group": "nav",
  "source": "shadcn",
  "note": "왼쪽 위 버튼으로 접으면 아이콘만 남는다(메뉴 이름은 스크린리더·마우스 풍선으로)."
 },
 {
  "id": "skeleton",
  "title": "스켈레톤",
  "group": "action",
  "source": "shadcn",
  "note": "불러오는 동안 자리 표시 · 움직임 줄이기 설정이면 반짝임 멈춤"
 },
 {
  "id": "skip-link",
  "title": "건너뛰기 링크",
  "group": "gov",
  "source": "krds",
  "note": "평소엔 숨어 있다가 Tab 으로 초점을 받으면 나타난다. 위는 늘 보이게 한 미리보기, 아래는 실제 동작(Tab 을 눌러 보세요)."
 },
 {
  "id": "slider",
  "title": "슬라이더",
  "group": "form",
  "source": "shadcn",
  "note": "실제 range 입력이라 ←→·Home·End·PageUp/Down 이 그대로 동작합니다."
 },
 {
  "id": "spinner",
  "title": "스피너",
  "group": "action",
  "source": "krds",
  "note": "role=status · 보이는 안내 글 · 줄 안에 놓는 인라인형"
 },
 {
  "id": "step-indicator",
  "title": "단계 표시기",
  "group": "nav",
  "source": "krds"
 },
 {
  "id": "structured-list",
  "title": "구조화 목록",
  "group": "data",
  "source": "krds",
  "note": "카드형(structured_list) · 표형(structured_list_table). 표형은 도구 줄(전체선택·정렬) + 표를 담는다."
 },
 {
  "id": "switch",
  "title": "토글 스위치",
  "group": "form",
  "source": "both"
 },
 {
  "id": "table",
  "title": "표",
  "group": "data",
  "source": "both",
  "note": "머리칸 가운데 · 긴 글 왼쪽 · 비교 숫자 오른쪽 · 짧은 값·날짜 가운데. 캡션은 숨기고 읽어 준다(visible 로 보이게)."
 },
 {
  "id": "tabs",
  "title": "탭",
  "group": "nav",
  "source": "both"
 },
 {
  "id": "tag",
  "title": "태그",
  "group": "action",
  "source": "krds",
  "note": "삭제 버튼 태그(누르면 사라짐) · 링크 태그 · 크기 3종"
 },
 {
  "id": "text-list",
  "title": "텍스트 목록",
  "group": "action",
  "source": "krds",
  "note": "글머리(●·-·○) · 번호 목록 · 3단계까지 겹침"
 },
 {
  "id": "textarea",
  "title": "텍스트 영역",
  "group": "form",
  "source": "both"
 },
 {
  "id": "toast",
  "title": "토스트",
  "group": "overlay",
  "source": "shadcn",
  "note": "sonner 와 같은 사용법 — <Toaster /> 를 한 번 두고 toast() 로 띄운다. 마우스를 올리거나 포커스하면 시간이 멈추고, Alt+T 로 알림 영역에 들어간다."
 },
 {
  "id": "toggle-group",
  "title": "토글 묶음",
  "group": "action",
  "source": "shadcn",
  "note": "하나만 선택(radiogroup, 방향키로 이동·선택) · 여러 개 선택 · 떨어뜨려 놓기"
 },
 {
  "id": "toggle",
  "title": "토글 버튼",
  "group": "action",
  "source": "shadcn",
  "note": "누를 때마다 켜짐/꺼짐(aria-pressed) · 켜짐은 색+체크 표시 · 크기는 버튼과 같다"
 },
 {
  "id": "tooltip",
  "title": "툴팁",
  "group": "overlay",
  "source": "both",
  "note": "마우스를 올리거나 Tab 으로 포커스하면 뜨고 Esc 로 닫힌다. 말풍선(기본)·상자형(box)·세로형(vertical). 툴팁 안에는 링크·버튼을 넣지 않는다."
 },
 {
  "id": "tts",
  "title": "음성 읽기",
  "group": "gov",
  "source": "krds",
  "note": "브라우저 음성 합성으로 글을 읽고, 다시 누르면 멈춘다. 지원하지 않는 브라우저에서는 버튼이 꺼지고 안내가 보인다."
 },
 {
  "id": "tutorial-panel",
  "title": "따라하기 패널",
  "group": "overlay",
  "source": "krds",
  "note": "도움 패널의 따라하기 탭. 과제별 '전체 N단계'를 펼쳐 세부 단계를 본다. 미리보기는 상자 안에 가둬 열린 상태로 시작한다."
 }
];
