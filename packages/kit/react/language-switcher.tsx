"use client";
// 언어 변경 — KRDS 「언어 변경(language_switcher · language_switcher_page)」
//   <LanguageSwitcher defaultValue="ko" onValueChange={setLang} />          ← 드롭다운형: 이 누리집 안에서 언어를 바꾼다
//   <LanguageSwitcher variant="page" value="ko"
//     languages={[{ code: "en", label: "English (영어)", href: "https://en.example" }, …]} /> ← 페이지형: 언어별 누리집으로 새 창 이동
// 네이티브 <select> 를 쓰지 않는다. 버튼(aria-expanded) + 목록. 키보드 ↓/↑·Home/End·Esc.
import * as React from "react";
import { cx } from "./utils";
import { useGovDrop } from "./gov-drop";

export interface LanguageOption {
  /** 언어 코드(lang 속성) */
  code: string;
  /** 보이는 이름 — "English (영어)" 처럼 자기 언어 이름 + 우리말 */
  label: string;
  /** 링크로 이동할 때 */
  href?: string;
}

export const DEFAULT_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English (영어)" },
  { code: "zh", label: "中文 (중국어)" },
  { code: "ja", label: "日本語 (일본어)" },
  { code: "vi", label: "Tiếng Việt (베트남어)" },
];

export interface LanguageSwitcherProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  languages?: LanguageOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (code: string) => void;
  /** dropdown: 목록에서 고른다 / page: 현재 언어를 위에 두고 다른 언어 누리집으로 새 창 이동 */
  variant?: "dropdown" | "page";
  /** 버튼 이름 */
  label?: string;
  /** 메뉴를 버튼 기준 어디에 붙일지(기본 가운데, 화면 끝이면 자동으로 붙음) */
  align?: "center" | "left" | "right";
}

export const LanguageSwitcher = React.forwardRef<HTMLDivElement, LanguageSwitcherProps>(function LanguageSwitcher(
  {
    languages = DEFAULT_LANGUAGE_OPTIONS,
    value: valueProp,
    defaultValue = "ko",
    onValueChange,
    variant = "dropdown",
    label = "언어 변경",
    align = "center",
    className,
    ...props
  },
  ref,
) {
  const d = useGovDrop();
  const [inner, setInner] = React.useState(defaultValue);
  const value = valueProp ?? inner;
  const current = languages.find((l) => l.code === value);
  const pick = (code: string) => {
    setInner(code);
    onValueChange?.(code);
    d.close(true);
  };
  const setRefs = (el: HTMLDivElement | null) => {
    d.wrapProps.ref.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  const list = variant === "page" ? languages.filter((l) => l.code !== value) : languages;

  return (
    <div
      {...props}
      ref={setRefs}
      onKeyDown={d.wrapProps.onKeyDown}
      onBlur={d.wrapProps.onBlur}
      className={cx("krds-drop-wrap krds-language", align !== "center" && `drop-${align}`, d.wrapClass, className)}
    >
      <button {...d.btnProps} className="krds-btn small text drop-btn">
        <i className="svg-icon ico-global" aria-hidden="true" />
        {" "}{label}{" "}
        {current && <span className="sr-only">, 현재 {current.label}</span>}
        <i className="svg-icon ico-toggle" aria-hidden="true" />
      </button>
      <div className="drop-menu" id={d.menuId}>
        <div className="drop-in">
          {variant === "page" && current && (
            <div className="drop-top">
              <p className="current-laguage">
                <span>현재 언어</span>
                <strong lang={current.code}>{current.label}</strong>
              </p>
            </div>
          )}
          <ul className="drop-list">
            {list.map((l) => {
              const on = variant === "dropdown" && l.code === value;
              if (variant === "page" || l.href) {
                const external = variant === "page";
                return (
                  <li key={l.code}>
                    <a
                      href={l.href ?? "#"}
                      className={cx("item-link", on && "active")}
                      lang={l.code}
                      hrefLang={l.code}
                      aria-current={on ? "true" : undefined}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      title={external ? "새 창 열림" : undefined}
                      onClick={() => (external ? d.close() : pick(l.code))}
                    >
                      {l.label}
                      {on && <span className="sr-only"> 선택됨</span>}
                      {external && <i className="svg-icon ico-go" aria-hidden="true" />}
                    </a>
                  </li>
                );
              }
              return (
                <li key={l.code}>
                  <button type="button" className={cx("item-link", on && "active")} lang={l.code} aria-pressed={on} onClick={() => pick(l.code)}>
                    {l.label}
                    {on && <span className="sr-only"> 선택됨</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
});
