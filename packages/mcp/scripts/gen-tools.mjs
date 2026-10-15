// powerMCP 도구 목록 생성기 — packages/mcp/src/index.ts 의 server.registerTool("이름", { title, description }) 에서
// 이름·제목·설명을 뽑아 apps/web/app/data/mcp-tools.json 으로 쓴다(/powermcp 안내 페이지의 도구 표 원천).
// 손으로 쓴 목록은 도구가 바뀌면 어긋나므로, 도구를 고치면 `pnpm --filter @pp/web gen:mcp-tools` 를 다시 돌린다.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../src/index.ts");
const toolsDir = resolve(here, "../src/tools");
const out = resolve(here, "../../../apps/web/app/data/mcp-tools.json");
// index.ts + src/tools/*.ts (모듈별 도구 파일) — 파일 경계에서 블록이 섞이지 않게 줄바꿈으로 잇는다
const extra = existsSync(toolsDir) ? readdirSync(toolsDir).filter((n) => n.endsWith(".ts")).sort().map((n) => readFileSync(resolve(toolsDir, n), "utf8")) : [];
const text = [readFileSync(src, "utf8"), ...extra].join("\n");

const STR = String.raw`"(?:[^"\\]|\\.)*"`;
const readStr = (block, key) => {
  const m = block.match(new RegExp(String.raw`\b${key}\s*:\s*((?:${STR}\s*\+?\s*)+)`));
  if (!m) return "";
  const parts = m[1].match(new RegExp(STR, "g")) ?? [];
  return parts.map((p) => JSON.parse(p)).join("");
};

// 공개 페이지용 짧은 설명 — MCP 원문 description 은 AI 에게 쓰는 지시라 내부 사정(수집 규모·출처·옛 이름)이 섞인다.
// 화면에는 이 문장을 쓰고, 없으면 원문을 쓴다. 도구를 추가하면 여기에도 한 줄.
const PUBLIC_DESC = {
  mock_get_design_brief: "기관 종류와 요청에 맞는 색·글꼴·배치 방향을 한 장으로 요약해 줍니다.",
  mock_get_section_pattern: "섹션 한 종류의 흔한 모양·크기·위치와 예시 그림을 줍니다.",
  mock_get_page_pattern: "서브 페이지 한 종류의 구성 순서와 필수 섹션을 줍니다.",
  mock_recommend_references: "요청에 맞는 참고 사이트를 순위와 고른 이유와 함께 추천합니다.",
  mock_get_wireframe: "화면 종류와 요청 글로 홈페이지 기획 와이어프레임(줄·칸·섹션)을 만들어 줍니다.",
  mock_check_wireframe: "와이어프레임의 필수 섹션·순서·칸 합계를 판정하고 고칠 곳을 알려 줍니다.",
  mock_search_sites: "참고 사이트를 기관 종류·색·배치 조건으로 찾습니다.",
  mock_get_site: "참고 사이트 한 곳의 화면·디자인 정보를 자세히 봅니다.",
  mock_get_design_system: "참고 사이트의 색·글꼴·간격을 디자인 토큰으로 정리해 줍니다.",
  mock_search_sections: "섹션을 종류·조건으로 찾아 예시 그림과 함께 줍니다.",
  mock_get_screen: "참고 화면 한 장의 섹션 구성을 봅니다.",
  mock_get_section_code: "섹션 하나를 바로 쓸 수 있는 HTML·CSS 로 줍니다.",
  mock_get_page_code: "페이지 한 장을 HTML 로 조립해 줍니다.",
  mock_get_main_mockup: "기관 종류에 맞는 메인 화면 초안을 조립해 줍니다.",
  mock_build_homepage: "메인과 서브를 같은 톤으로 맞춘 홈페이지 초안 한 벌을 만듭니다.",
  mock_get_replica_kit: "완성도 높은 시안을 직접 만들 재료(배치·색·이미지·동작)를 한 묶음으로 줍니다.",
  mock_publish_mockup: "판정을 통과한 시안을 공유 주소로 게시합니다.",
  mock_get_design_preferences: "디자이너들이 더 선호한 선택(버튼·폼·목록 등)을 근거로 조언합니다.",
  mock_check_mockup: "만든 시안을 실제로 그려 보고 점수와 고칠 목록을 돌려줍니다.",
  mock_get_behavior_kit: "캐러셀·탭·메뉴가 실제로 동작하게 하는 스크립트와 사용 규칙을 줍니다.",
  mock_assemble_screen: "화면 하나의 섹션 배치 명세와 React·Vue 코드를 만들어 줍니다.",
  mock_get_sample_images: "목업에 넣을 사진·배너·아이콘 샘플을 고릅니다.",
  mock_get_pattern_stats: "섹션·배치가 얼마나 자주 쓰이는지 통계를 봅니다.",
  guide_krds: "KRDS 컴포넌트 지침과 공식 문서 링크를 찾아 줍니다.",
  guide_list_components: "React·Vue 로 바로 쓰는 UI 부품 77종의 목록을 줍니다.",
  guide_get_component: "부품 하나의 소스 파일·설치 명령·사용 예·KRDS 지침을 줍니다.",
  guide_search_rules: "KRDS 지침·패턴·검증 항목을 낱말로 찾아 줍니다.",
  guide_get_checklist: "KRDS 검증 체크리스트와 부품 판정 결과를 줍니다.",
  guide_check_code: "만든 HTML 의 색·대체 텍스트·라벨·제목·대비를 검사해 고칠 곳을 줍니다.",
  deck_get_plan_kit: "장표 기획을 직접 쓰기 위한 형식·규칙·분량·예시를 줍니다.",
  deck_check_plan: "작성한 기획의 형식·분량·원자료 수치 누락을 판정하고 고칠 곳을 줍니다.",
  deck_get_wire_kit: "기획을 장마다 화면 배치로 옮기기 위한 상자 종류·틀·규칙을 줍니다.",
  deck_check_wireframe: "와이어프레임의 겹침·넘침·누락을 판정하고 장마다 미리보기를 그려 줍니다.",
  deck_get_script_kit: "발표 대본을 쓰기 위한 형식·장당 분량·말투 규칙을 줍니다.",
  deck_check_script: "대본의 장 수·분량·금지 표현·핵심어 포함을 판정하고 고칠 곳을 줍니다.",
  powerplus_check_request: "요청이 powerPlus 로 할 수 있는 일인지, 어느 서비스로 하면 되는지 판정합니다.",
};

