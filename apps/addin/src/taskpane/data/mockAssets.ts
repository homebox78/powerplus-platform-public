/* Phase 1용 mock 자산 데이터.
   나중에 서버 API(GET /api/assets)로 교체될 자리.
   각 자산은 SVG 문자열을 가지고 있고,
   - 그리드 썸네일: SVG를 그대로 렌더
   - 슬라이드 삽입: SVG -> PNG(base64) 변환 후 Office.js addImage()
*/

export interface Asset {
  id: string;
  name: string | null;
  category: string; // 'icon' | 'photo' | 'illust' | 'diagram' 또는 동적 카테고리 key
  tags: string[];
  svg?: string; // 구 mock 자산: 인라인 SVG
  image_url?: string; // 서버 업로드 자산: PNG/JPG 원본 URL (삽입에 사용)
  thumb_url?: string; // 목록 표시용 축소 썸네일 URL (없으면 image_url 폴백)
  slide_url?: string; // 장표(ppt) 자산: .pptx URL (있으면 슬라이드로 삽입)
  slide_kind?: string; // 장표: 'package' | 'single'
  slide_page?: string; // 장표 single: 'cover'|'toc'|'divider'|'content'|'greeting'|'qa'|'etc'
}

export interface Category {
  key: string;
  label: string;
  /** 등록된 자산 수(서버가 내려줌) */
  count?: number;
}

export const CATEGORIES: Category[] = [
  { key: "all", label: "전체" },
  { key: "icon", label: "아이콘" },
  { key: "photo", label: "사진" },
  { key: "illust", label: "일러스트" },
  { key: "diagram", label: "다이어그램" },
];

// 공통 SVG 헬퍼
const icon = (inner: string, color = "#2563eb"): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
     <g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
   </svg>`;

const photo = (stops: string, label: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
     <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>
     <rect width="100" height="100" rx="8" fill="url(#g)"/>
     <text x="50" y="55" font-size="13" fill="#ffffff" text-anchor="middle" font-family="sans-serif">${label}</text>
   </svg>`;

