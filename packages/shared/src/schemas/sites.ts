// docs/07 §2.1 search_sites 입력 · docs/08 GET /api/sites 응답 — web·mcp 공용 (zod 4)
import { z } from "zod";
import { taxonomy } from "../taxonomy.ts";

const ids = (list: ReadonlyArray<{ id: string }>) => z.enum(list.map((x) => x.id) as [string, ...string[]]);

export const ToneSchema = z.enum(["navy", "blue", "green", "teal", "red", "orange", "purple", "gray", "gradient", "illust"]);
export type Tone = z.infer<typeof ToneSchema>;

/** tone 컬럼 값('navy') ↔ 스타일 태그 id('tone_navy') 변환 규칙 — 두 표기가 공존하므로 여기서만 바꾼다 */
export const toneTagId = (tone: string): string => (tone.startsWith("tone_") ? tone : `tone_${tone}`);
export const toneFromTag = (tag: string): string => tag.replace(/^tone_/, "");

export const SearchSitesInput = z.object({
  query: z.string().trim().max(100).optional(),
  org_type: z.array(ids(taxonomy.org_types)).optional(),
  site_type: z.array(ids(taxonomy.site_types)).optional(),
  tone: z.array(ToneSchema).optional(),
  layout: z.array(ids(taxonomy.style_tags.filter((t) => t.group === "layout"))).optional(),
  renewal_year_from: z.number().int().min(2000).max(2100).optional(),
  renewal_year_to: z.number().int().min(2000).max(2100).optional(),
  wa_certified: z.boolean().optional(),
  framework: z.string().trim().max(60).optional(),
  vendor: z.string().trim().max(120).optional(),
  krds_score_min: z.number().min(0).max(100).optional(),
  sort: z.enum(["renewed", "newest", "rating", "krds", "views"]).default("renewed"), // newest = 홈박스에 등록(게시)된 순 — 개편순과 구분
  limit: z.number().int().min(1).max(48).default(20),
  cursor: z.string().max(64).optional(),
});
export type SearchSitesInput = z.infer<typeof SearchSitesInput>;

export const SiteListItem = z.object({
  site_id: z.number().int(),
  slug: z.string(),
  title: z.string(),
  url: z.string(),
  org: z.object({
    name: z.string(), type: z.string(), type_ko: z.string(),
    phone: z.string().nullable().optional(), address: z.string().nullable().optional(), postal_code: z.string().nullable().optional(), region: z.string().nullable().optional(),
  }),
  site_type: z.string(),
  renewal_year: z.number().int().nullable(),
  vendor: z.string().nullable(),
  vendor_slug: z.string().nullable().optional(),
  vendor_source: z.string().nullable().optional(), // 'credit'(사이트 표기) | 'g2b'(나라장터) | 'manual'
  renewal_source: z.string().nullable().optional(), // 'wayback'(추정) | 'g2b' | 'manual'
  wa_certified: z.boolean(),
  framework: z.string().nullable().optional(),
  krds_score: z.number().nullable(),
  rating: z.number().nullable(),
  rating_count: z.number().int().optional(),
  rating_breakdown: z.object({ design: z.number(), a11y: z.number(), ux: z.number() }).nullable().optional(),
  favicon_url: z.string().nullable().optional(), // 실제 파비콘(워커 수집, 서명 URL)
  style_tags: z.array(z.string()),
  design: z.object({
    primary: z.string().nullable(),
    tone: z.string().nullable(),
    font_body: z.string().nullable(),
    container_px: z.number().int().nullable(),
    header_type: z.string().nullable(),
    lnb_position: z.string().nullable(),
  }),
  thumb_url: z.string().nullable(),
  page_url: z.string(),
});
export type SiteListItem = z.infer<typeof SiteListItem>;

export const SearchSitesOutput = z.object({
  total: z.number().int(),
  items: z.array(SiteListItem),
  next_cursor: z.string().nullable(),
  attribution: z.string().optional(),
});
export type SearchSitesOutput = z.infer<typeof SearchSitesOutput>;

/** GET /api/sites 쿼리스트링 변환 (배열은 콤마 결합) */
export function toSitesQuery(input: Partial<SearchSitesInput>): URLSearchParams {
  const p = new URLSearchParams();
  const set = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== "") p.set(k, Array.isArray(v) ? v.join(",") : String(v)); };
  set("q", input.query); set("org_type", input.org_type); set("site_type", input.site_type); set("tone", input.tone); set("layout", input.layout);
  set("renewal_from", input.renewal_year_from); set("renewal_to", input.renewal_year_to);
  set("wa", input.wa_certified === undefined ? undefined : input.wa_certified ? 1 : 0);
  set("framework", input.framework); set("vendor", input.vendor); set("krds_min", input.krds_score_min);
  set("sort", input.sort); set("limit", input.limit); set("cursor", input.cursor);
  return p;
}
