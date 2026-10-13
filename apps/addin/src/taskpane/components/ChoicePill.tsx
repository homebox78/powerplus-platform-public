// 선택 버튼 + 다크 선택 창 — 플랫폼 웹 apps/web/app/components/hb/choice-button.tsx 와 같은 모양(라벨·현재 값 ▾ → #2A2A2C 창).
// 사이트 규칙 "칩 나열 금지(줄바꿈되며 화면 폭마다 모양이 달라진다)" 를 작업창에도 적용한다(2026-10-07 디자인 정합).
import * as React from "react";

export type PillOption = { key: string; label: string; count?: number };

export default function ChoicePill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PillOption[];
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const cur = options.find((o) => o.key === value)?.label ?? options[0]?.label ?? "";

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className={"pill" + (value !== options[0]?.key ? " pill--on" : "")} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="pill__label">{label}</span>
        <span className="pill__value">{cur}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555555" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="dk-scrim" onClick={() => setOpen(false)}>
          <div className="dk" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
            <div className="dk__head">
              <span className="dk__title">{label}</span>
              <button type="button" className="dk__close" onClick={() => setOpen(false)} aria-label="닫기">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <ul className="dk__list">
              {options.map((o) => {
                const on = o.key === value;
                return (
                  <li key={o.key || "_all"}>
                    <button
                      type="button"
                      className={"dk__item" + (on ? " dk__item--on" : "")}
                      aria-pressed={on}
                      onClick={() => { onChange(o.key); setOpen(false); }}
                    >
                      <span className="dk__item-label">{o.label}</span>
                      {o.count != null && <span className="dk__item-n">{o.count.toLocaleString()}</span>}
                      {on && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
