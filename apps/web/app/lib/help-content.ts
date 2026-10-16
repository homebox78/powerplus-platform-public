// 출처: homebox-handoff apps/web/app/lib/help-content.ts — 카테고리를 powerPlus 모듈 단위(시작·에셋·장표·목업·가이드·계정)로 다시 썼다.
// 2026-10-06: 문서 본문은 DB(core_help_docs, 마이그레이션 0013)로 옮겼다 — 관리자 /admin/help 에서 편집. 이 파일엔 카테고리(제목·설명)와 본문 파서만 남는다.
// 본문 규칙(markdown 비슷하게): 문단은 빈 줄로 나누고, "1. …" 로 시작하는 줄들은 단계 목록으로 그린다. 가격·요금 숫자는 넣지 않는다(요금제 공개 전).
import type { HelpDoc } from "@/lib/admin";

interface HelpCategoryDef { id: string; title: string; desc: string }
export interface HelpArticle { slug: string; title: string; updated: string; body: string[]; steps?: string[] }
export interface HelpCategory extends HelpCategoryDef { articles: HelpArticle[] }

export const HELP_CATEGORIES: HelpCategoryDef[] = [
  { id: "start", title: "시작하기", desc: "powerPlus 가 무엇이고 어디서 시작하는지." },
  { id: "assets", title: "powerAssets", desc: "애드인 설치와 에셋 검색·삽입." },
  { id: "deck", title: "powerDeck", desc: "장표 변환의 흐름과 공유." },
  { id: "mock", title: "powerMock · MCP", desc: "AI 도구로 목업과 코드를 받는 법." },
  { id: "guide", title: "powerGuide", desc: "디자인 규칙을 프로젝트에 가져다 쓰기." },
  { id: "account", title: "계정·보안", desc: "마이페이지, 키, 알림, 탈퇴." },
];
export const HELP_CAT_KO: Record<string, string> = Object.fromEntries(HELP_CATEGORIES.map((c) => [c.id, c.title]));

/** 본문 → 문단 배열 + 단계 목록(“1. ” 줄). 관리자 편집기와 공개 화면이 같은 규칙을 쓴다. */
export function parseHelpBody(body: string): { body: string[]; steps?: string[] } {
  const paras = body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  const steps: string[] = [];
  for (const p of paras) {
    const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every((l) => /^\d+\.\s/.test(l))) steps.push(...lines.map((l) => l.replace(/^\d+\.\s+/, "")));
    else out.push(lines.join(" "));
  }
  return steps.length > 0 ? { body: out, steps } : { body: out };
}

/** 발행 문서 목록 → 카테고리 트리(문서가 0인 카테고리도 남긴다 — 자리 안내용) */
export function buildHelpTree(docs: HelpDoc[]): HelpCategory[] {
  return HELP_CATEGORIES.map((c) => ({
    ...c,
    articles: docs.filter((d) => d.category === c.id).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ko")).map((d) => ({
      slug: d.slug, title: d.title, updated: d.updated_at.slice(0, 10).replace(/-/g, "."), ...parseHelpBody(d.body),
    })),
  }));
}
