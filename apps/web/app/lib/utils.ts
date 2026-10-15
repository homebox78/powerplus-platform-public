// 공용 작은 도우미 — 클래스 합치기(cn, shadcn 기본)·날짜 표기·화면 제목에서 페이지 이름.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 날짜 표기 규칙: YYYY.MM.DD (CLAUDE.md 개발 원칙 6) */
export function formatDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}.${mm}.${dd}`;
}

/** 화면 제목에서 페이지 이름 — "인권경영활동 < 인권경영 < … 한국광해광업공단" → "인권경영활동",
 *  "교육부 > 교육부 소개 > 연혁 > 교육부 연혁" → "교육부 연혁". 메뉴 구분자(< > | :, 앞뒤 공백 있는 -)에서만 끊는다(가운뎃점은 이름의 일부). */
export function pageName(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "";
  if (/\s>\s/.test(t) && !/\s<\s/.test(t)) {
    const head = t.split(/\s+\|\s+|\s+-\s+/)[0] ?? t;
    return head.split(/\s*>\s*/).map((x) => x.trim()).filter(Boolean).pop() ?? "";
  }
  return t.split(/\s*[<|]\s*|\s+-\s+|\s*:\s+/).map((x) => x.trim()).filter(Boolean)[0] ?? t;
}
