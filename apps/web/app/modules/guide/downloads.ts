// powerGuide 토큰 산출물 목록 — 종 수를 화면 여러 곳(모듈 배너·메뉴 설명·토큰 화면)이 이 배열 길이로 센다(손으로 적은 "15종"이 어긋나던 것).
export const DOWNLOADS: { file: string; label: string; use: string }[] = [
  { file: "solideo-tokens.css", label: "CSS 변수", use: "어떤 스택이든 — :root 에 변수 선언" },
  { file: "solideo-dark.css", label: "다크 모드 CSS", use: "[data-theme=dark] 덮어쓰기" },
  { file: "solideo-components.css", label: "CSS 전용 부품", use: "퍼블리싱만 있는 프로젝트(.sds-*)" },
  { file: "solideo-shadcn.css", label: "shadcn 레이어", use: "React + shadcn/ui 프로젝트" },
  { file: "tailwind.preset.cjs", label: "Tailwind 프리셋", use: "tailwind.config 의 presets" },
  { file: "solideo-tailwind.theme.css", label: "Tailwind v4 @theme", use: "Tailwind v4 — @import 한 줄" },
  { file: "solideo-tokens.scss", label: "SCSS", use: "Sass 변수" },
  { file: "solideo-tokens.less", label: "Less", use: "Less 변수" },
  { file: "solideo-tokens.js", label: "JS(ESM)", use: "import { tokens }" },
  { file: "solideo-tokens.cjs", label: "JS(CJS)", use: "require()" },
  { file: "solideo-tokens.d.ts", label: "TypeScript 타입", use: "JS 토큰의 타입" },
  { file: "solideo-tokens.flat.json", label: "평면 JSON", use: "도구 연동·검색" },
  { file: "solideo-figma.tokens.json", label: "Figma Tokens Studio", use: "Figma 변수 동기화" },
  { file: "SolideoTokens.java", label: "Java 상수", use: "Spring 서버 렌더" },
  { file: "solideo-tokens.properties", label: "Spring properties", use: "application.properties" },
  { file: "quasar.variables.sass", label: "Quasar 변수", use: "Vue + Quasar 프로젝트" },
  { file: "solideo-icons.svg", label: "아이콘 스프라이트", use: "<use href> 로 쓰는 Material Symbols 47종" },
];
export const DOWNLOAD_COUNT = DOWNLOADS.length;