export const MOCK_ASSETS: Asset[] = [
  // ── 아이콘 ──
  {
    id: "ic-arrow-up",
    name: "상승 화살표",
    category: "icon",
    tags: ["화살표", "상승", "증가", "비즈니스"],
    svg: icon(`<path d="M50 78 L50 26 M30 46 L50 24 L70 46"/>`, "#16a34a"),
  },
  {
    id: "ic-arrow-down",
    name: "하락 화살표",
    category: "icon",
    tags: ["화살표", "하락", "감소"],
    svg: icon(`<path d="M50 22 L50 74 M30 54 L50 76 L70 54"/>`, "#dc2626"),
  },
  {
    id: "ic-check",
    name: "체크",
    category: "icon",
    tags: ["완료", "확인", "체크"],
    svg: icon(`<path d="M26 52 L44 70 L76 32"/>`, "#16a34a"),
  },
  {
    id: "ic-star",
    name: "별",
    category: "icon",
    tags: ["즐겨찾기", "별", "추천"],
    svg: icon(
      `<path d="M50 20 L60 42 L84 44 L66 60 L72 84 L50 70 L28 84 L34 60 L16 44 L40 42 Z"/>`,
      "#f59e0b"
    ),
  },
  {
    id: "ic-gear",
    name: "설정 기어",
    category: "icon",
    tags: ["설정", "기어", "톱니"],
    svg: icon(
      `<circle cx="50" cy="50" r="14"/><path d="M50 20 L50 30 M50 70 L50 80 M20 50 L30 50 M70 50 L80 50 M29 29 L36 36 M64 64 L71 71 M71 29 L64 36 M36 64 L29 71"/>`,
      "#475569"
    ),
  },
  {
    id: "ic-bell",
    name: "알림 종",
    category: "icon",
    tags: ["알림", "종", "공지"],
    svg: icon(
      `<path d="M34 64 Q34 40 50 36 Q66 40 66 64 L70 70 L30 70 Z M44 76 Q50 84 56 76"/>`,
      "#ea580c"
    ),
  },
  {
    id: "ic-mail",
    name: "메일",
    category: "icon",
    tags: ["메일", "이메일", "연락"],
    svg: icon(`<rect x="24" y="32" width="52" height="36" rx="4"/><path d="M24 36 L50 54 L76 36"/>`, "#2563eb"),
  },
  {
    id: "ic-user",
    name: "사용자",
    category: "icon",
    tags: ["사용자", "사람", "프로필"],
    svg: icon(`<circle cx="50" cy="40" r="14"/><path d="M26 78 Q26 56 50 56 Q74 56 74 78"/>`, "#7c3aed"),
  },

  // ── 사진(샘플 그라데이션) ──
  {
    id: "ph-ocean",
    name: "바다",
    category: "photo",
    tags: ["바다", "자연", "파랑", "배경"],
    svg: photo(`<stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#1e3a8a"/>`, "바다"),
  },
  {
    id: "ph-sunset",
    name: "노을",
    category: "photo",
    tags: ["노을", "하늘", "주황", "배경"],
    svg: photo(`<stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#be185d"/>`, "노을"),
  },
  {
    id: "ph-forest",
    name: "숲",
    category: "photo",
    tags: ["숲", "자연", "초록", "배경"],
    svg: photo(`<stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#14532d"/>`, "숲"),
  },
  {
    id: "ph-night",
    name: "밤하늘",
    category: "photo",
    tags: ["밤", "하늘", "보라", "배경"],
    svg: photo(`<stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#0f172a"/>`, "밤하늘"),
  },

  // ── 일러스트 ──
  {
    id: "il-rocket",
    name: "로켓",
    category: "illust",
    tags: ["로켓", "출시", "성장", "시작"],
    svg: icon(
      `<path d="M50 18 Q66 36 66 58 L34 58 Q34 36 50 18 Z"/><circle cx="50" cy="44" r="6"/><path d="M34 58 L26 74 L40 66 M66 58 L74 74 L60 66 M44 70 L50 82 L56 70"/>`,
      "#ef4444"
    ),
  },
  {
    id: "il-bulb",
    name: "아이디어 전구",
    category: "illust",
    tags: ["아이디어", "전구", "창의"],
    svg: icon(
      `<path d="M50 22 Q68 22 68 42 Q68 54 58 60 L58 70 L42 70 L42 60 Q32 54 32 42 Q32 22 50 22 Z"/><path d="M44 78 L56 78"/>`,
      "#eab308"
    ),
  },
  {
    id: "il-target",
    name: "타겟",
    category: "illust",
    tags: ["목표", "타겟", "과녁"],
    svg: icon(`<circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="18"/><circle cx="50" cy="50" r="6"/>`, "#db2777"),
  },

  // ── 다이어그램 ──
  {
    id: "dg-flow",
    name: "프로세스 흐름",
    category: "diagram",
    tags: ["프로세스", "흐름", "단계", "플로우"],
    svg: icon(
      `<rect x="14" y="42" width="20" height="16" rx="3"/><rect x="42" y="42" width="20" height="16" rx="3"/><rect x="70" y="42" width="16" height="16" rx="3"/><path d="M34 50 L42 50 M62 50 L70 50"/>`,
      "#0891b2"
    ),
  },
  {
    id: "dg-org",
    name: "조직도",
    category: "diagram",
    tags: ["조직도", "계층", "구조"],
    svg: icon(
      `<rect x="40" y="18" width="20" height="14" rx="3"/><rect x="18" y="60" width="20" height="14" rx="3"/><rect x="62" y="60" width="20" height="14" rx="3"/><path d="M50 32 L50 46 M28 60 L28 46 L72 46 L72 60"/>`,
      "#0891b2"
    ),
  },
  {
    id: "dg-pie",
    name: "원형 차트",
    category: "diagram",
    tags: ["차트", "비율", "통계", "파이"],
    svg: icon(
      `<circle cx="50" cy="50" r="30"/><path d="M50 50 L50 20 M50 50 L76 62"/>`,
      "#0891b2"
    ),
  },
];

/** 카테고리 + 검색어로 필터링 (서버 검색 API가 들어오면 이 함수가 fetch로 대체됨) */
export function filterAssets(category: string, query: string): Asset[] {
  const q = query.trim().toLowerCase();
  return MOCK_ASSETS.filter((a) => {
    const catOk = category === "all" || a.category === category;
    if (!catOk) return false;
    if (!q) return true;
    return (
      (a.name || "").toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}