// AI 에게 주는 "[먼저 부른다] " 꼬리표·"예: '질문' → 이렇게 부른다." 머리말은 공개 설명에서 뺀다
const stripAiHint = (d) => (d ?? "").replace(/^\[[^\]]*\]\s*/, "").replace(/^예:.*?(부른다|답한다)[^.]*\.\s*/, "").replace(/^'A가 좋아 B가 좋아'[^.]*\.\s*/, "");

const MODULES = [["assets_", "powerAssets"], ["deck_", "powerDeck"], ["mock_", "powerMock"], ["guide_", "powerGuide"]];
const head = /server\.registerTool\(\s*"([a-z0-9_]+)"\s*,\s*\{/g;
const starts = [...text.matchAll(head)];
const tools = starts.map((m, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
  const block = text.slice(m.index, Math.min(end, m.index + 6000));
  const name = m[1];
  const mod = MODULES.find(([p]) => name.startsWith(p))?.[1] ?? "공통";
  return { name, module: mod, title: name === "mock_search_sites" ? "참고 사이트 검색" : readStr(block, "title"), description: PUBLIC_DESC[name] ?? stripAiHint(readStr(block, "description")) };
});

if (tools.length === 0) { console.error("registerTool 호출을 찾지 못했습니다."); process.exit(1); }
const missing = tools.filter((t) => !t.title || !t.description).map((t) => t.name);
if (missing.length) console.warn(`제목·설명이 비어 있는 도구: ${missing.join(", ")}`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: "packages/mcp/src/index.ts", count: tools.length, tools }, null, 2) + "\n");
const byMod = tools.reduce((a, t) => ({ ...a, [t.module]: (a[t.module] ?? 0) + 1 }), {});
console.log(`도구 ${tools.length}개 → ${out}`, byMod);
