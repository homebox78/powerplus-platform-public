// 앞장 고치기(표지 칸·장 이름·장표 제목) — 출처: powerDeck web/src/FrontWire.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useEffect, useRef, useState } from "react";
import type { PlanFront } from "./api";
import { cn } from "./ui";
import { XBox } from "./Wireframe";

/** 앞장 고치기 — 무엇을 고쳤는지(표지 칸 · 장 이름 · 그 장의 장표 제목) */
export type FrontEditEv =
  | { k: "cover"; field: "title" | "project" | "tail" | "date"; v: string }
  | { k: "chapter"; no: number; v: string }
  | { k: "desc"; no: number; v: string }
  | { k: "close"; id: "end" | "qna"; field: "title" | "desc"; v: string };

/** 두 번 눌러 그 자리에서 고치는 글 — 본문 와이어프레임 상자와 같은 조작. Enter·바깥 누르기 = 저장, Esc = 취소 */
function Ed({ v, on, cls, ph, multi }: { v: string; on?: (v: string) => void; cls: string; ph?: string; multi?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [t, setT] = useState(v);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!edit) setT(v); }, [v, edit]);
  useEffect(() => { if (edit) { ref.current?.focus(); ref.current?.select(); } }, [edit]);
  // 고치는 동안은 글 길이만큼 칸이 아래로 늘어난다(잘림 없음)
  useEffect(() => { const el = ref.current; if (!edit || !el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`; }, [edit, t]);
  const box = "block whitespace-pre-line border border-dashed border-[var(--color-line-3)] rounded-[2px] px-[0.6cqw] py-[0.3cqw]";   // 본문 와이어프레임의 글 상자와 같은 모양
  if (!on) return <span className={cn(cls, box)}>{v || ph}</span>;
  if (!edit) return (
    <span className={cn(cls, box, "cursor-text hover:border-[var(--color-point)]", !v && "text-[var(--color-ink-4)]")}
      title="두 번 눌러 고치기" onDoubleClick={(e) => { e.stopPropagation(); setEdit(true); }}>{v || ph}</span>
  );
  const done = (save: boolean) => { setEdit(false); const x = t.replace(/[ \t]+\n/g, "\n").trim(); if (save && x !== v.trim()) on(x); else setT(v); };
  return (
    <textarea ref={ref} value={t} rows={1} title={multi ? "Enter 줄바꿈 · 바깥을 누르거나 Ctrl+Enter 로 저장" : "Shift+Enter 줄바꿈 · Enter 또는 바깥을 누르면 저장"} onChange={(e) => setT(e.target.value)} onClick={(e) => e.stopPropagation()}
      onBlur={() => done(true)} onKeyDown={(e) => { if (e.key === "Escape") done(false); else if (e.key === "Enter" && !e.nativeEvent.isComposing && (multi ? (e.ctrlKey || e.metaKey) : !e.shiftKey)) { e.preventDefault(); done(true); } }}
      className={cn(cls.replace(/\b(truncate|line-clamp-\d+)\b/g, ""), "block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-white border border-[var(--color-point)] outline outline-2 outline-[var(--color-point)] rounded-[2px] px-[0.6cqw] py-[0.3cqw] m-0")} />
  );
}

/**
 * 표지·목차·간지 와이어프레임 — 본문 와이어프레임(WireCanvas)과 같은 모양: 흰 상자 · 회색 테두리 · 그림 자리는 X · 색 없음.
 * onEdit 을 주면 글을 두 번 눌러 그 자리에서 고친다. 글자 크기는 상자 폭 기준(cqw)이라 썸네일과 큰 화면이 같은 비율.
 */
/** 제작 언어별 앞장 낱말 — 엔진 engine/design.py FRONT_WORDS 와 같은 말 */
const FRONT_WORDS: Record<string, { toc: string; present: string; end: string; qna: string }> = {
  ko: { toc: "목차", present: "제안설명회", end: "감사합니다", qna: "질의응답" },
  en: { toc: "Contents", present: "Proposal Presentation", end: "Thank you", qna: "Q&A" },
  ja: { toc: "目次", present: "提案説明会", end: "ありがとうございました", qna: "質疑応答" },
  zh: { toc: "目录", present: "方案说明会", end: "谢谢", qna: "问答" },
  fr: { toc: "Sommaire", present: "Présentation de la proposition", end: "Merci", qna: "Questions" },
  es: { toc: "Índice", present: "Presentación de la propuesta", end: "Gracias", qna: "Preguntas" },
  de: { toc: "Inhalt", present: "Angebotspräsentation", end: "Vielen Dank", qna: "Fragen" },
  vi: { toc: "Mục lục", present: "Thuyết trình đề xuất", end: "Xin cảm ơn", qna: "Hỏi đáp" },
};
export const frontWord = (lang: string | undefined, k: "toc" | "present" | "end" | "qna") => (FRONT_WORDS[lang ?? "ko"] ?? FRONT_WORDS.ko!)[k];

export function FrontWire({ f, className, onEdit, lang }: { f: PlanFront; accent?: string; className?: string; onEdit?: (e: FrontEditEv) => void; lang?: string }) {
  const BOX = "absolute bg-white border border-[var(--color-ink-4)] rounded-[2px]";
  const pic = (label: string, cls: string) => (
    <div className={cn(BOX, "overflow-hidden", cls)}>
      <XBox className="absolute inset-0" />
      <span className="absolute left-[0.8cqw] top-[0.6cqw] text-[1.25cqw] font-bold text-[var(--color-ink-4)] bg-white px-[0.4cqw]">{label}</span>
    </div>
  );
  const logo = (label: string, cls: string) => (
    <div className={cn("absolute h-[4cqw] w-[12cqw] border border-[var(--color-line-3)] overflow-hidden", cls)} title={label}>
      <XBox className="absolute inset-0" />
      <span className="absolute inset-0 grid place-items-center text-[1.1cqw] text-[var(--color-ink-4)] font-semibold"><span className="bg-white px-[0.3cqw]">{label}</span></span>
    </div>
  );
  const chs = f.chapters ?? [];
  const e = onEdit;
  return (
    <div className={cn("relative w-full aspect-[3/2] bg-white overflow-hidden select-none @container", className)}>
      {f.kind === "cover" && <>
        {pic("표지 그림", "left-[60%] top-[8%] w-[36%] h-[72%]")}
        <div className="absolute left-[6%] top-[22%] w-[51%] flex flex-col gap-[1.4cqw]">
          <Ed v={f.project || f.title || ""} ph="사업명(표지 큰 글)" multi on={e && ((v) => e({ k: "cover", field: "project", v }))}
            cls="text-[3.9cqw] font-extrabold leading-[1.2] text-[var(--color-ink)] break-keep line-clamp-2" />
          <span className="self-start border-2 border-[var(--color-ink-4)] rounded-[2px] px-[1.2cqw] py-[0.3cqw]">
            <Ed v={f.tail || ""} ph={frontWord(lang, "present")} on={e && ((v) => e({ k: "cover", field: "tail", v }))} cls="text-[1.7cqw] font-bold text-[var(--color-ink-2)]" />
          </span>
          <Ed v={f.date || ""} ph="작성한 달" on={e && ((v) => e({ k: "cover", field: "date", v }))} cls="text-[1.5cqw] text-[var(--color-ink-4)]" />
        </div>
        {logo("발주기관 로고", "left-[6%] top-[7%]")}
        {logo("제안사 로고", "left-[6%] bottom-[7%]")}
      </>}
      {f.kind === "toc" && <>
        <div className={cn(BOX, "left-[4%] top-[8%] bottom-[8%] w-[26%] flex flex-col justify-center pl-[3%] gap-[0.6cqw]")}>
          <span className="text-[4.6cqw] font-extrabold text-[var(--color-ink)]">{frontWord(lang, "toc")}</span>
          <span className="text-[1.4cqw] tracking-[0.3em] text-[var(--color-ink-4)] font-bold">CONTENTS</span>
        </div>
        <div className={cn("absolute left-[35%] right-[5%] top-[10%] bottom-[10%] grid content-center gap-x-[3cqw] gap-y-[1.1cqw]", chs.length > 7 ? "grid-cols-2" : "grid-cols-1")}>
          {chs.slice(0, 14).map((c) => (
            <div key={c.no} className="flex items-baseline gap-[1.2cqw] min-w-0 border-b border-[var(--color-line-3)] pb-[0.7cqw]">
              <span className="text-[2cqw] font-extrabold text-[var(--color-ink-4)] flex-none">{String(c.no).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1"><Ed v={c.name || ""} ph="장 이름" on={e && ((v) => e({ k: "chapter", no: c.no, v }))} cls="text-[2cqw] font-bold text-[var(--color-ink)] truncate" /></span>
            </div>
          ))}
          {!chs.length && <span className="text-[1.8cqw] text-[var(--color-ink-4)]">장 이름이 여기에 들어갑니다</span>}
        </div>
      </>}
      {f.kind === "div" && <>
        {pic("간지 그림 (흐린 무늬)", "left-[56%] top-[10%] w-[40%] h-[80%]")}
        <div className="absolute left-[7%] top-[22%] w-[45%] flex flex-col gap-[1.2cqw]">
          <span className="text-[1.9cqw] font-extrabold tracking-[0.12em] text-[var(--color-ink-4)]">PART {String(f.no ?? 1).padStart(2, "0")}</span>
          <Ed v={f.name || ""} ph="장 이름" multi on={e && ((v) => e({ k: "chapter", no: f.no ?? 1, v }))} cls="text-[4.2cqw] font-extrabold leading-[1.2] text-[var(--color-ink)] break-keep line-clamp-2" />
          <Ed v={f.desc || ""} ph="이 장의 핵심 한 줄" on={e && ((v) => e({ k: "desc", no: f.no ?? 1, v }))} cls="mt-[0.6cqw] text-[1.9cqw] font-semibold leading-[1.35] text-[var(--color-ink-2)] break-keep line-clamp-2" />
        </div>
      </>}
      {(f.kind === "end" || f.kind === "qna") && <>
        {pic(f.kind === "end" ? "엔딩 그림 (흐린 무늬)" : "질의응답 그림 (흐린 무늬)", "left-[56%] top-[10%] w-[40%] h-[80%]")}
        <div className="absolute left-[7%] top-[30%] w-[45%] flex flex-col gap-[1.2cqw]">
          <Ed v={f.title || ""} ph={frontWord(lang, f.kind === "end" ? "end" : "qna")} on={e && ((v) => e({ k: "close", id: f.kind as "end" | "qna", field: "title", v }))} cls="text-[5cqw] font-extrabold leading-[1.2] text-[var(--color-ink)] break-keep" />
          <Ed v={f.desc || ""} ph={f.kind === "end" ? "마무리 한 줄 (선택)" : "Q&A"} on={e && ((v) => e({ k: "close", id: f.kind as "end" | "qna", field: "desc", v }))} cls="text-[1.9cqw] font-semibold text-[var(--color-ink-2)] break-keep line-clamp-2" />
        </div>
      </>}
    </div>
  );
}
