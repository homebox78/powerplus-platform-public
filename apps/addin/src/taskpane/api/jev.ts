// powerAssets 애드인 — 빠른 판단(Jev) 두 가지(2026-10-07 신규).
// ① 검색어 → 자료 종류 자동 선택  ② 선택한 슬라이드 글 → 어울리는 종류 + 검색 낱말.
// 서버는 AI 가 꺼져 있거나 실패하면 규칙으로, 그것도 안 되면 null 을 준다 → 그때는 지금처럼 전체에서 찾는다.
import { api } from "./config";

export interface RouteResult { kind: string | null; by: "ai" | "rule" | null }
export interface SuggestResult {
  kind: string | null;
  kind_by: "ai" | "rule" | null;
  keyword: string | null;
  keyword_by: "ai" | "rule" | null;
  candidates: string[];
}

/** 검색어 종류 — 1.5초 안에 답이 없으면 포기(검색을 기다리게 하지 않는다) */
export async function routeQuery(q: string): Promise<RouteResult | null> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), 1500);
  try {
    return (await api<RouteResult>("/addin/route", { method: "POST", body: { q }, signal: ctl.signal })).data;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

export async function suggestFromSlide(title: string, text: string): Promise<SuggestResult> {
  return (await api<SuggestResult>("/addin/suggest", { method: "POST", body: { title, text } })).data;
}

/**
 * 지금 선택한 슬라이드(여러 장이면 첫 장)의 제목·본문 글.
 * 제목 = 이름에 Title/제목이 든 도형, 없으면 글이 있는 첫 도형. PowerPointApi 1.5+(getSelectedSlides) 필요.
 */
export async function readSelectedSlide(): Promise<{ title: string; text: string }> {
  if (typeof PowerPoint === "undefined" || !PowerPoint.run) {
    throw new Error("PowerPoint 안에서만 쓸 수 있습니다.");
  }
  return PowerPoint.run(async (ctx) => {
    const slides = ctx.presentation.getSelectedSlides();
    slides.load("items");
    await ctx.sync();
    const slide = slides.items[0];
    if (!slide) throw new Error("슬라이드를 하나 골라 주세요.");
    const shapes = slide.shapes;
    shapes.load("items/name,items/type");
    await ctx.sync();
    // 그림·묶음처럼 글상자가 없는 도형은 읽다 실패한다 — 도형마다 따로 읽는다
    const texts: { name: string; text: string }[] = [];
    for (const s of shapes.items) {
      try {
        const tf = s.textFrame;
        tf.load("hasText");
        tf.textRange.load("text");
        await ctx.sync();
        if (tf.hasText) texts.push({ name: s.name || "", text: (tf.textRange.text || "").trim() });
      } catch {
        /* 글이 없는 도형 */
      }
    }
    const withText = texts.filter((x) => x.text);
    const t = withText.find((x) => /title|제목/i.test(x.name)) ?? withText[0];
    const title = t?.text ?? "";
    const text = withText.filter((x) => x !== t).map((x) => x.text).join("\n");
    return { title, text };
  });
}
