// powerMCP 질문 예시 모음 — /powermcp "이런 것까지 물어볼 수 있어요" 갤러리의 원천.
// 규칙: 실제 도구(data/mcp-tools.json)가 하는 일 안에서만 쓴다. tools 는 그 질문에 AI 가 부르는 도구 이름.
// 사용자 실사용 질문 분석이 오면 여기에 그대로 더하거나 바꾼다(화면 코드는 손대지 않는다).

export interface McpExample { q: string; tools: string[]; result: string }
export interface McpExampleGroup { id: string; label: string; desc: string; items: McpExample[] }

export const MCP_EXAMPLE_GROUPS: McpExampleGroup[] = [
  {
    id: "proposal",
    label: "제안 준비",
    desc: "제안요청서를 받은 날부터 발표 전날까지.",
    items: [
      { q: "이 제안요청서로 15분 발표 장표 기획을 잡아 줘. 배점 큰 항목을 앞에 두고", tools: ["deck_get_plan_kit", "deck_check_plan"], result: "기획 재료로 장 목록을 짜고 판정으로 빠진 평가 항목을 짚어 줍니다." },
      { q: "기획한 장표를 장마다 와이어프레임으로 그려 줘", tools: ["deck_get_wire_kit", "deck_check_wireframe"], result: "16:9 장마다 상자 배치를 만들고 겹침·넘침을 판정합니다." },
      { q: "장표마다 30초 분량 발표 대본과 예상 질문을 써 줘", tools: ["deck_get_script_kit", "deck_check_script"], result: "대본을 쓰고 길이·모호한 약속 표현을 검사합니다." },
      { q: "맡겨 둔 장표 변환이 어디까지 됐는지 알려 줘", tools: ["deck_jobs"], result: "작업 상태와 진행률, 끝난 작업의 결과 주소를 돌려줍니다." },
    ],
  },
  {
    id: "assets",
    label: "에셋 찾기",
    desc: "장표·화면에 넣을 아이콘·일러스트·사진.",
    items: [
      { q: "보고서 표지에 넣을 파랑 톤 행정 아이콘 8개를 같은 스타일로", tools: ["assets_search", "assets_style_set"], result: "썸네일이 붙은 목록과 같은 스타일 세트를 돌려줍니다." },
      { q: "'민원 처리 기간 단축' 문장 옆에 어울리는 아이콘 하나만 골라 줘", tools: ["assets_pick"], result: "문장을 읽고 가장 맞는 하나와 후보·확신도를 줍니다." },
      { q: "이 사진과 비슷한 분위기의 사진을 더 찾아 줘", tools: ["assets_similar"], result: "모양·키워드가 가까운 에셋을 순서대로 돌려줍니다." },
      { q: "기후·환경 주제로 쓸 만한 일러스트가 뭐가 있어?", tools: ["assets_list_topics", "assets_search"], result: "주제별 개수와 대표 썸네일을 보여 줍니다." },
      { q: "'스마트시티'로 찾으면 결과가 적어. 다른 검색어를 추천해 줘", tools: ["assets_suggest_keywords"], result: "실제로 등록된 낱말 중 가까운 검색어를 줍니다." },
    ],
  },
  {
    id: "mockup",
    label: "홈페이지 시안",
    desc: "관공서·대학·학교·복지관·재단·협회·기업 홈페이지까지, 레퍼런스를 근거로 시안을 만들고 판정까지.",
    items: [
      { q: "기초지자체 메인 화면 시안을 만들어 줘. 판정을 통과하면 미리보기 주소로", tools: ["mock_get_replica_kit", "mock_check_mockup", "mock_publish_mockup"], result: "재료로 시안을 만들고 고칠 목록을 반영한 뒤 미리보기 주소를 줍니다." },
      { q: "한빛대학교 메인 시안을 만들어 줘", tools: ["mock_get_replica_kit", "mock_check_mockup"], result: "이름으로 기관 종류를 짐작해 대학 레퍼런스와 총장·학사 메뉴로 재료를 줍니다." },
      { q: "복지관 홈페이지 메인을 본문 폭 1200px 로 만들어 줘", tools: ["mock_get_replica_kit"], result: "PC 본문은 기본 1400px 이상입니다. 폭을 정하면 그 폭으로 칸 비율을 맞춥니다." },
      { q: "AI 검색창이 큰 포털형 메인 와이어프레임을 짜 줘. 다른 구성도 보여 줘", tools: ["mock_get_wireframe", "mock_check_wireframe"], result: "포털·LLM·랜딩·캠퍼스·매거진형 등 스타일을 고르고 실제 레퍼런스 구성을 넘겨 봅니다." },
      { q: "대학교 홈페이지는 보통 메인에 어떤 섹션을 어떤 순서로 둬?", tools: ["mock_get_design_brief", "mock_get_page_pattern"], result: "채택률과 순서·높이 통계를 근거와 함께 돌려줍니다." },
      { q: "공지사항 목록과 상세 화면을 한 벌로 만들어 줘", tools: ["mock_build_homepage", "mock_check_mockup"], result: "같은 기관·색·메뉴를 공유하는 화면 묶음을 만듭니다." },
      { q: "이 시안에서 바로가기 영역만 다시 다듬어 줘", tools: ["mock_get_section_pattern", "mock_check_mockup"], result: "그 섹션의 실측 변형을 근거로 고친 뒤 다시 판정합니다." },
      { q: "탭이나 캐러셀이 실제로 움직이게 해 줘", tools: ["mock_get_behavior_kit"], result: "속성만 붙이면 동작하는 스크립트와 규약을 줍니다." },
      { q: "메인 비주얼에 쓸 사진이랑 배너 샘플이 필요해", tools: ["mock_get_sample_images"], result: "용도별 샘플 이미지 주소와 글자 자리 정보를 줍니다." },
    ],
  },
  {
    id: "code",
    label: "코드·부품",
    desc: "시안을 실제 개발 코드로 옮길 때.",
    items: [
      { q: "공지 목록 화면을 React 코드로 줘", tools: ["mock_assemble_screen"], result: "KRDS 기반 부품으로 조립한 React·Vue 코드와 테마 CSS 를 줍니다." },
      { q: "날짜 입력 부품 소스와 설치 방법을 알려 줘", tools: ["guide_get_component"], result: "부품 소스·의존성·사용법·KRDS 지침을 함께 줍니다." },
      { q: "내가 짠 이 버튼 코드가 대비·토큰 규칙에 맞는지 봐 줘", tools: ["guide_check_code"], result: "하드코딩 색·대비 부족·접근성 문제를 줄 단위로 짚습니다." },
      { q: "디자인 토큰을 Tailwind 설정 파일로 줘", tools: ["guide_tokens"], result: "토큰 파일 내용을 그대로 돌려줍니다." },
    ],
  },
  {
    id: "rules",
    label: "디자인 규칙",
    desc: "공공 웹 규칙과 디자이너 선호.",
    items: [
      { q: "KRDS 에서 탭은 몇 개까지 둬도 돼?", tools: ["guide_search_rules", "guide_krds"], result: "해당 지침 문장과 공식 가이드 링크를 줍니다." },
      { q: "오픈 전에 확인할 접근성 체크리스트를 줘", tools: ["guide_get_checklist"], result: "KRDS 검증 항목을 분야별로 돌려줍니다." },
      { q: "검색 버튼은 입력칸 안쪽이 좋아, 바깥이 좋아?", tools: ["mock_get_design_preferences"], result: "디자이너 투표 결과와 판단 근거를 줍니다." },
      { q: "이 기관 사이트의 색·글꼴 체계를 정리해 줘", tools: ["mock_get_design_system"], result: "색 단계·글자 크기·간격을 KRDS 분류로 돌려줍니다." },
    ],
  },
  {
    id: "report",
    label: "확인·보고서",
    desc: "할 수 있는지 먼저 묻고, 결과는 보고서로.",
    items: [
      { q: "PPT 를 영상으로 바꿔 줄 수 있어?", tools: ["powerplus_check_request"], result: "할 수 있는 일인지와 시작할 주소를 솔직하게 알려 줍니다." },
      { q: "방금 추천한 아이콘들을 팀에 공유할 보고서 페이지로 만들어 줘", tools: ["powerplus_publish_report"], result: "썸네일이 붙은 보고서를 게시하고 링크를 줍니다." },
    ],
  },
];
