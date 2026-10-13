// docs/11 §4 스키마 계약 — 원문 예시가 통과하고, 근거 없는 슬롯은 거부되는지
import { describe, expect, it } from "vitest";
import { AssemblySpec, QualityReport, SectionTypeCode, ScreenTypeCode } from "./assembly.ts";
import { taxonomy } from "../taxonomy.ts";

const docsExample = {
  spec_version: "1.0",
  project: "OO청 심사 포털 메인",
  screen_type: "MAIN",
  grid: { container: 1280, columns: 12, gutter: 24 },
  theme: { base: "KRDS", krds_version: "2025", primary: "#1D56BC", font: "Pretendard GOV" },
  slots: [
    { area: "header", section: "GNB", ref: "sec_mfds_gnb", cols: 12, components: ["MegaMenu"], rationale: "심사형 포털 레퍼런스 공통 구조" },
    { area: "top", section: "KPI_SUMMARY", ref: "sec_kdca_kpi", cols: 12, items: 4, components: ["SummaryCard"], rationale: "레퍼런스 7건 중 5건이 상단 KPI 4칸" },
    { area: "left", section: "TASK_TABLE", ref: "sec_mfds_review", cols: 8, density: "dense", components: ["DataTable", "StatusBadge"], rationale: "업무 사용자 중심 → dense 표" },
    { area: "right", section: "NOTICE_LIST", ref: "sec_cheongju_notice", cols: 4, items: 5, components: ["Tabs", "List", "MoreLink"], rationale: "우측 4컬럼 공지 배치 빈도 최다" },
    { area: "footer", section: "FOOTER", ref: "sec_nhis_footer", cols: 12, components: ["LinkList"], rationale: "관련사이트 셀렉트 포함 표준형" },
  ],
  sources: [],
};

type Ex = typeof docsExample;
/** noUncheckedIndexedAccess 대응 — 없는 슬롯이면 테스트가 바로 실패하게 */
const slotOf = (e: Ex, i: number): Ex["slots"][number] => { const s = e.slots[i]; if (!s) throw new Error(`slot ${i} 없음`); return s; };

describe("AssemblySpec", () => {
  it("docs/11 §4.2 예시가 통과한다", () => {
    expect(AssemblySpec.safeParse(docsExample).success).toBe(true);
  });

  it("ref 가 비면 거부한다(근거 없는 슬롯 금지)", () => {
    const bad = structuredClone(docsExample);
    slotOf(bad, 0).ref = "";
    expect(AssemblySpec.safeParse(bad).success).toBe(false);
  });

  it("rationale 이 10자 미만이면 거부한다", () => {
    const bad = structuredClone(docsExample);
    slotOf(bad, 1).rationale = "상단";
    expect(AssemblySpec.safeParse(bad).success).toBe(false);
  });

  it("taxonomy 에 없는 섹션 코드는 거부한다", () => {
    const bad = structuredClone(docsExample);
    slotOf(bad, 0).section = "HEADER_X";
    expect(AssemblySpec.safeParse(bad).success).toBe(false);
  });

  it("cols 는 1~12", () => {
    const bad = structuredClone(docsExample);
    slotOf(bad, 0).cols = 13;
    expect(AssemblySpec.safeParse(bad).success).toBe(false);
  });
});

describe("코드 목록 = taxonomy assembly", () => {
  it("docs/11 §2.2·§2.3 코드가 모두 있다", () => {
    for (const c of ["MAIN", "LIST", "DETAIL", "FORM", "STATS", "POPUP", "SEARCH", "SITEMAP", "INFO"]) expect(ScreenTypeCode.safeParse(c).success).toBe(true);
    const docs = ["GNB", "LNB", "UTIL_BAR", "GOV_BANNER", "FOOTER", "HERO_VISUAL", "MAIN_SEARCH", "QUICK_MENU", "NOTICE_LIST", "NEWS_CARD", "BANNER_ROLL", "POPUP_ZONE", "KPI_SUMMARY", "PROGRESS_STATUS", "TASK_TABLE", "BREADCRUMB", "PAGE_TITLE", "SEARCH_FILTER", "RESULT_TABLE", "DETAIL_VIEW", "FORM_STEP", "SATISFACTION"];
    for (const c of docs) expect(SectionTypeCode.safeParse(c).success).toBe(true);
  });

  it("수집 섹션 유형은 코드 하나에만 묶인다", () => {
    const seen = new Set<string>();
    for (const c of taxonomy.assembly.section_codes) for (const t of c.section_types) {
      expect(seen.has(t)).toBe(false);
      seen.add(t);
      expect(taxonomy.section_types.some((s) => s.id === t)).toBe(true);
    }
  });
});

describe("QualityReport", () => {
  it("게이트는 정확히 7개", () => {
    const ids = ["evidence", "duplication", "style", "krds", "a11y", "sources", "removal"] as const;
    const ok = { passed: true, checks: ids.map((id) => ({ id, status: "pass", detail: "-" })) };
    expect(QualityReport.safeParse(ok).success).toBe(true);
    expect(QualityReport.safeParse({ ...ok, checks: ok.checks.slice(0, 6) }).success).toBe(false);
  });
});
