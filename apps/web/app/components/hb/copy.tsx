import { Fragment, type ReactNode } from "react";

// 사이트 공통 문구 규칙 (사용자 지시 2026-09-24): 문장이 끝나는 마침표(.·!·?)마다 줄바꿈. 여러 문장이 한 줄에 이어지지 않게 한다.
// 사용: <Copy text="… 합니다. … 합니다." /> 또는 children 문자열. 숫자 소수점(1.6)·약어(e.g.)는 뒤에 공백이 없으면 안 나눈다.
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=\S)/).map((s) => s.trim()).filter(Boolean);
}

// 글 속 주소(https://… 또는 github.com/… 꼴)는 새 창 링크로 (사용자 지시 2026-10-07 "링크에는 링크가 걸리게 blank로")
const URL_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|kr|net|org|io|dev|ai)(?:\/[^\s)<>]*)?/gi;

function Linkify({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const trail = url.match(/[.,;:!?'"]+$/)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    out.push(
      <a key={at} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
        {url}
      </a>,
    );
    last = at + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// 문장마다 .pp-sent(inline-block + text-wrap: balance) — 한 문장이 두 줄로 넘치면 고르게 나눠 마지막 어절 한두 개만 떨어지는 "꼬리 한 줄"을 막는다(사용자 2026-10-06, 품질 판정 GEN-007).
export function Copy({ text, children, className, as: Tag = "p" }: { text?: string; children?: string; className?: string; as?: "p" | "span" | "div" }) {
  const parts = splitSentences(text ?? children ?? "");
  return (
    <Tag className={className}>
      {parts.map((s, i) => <Fragment key={i}><span className="pp-sent"><Linkify text={s} /></span>{i < parts.length - 1 && <br />}</Fragment>)}
    </Tag>
  );
}

/** 모바일에서만 마침표 뒤 줄바꿈(사용자 2026-10-10 "모바일에서는 마침표에서 줄바꿈") — PC 는 한 줄로 이어지게 공백만 남는다 */
export function MBr() {
  return <>{" "}<br className="sm:hidden" /></>;
}
