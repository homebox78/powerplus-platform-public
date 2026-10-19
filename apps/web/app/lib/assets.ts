// powerAssets 조회 — api/routes/assets.php 와 짝. 목록 봉투의 meta.hidden = 현재 플랜에서 안 보이는 수(업그레이드 안내 근거).
import { queryOptions } from "@tanstack/react-query";
import { apiFetch, apiList } from "@/lib/api";

export type AssetCategory = "icon" | "photo" | "illust" | "diagram" | "logo" | "ppt" | "mockup_sample";
export interface AssetItem {
  id: string;
  category: AssetCategory;
  category_ko: string;
  name: string | null;
  alt: string | null;
  w: number | null;
  h: number | null;
  visibility: string;
  style_group: string | null;
  slide_kind: "package" | "single" | null;
  slide_page: string | null;
  set: { id: string; name: string } | null;
  ai_generated: boolean;
  created_at: string;
  thumb_url: string;
  /** 목록에서만 — 카드에 보일 대표 키워드(최대 4) */
  keywords?: string[];
}
interface AssetDetail extends AssetItem {
  tags: { ko: string[]; en: string[]; meta: string[] };
  original_url: string;
  slide_url?: string;
  uses: number;
}
interface AssetCategoryCount { id: AssetCategory; label: string; count: number; total: number }
interface AssetSet { id: string; name: string; style: string | null; category: string | null; count: number; total: number; cover_url: string | null; recent?: number; updated_at?: string | null }
export interface AssetRequest { id: string; title: string; kind: string | null; detail: string | null; status: "new" | "done" | "rejected"; created_at: string }

export interface AssetListParams { category?: string; q?: string; set?: string; sort?: "newest" | "popular" | "name"; page?: number; limit?: number; /** 로고 분류(gov·local·biz-food…) — api/src/Deck/Logos.php TOPICS */ logo_topic?: string; /** 종류를 고르지 않았을 때 빼는 종류(둘러보기 에셋 탭 = logo) */ except?: string }
interface LogoTopic { id: string; label: string; count: number }

const qs = (p: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "" ) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const assetCategoriesQuery = queryOptions({ queryKey: ["assets", "categories"], queryFn: () => apiFetch<AssetCategoryCount[]>("/assets/categories"), staleTime: 60_000 });
export const assetListQuery = (p: AssetListParams) => queryOptions({ queryKey: ["assets", "items", p], queryFn: () => apiList<AssetItem>(`/assets/items${qs({ ...p })}`), staleTime: 30_000 });
export const assetSetsQuery = (category?: string) => queryOptions({ queryKey: ["assets", "sets", category ?? ""], queryFn: () => apiFetch<AssetSet[]>(`/assets/sets${qs({ category })}`), staleTime: 60_000 });
export const assetDetailQuery = (id: string | null) => queryOptions({ queryKey: ["assets", "item", id], queryFn: () => apiFetch<AssetDetail>(`/assets/items/${id}`), enabled: !!id });
export const logoTopicsQuery = queryOptions({ queryKey: ["assets", "logo-topics"], queryFn: () => apiFetch<LogoTopic[]>("/assets/logo-topics"), staleTime: 300_000 });
/** 자주 사용하는 로고(나만, 로그인 필요) — 사용 + 같은 이름 검색 횟수 순 */
export const frequentLogosQuery = (uid: string) => queryOptions({ queryKey: ["assets", "logos-frequent", uid], queryFn: () => apiFetch<AssetItem[]>("/assets/logos/frequent"), staleTime: 60_000 });
export const assetRequestsQuery =queryOptions({ queryKey: ["assets", "requests"], queryFn: () => apiFetch<AssetRequest[]>("/assets/requests") });

export const CATEGORY_KO: Record<AssetCategory, string> = { icon: "아이콘", photo: "사진", illust: "일러스트", diagram: "다이어그램", logo: "로고", ppt: "장표", mockup_sample: "목업 샘플" };
export const SORT_KO = { newest: "최신순", popular: "인기순", name: "이름순" } as const;
export const REQUEST_STATUS_KO: Record<AssetRequest["status"], string> = { new: "접수", done: "등록됨", rejected: "보류" };

/** 세트 이름(개발용 코드 "icon-flat-blue-glass") → 한글 표시 이름("플랫 · 파랑 · 유리").
 *  아이콘·일러스트 접두는 떼고 낱말마다 번역, 모르는 낱말은 그대로 둔다. 사이트종합평가리포트 2-8. */
const SET_WORD_KO: Record<string, string> = {
  flat: "플랫", business: "비즈니스", doc: "문서", concept: "개념", hero: "히어로", keyvisual: "키비주얼", climate: "기후", glass: "유리", iso: "아이소", "3d": "입체", color: "컬러", blue: "파랑", green: "초록", yellow: "노랑", navy: "남색",
  mint: "민트", lightblue: "하늘", softblue: "연파랑", pastel: "파스텔", clay: "클레이", soft: "부드러운", pale: "연한", gloss: "광택",
  matte: "무광", line: "선", mono: "단색", duotone: "투톤", filled: "채움", light: "밝은", mixed: "혼합", misc: "기타", photo: "사진",
  realistic: "실사", tech: "기술", device: "기기", drop: "물방울", badge: "배지", pedestal: "받침", people: "사람", scene: "장면",
  standard: "기본", cheer: "응원", fullbody: "전신", control: "관제", building: "건물", faceless: "얼굴 없는", half: "반신",
  char: "캐릭터", front: "정면", cute: "귀여운", kr: "한국", biz: "비즈니스", western: "서양", banner: "배너", objects: "사물", semi: "세미",
  si: "SI", deck: "장표", handdrawn: "손그림", gradient: "그라데이션", vp: "세로 제안서", bg: "배경",
  pict: "픽토그램", white: "흰색", solid: "솔리드", point: "포인트", circle: "원형", fill: "채움", isometric: "아이소메트릭", bold: "굵은 선",
  offset: "어긋난 채움", app: "앱", tile: "타일", thin: "가는 선", overlap: "반투명 겹침", office: "오피스", portrait: "인물",
  industry: "산업", field: "현장", finance: "금융", law: "법률", digital: "디지털", city: "도시", infra: "인프라",
  life: "생활", welfare: "복지", education: "교육", health: "보건", safety: "안전", character: "캐릭터",
  nature: "자연", landscape: "풍경", leisure: "여가", culture: "문화",
};
export function setLabel(code: string): string {
  const words = code.replace(/^(icon|illust|photo|diagram|logo)-/, "").split("-").filter(Boolean);
  const out: string[] = [];
  for (const w of words) { const k = SET_WORD_KO[w.toLowerCase()] ?? w; if (!out.includes(k)) out.push(k); }
  return out.join(" · ") || code;
}
