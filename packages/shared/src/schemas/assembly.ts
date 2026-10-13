// docs/11 디자인 조립 모델 — 단계 간 계약(zod 4). PHP 조립기(api/src/Assembly.php) 응답을 MCP·web 이 이것으로 검증한다.
//   ③ PatternSummary → ④ ComponentPlan → ⑤ AssemblySpec → ⑥ QualityReport
// 코드 값(섹션 코드·화면 유형)은 taxonomy.json assembly 블록이 단일 진실 — 여기서는 목록을 읽어 enum 으로 만든다.
import { z } from "zod";
import { taxonomy } from "../taxonomy.ts";

const codes = <T extends { code: string }>(list: ReadonlyArray<T>) => z.enum(list.map((x) => x.code) as [string, ...string[]]);

export const ScreenTypeCode = codes(taxonomy.assembly.screen_types);
export const SectionTypeCode = codes(taxonomy.assembly.section_codes);
export const SectionTypeId = z.enum(taxonomy.section_types.map((s) => s.id) as [string, ...string[]]);
export const Area = z.enum(["header", "top", "left", "center", "right", "bottom", "footer"]);
export const Density = z.enum(["dense", "normal", "airy"]);

/** ③ 패턴 분석 — 섹션 코드 하나를 표본 여러 개로 요약한다. refs 는 실제 section_id(문자열) */
export const PatternFinding = z.object({
  key: z.string(),
  mode: z.union([z.string(), z.number(), z.null()]),
  ratio: z.number().min(0).max(1).optional(),
  distribution: z.record(z.string(), z.number()).optional(),
});
export const PatternSummary = z.object({
  section: SectionTypeCode,
  sample_size: z.number().int().min(0),
  n_sites: z.number().int().min(0),
  adoption: z.number().min(0).max(1),
  avg_position: z.number().min(0).max(1),
  findings: z.array(PatternFinding),
  refs: z.array(z.string()),
});
export type PatternSummary = z.infer<typeof PatternSummary>;

/** ④ 컴포넌트 선택 — 섹션 코드 → 컴포넌트·KRDS 컴포넌트 */
export const ComponentPlanItem = z.object({
  section: SectionTypeCode,
  components: z.array(z.string()).min(1),
  krds_components: z.array(z.string()),
  basis: z.string(),
});
export const ComponentPlan = z.array(ComponentPlanItem);
export type ComponentPlan = z.infer<typeof ComponentPlan>;

/** ⑤ 슬롯 — ref(원본 section_id)와 rationale(근거)이 없으면 만들지 않는다 (docs/11 원칙 2) */
export const Slot = z.object({
  area: Area,
  section: SectionTypeCode,
  section_type: SectionTypeId.optional(), // docs/11 원문 밖 — 코드가 여러 수집 유형을 묶으므로 실제 유형을 같이 싣는다
  ref: z.string().min(1),
  ref_site: z.string().optional(),
  cols: z.number().int().min(1).max(12),
  items: z.number().int().optional(),
  density: Density.optional(),
  components: z.array(z.string()).min(1),
  rationale: z.string().min(10),
});
export type Slot = z.infer<typeof Slot>;

export const AssemblySpec = z.object({
  spec_version: z.literal("1.0"),
  project: z.string(),
  screen_type: ScreenTypeCode,
  grid: z.object({ container: z.number(), columns: z.literal(12), gutter: z.number() }),
  theme: z.object({
    base: z.enum(["KRDS", "CUSTOM"]),
    krds_version: z.string().optional(),
    primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    font: z.string(),
  }),
  slots: z.array(Slot).min(1),
  sources: z.array(z.object({ site_id: z.string(), name: z.string(), url: z.string().url(), captured_at: z.string() })),
});
export type AssemblySpec = z.infer<typeof AssemblySpec>;

/** ⑥ 품질 게이트 결과 (docs/11 §5, 7개 항목) */
export const GateId = z.enum(["evidence", "duplication", "style", "krds", "a11y", "sources", "removal"]);
export const GateCheck = z.object({
  id: GateId,
  status: z.enum(["pass", "fixed", "warn", "fail"]),
  detail: z.string(),
  items: z.array(z.string()).optional(),
});
export const QualityReport = z.object({
  passed: z.boolean(),
  checks: z.array(GateCheck).length(7),
});
export type QualityReport = z.infer<typeof QualityReport>;

/** GET /api/assembly 응답 전체 */
/** 명세 → 키트(@pp/kit) 부품으로 만든 Vue·React 페이지 코드 + 부품 대응표 (사용자 확정 2026-09-29 "둘 다 제공") */
const CodeFile = z.object({ file: z.string(), source: z.string().min(1) });
export const AssemblyCode = z.object({
  react: CodeFile,
  vue: CodeFile,
  theme: CodeFile,
  component_map: z.array(z.object({
    section: SectionTypeCode,
    area: Area,
    ref: z.string(),
    kit: z.array(z.string()),
    react: z.string().nullable(),
    vue: z.string().nullable(),
    props: z.string().nullable(),
    usage: z.string(),
    spec_components: z.array(z.string()),
  })),
  install: z.array(z.string()),
});
export type AssemblyCode = z.infer<typeof AssemblyCode>;

export const AssemblyResult = z.object({
  spec: AssemblySpec,
  patterns: z.array(PatternSummary),
  component_plan: ComponentPlan,
  candidates: z.array(z.object({ screen_id: z.string(), site: z.string(), title: z.string().nullable(), score: z.number() })),
  quality: QualityReport,
  n_screens: z.number().int(),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.array(z.string()),
  code: AssemblyCode.optional(), // code=0 이면 없음
});
export type AssemblyResult = z.infer<typeof AssemblyResult>;
