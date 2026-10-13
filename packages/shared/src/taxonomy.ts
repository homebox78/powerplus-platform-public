// taxonomy.json이 단일 진실 — 여기서는 타입만 붙여 재수출한다 (CLAUDE.md 개발 원칙 1)
import taxonomyJson from "../taxonomy.json" with { type: "json" };

export interface OrgType { id: string; parent: string | null; name_ko: string }
export interface SiteType { id: string; name_ko: string }
export interface PageType { id: string; name_ko: string; scope: "main" | "sub" | "common" }
export interface SectionType { id: string; name_ko: string; scope: "common" | "main" | "sub"; dom_hints: string[] }
/** feature = AI 검색·챗봇·검색 레이어 등 기능 보유 태그 (2026-09-23, 관공서 화두 — 디자이너 참고용) */
export interface StyleTag { id: string; group: "tone" | "layout" | "shape" | "density" | "icon" | "feature"; name_ko: string }
export interface KrdsComponent { id: string; category: string; name_ko: string; name_en: string }
export interface KrdsComponentCategory { id: string; name_ko: string }
export interface KrdsPattern { id: string; kind: "basic" | "service"; name_ko: string }
export interface FlowScenario { id: string; name_ko: string; krds_pattern: string; stop_at: string | null }

/** -1 = 무제한 (plans.limits 관례) */
export interface PlanLimits {
  screens_per_site: number;
  search_per_day: number;
  collections: number;
  mcp_keys: number;
  mcp_calls_day: number;
  download: boolean;
  pptx: boolean;
  design_data: "summary" | "full";
  min_seats?: number;
  tax_invoice?: boolean;
  api?: boolean;
  vendor_badge?: number;
}
export interface Plan { id: "free" | "pro" | "team" | "enterprise"; name_ko: string; price_month: number; price_year: number; limits: PlanLimits }

/** docs/11 조립 모델 — code(조립 명세 섹션 코드) ↔ section_types(수집 유형 id). section_types 가 비면 아직 수집하지 않는 코드 */
export interface AssemblyScreenType { code: string; name_ko: string; page_types: string[]; required: string[] }
export interface AssemblySectionCode { code: string; group: "global" | "entry" | "info" | "work" | "sub"; name_ko: string; section_types: string[]; components: string[]; draft?: boolean }
export interface AssemblyTaxonomy { spec_version: string; note: string; screen_types: AssemblyScreenType[]; section_codes: AssemblySectionCode[] }

export interface Taxonomy {
  version: string;
  org_types: OrgType[];
  site_types: SiteType[];
  page_types: PageType[];
  section_types: SectionType[];
  style_tags: StyleTag[];
  krds_components: KrdsComponent[];
  krds_component_categories: KrdsComponentCategory[];
  krds_patterns: KrdsPattern[];
  section_krds_default_map: Record<string, string[]>;
  flows: FlowScenario[];
  plans: Plan[];
  assembly: AssemblyTaxonomy;
}

export const taxonomy = taxonomyJson as Taxonomy;

export const UNLIMITED = -1;
export const isUnlimited = (n: number): boolean => n === UNLIMITED;

/** id → name_ko 조회 (패싯 라벨·MCP 응답용) */
export const nameKo = (list: ReadonlyArray<{ id: string; name_ko: string }>, id: string): string =>
  list.find((x) => x.id === id)?.name_ko ?? id;
