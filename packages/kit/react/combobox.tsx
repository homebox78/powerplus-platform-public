"use client";
// 검색되는 선택 상자(콤보 상자) — 네이티브 select 대신 입력칸 + 목록 상자로 직접 만든다.
//   <div className="form-group">
//     <div className="form-tit"><label htmlFor="office">담당 부서</label></div>
//     <Combobox id="office" options={[{ value: "civil", label: "민원여권과" }, …]} placeholder="부서명을 입력하세요" />
//   </div>
//
// 접근성(WAI-ARIA 콤보 상자 · 목록 자동완성): 입력하면 목록이 걸러져 열린다. ↓/↑ 로 항목 이동(포커스는
// 입력칸에 남고 aria-activedescendant 로 알린다), Enter 로 고르기, Esc 로 닫기(닫힌 상태면 입력 지우기),
// Alt+↓ 로 열기. 고른 항목은 체크 표시와 "선택됨" 글자로 함께 알린다.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** 함께 찾아질 낱말 */
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "size"> {
  options: ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** 입력칸 크기(KRDS text_input_size) — 같은 줄 버튼과 맞춘다 */
  size?: "small" | "medium" | "large";
  emptyText?: string;
  /** 처음부터 목록을 연 채로 보여 준다(미리보기용) */
  defaultOpen?: boolean;
  wrapClassName?: string;
  /** 목록 상자 이름(스크린리더) */
  listLabel?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    options,
    value,
    defaultValue = "",
    onValueChange,
    size = "medium",
    emptyText = "일치하는 항목이 없습니다.",
    defaultOpen = false,
    wrapClassName,
    listLabel = "선택 목록",
    className,
    id,
    placeholder,
    disabled,
    ...props
  },
  ref,
) {
  const [inner, setInner] = React.useState(defaultValue);
  const selected = value ?? inner;
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? "";
  const [text, setText] = React.useState(() => labelOf(selected));
  const [typed, setTyped] = React.useState(false);
  const [open, setOpen] = React.useState(defaultOpen);
  const [active, setActive] = React.useState(-1);
  const base = useUid("hb-cb");
  const inputId = id ?? `${base}-input`;
  const listId = `${base}-list`;

  // 밖에서 값을 바꾸면 입력칸 글자도 따라간다
  React.useEffect(() => {
    setText(labelOf(selected));
  }, [selected]);

  const shown = typed && text ? options.filter((o) => norm([o.label, ...(o.keywords ?? [])].join(" ")).includes(norm(text))) : options;
  const enabled = shown.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  const choose = (o: ComboboxOption) => {
    if (o.disabled) return;
    if (value === undefined) setInner(o.value);
    onValueChange?.(o.value);
    setText(o.label);
    setTyped(false);
    setOpen(false);
  };

  const openList = () => {
    setOpen(true);
    const cur = shown.findIndex((o) => o.value === selected);
    setActive(cur >= 0 ? cur : (enabled[0] ?? -1));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const pos = enabled.indexOf(active);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open || e.altKey) return openList();
      setActive(enabled[(pos + 1) % enabled.length] ?? -1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      setActive(enabled[(pos - 1 + enabled.length) % enabled.length] ?? -1);
    } else if (e.key === "Enter") {
      if (open && active >= 0 && shown[active]) {
        e.preventDefault();
        choose(shown[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (text) {
        setText("");
        setTyped(true);
      }
    } else if ((e.key === "Home" || e.key === "End") && open && e.ctrlKey) {
      e.preventDefault();
      setActive(e.key === "Home" ? (enabled[0] ?? -1) : (enabled[enabled.length - 1] ?? -1));
    }
  };

  // 현재 항목이 보이게 스크롤
  React.useEffect(() => {
    if (open && active >= 0) document.getElementById(`${base}-o-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, base]);

  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    setTyped(false);
    setText(labelOf(selected));
  };

  return (
    <div className={cx("form-conts", "btn-ico-wrap", "hb-combobox", wrapClassName)} onBlur={onBlur}>
      <input
        ref={ref}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${base}-o-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        className={cx("krds-input", size, className)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setTyped(true);
          setOpen(true);
          setActive(0);
        }}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        className="krds-btn medium icon hb-combobox-toggle"
        aria-label="목록 열기"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        <i className="svg-icon ico-angle" aria-hidden="true" />
      </button>
      <div id={listId} role="listbox" aria-label={listLabel} className="hb-listbox" hidden={!open}>
        {shown.length === 0 && <p className="hb-listbox-status">{emptyText}</p>}
        {shown.map((o, i) => {
          const isSel = o.value === selected;
          return (
            <div
              key={o.value}
              id={`${base}-o-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={o.disabled || undefined}
              className={cx("hb-menu-item", "has-indicator")}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => !o.disabled && i !== active && setActive(i)}
              onClick={() => choose(o)}
            >
              {isSel && <span className="hb-menu-indicator hb-menu-check" aria-hidden="true" />}
              {o.label}
              {isSel && <span className="sr-only"> 선택됨</span>}
              {o.disabled && <span className="hb-menu-shortcut">선택 불가</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
});
