"use client";
// 선택 상자 — KRDS 「셀렉트(select·select_size·select_state·select_sorting)」 모양,
//             동작은 WAI-ARIA 「선택 전용 콤보박스」 패턴으로 직접 만든다(네이티브 <select> 쓰지 않음).
//   <Select options={[{ value: "seoul", label: "서울특별시" }, …]} placeholder="시·도 선택" onValueChange={…} />
//   <Select variant="sort" size="medium" options={정렬} defaultValue="new" aria-label="정렬 기준" />
//
// 키보드: 닫힘 — ↓ ↑ Enter Space 로 열기, Home/End, 글자 입력으로 바로 찾기
//         열림 — ↑ ↓ 이동, Home/End, PageUp/PageDown, Enter·Space 선택, Esc 닫기, Tab 은 선택하고 다음 칸으로
// 포커스는 늘 버튼에 있고 목록 항목은 aria-activedescendant 로 가리킨다.
// 화면 아래쪽 자리가 모자라면 위로 연다.
import * as React from "react";
import { cx, useUid } from "./utils";
import { useFieldControl } from "./field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  placeholder?: string;
  /** default = 입력 칸 모양 · sort = KRDS 정렬 선택(목록 위 "최신순" 같은 것) */
  variant?: "default" | "sort";
  size?: "small" | "medium" | "large";
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  /** 폼 전송용 이름 (숨은 input 으로 값을 싣는다) */
  name?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

const PAGE = 10;

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(props, ref) {
  const {
    options, value, defaultValue, onValueChange, placeholder = "선택하세요", variant = "default",
    size, invalid, name, className,
  } = props;
  const f = useFieldControl({
    id: props.id, invalid, disabled: props.disabled, required: props.required, "aria-describedby": props["aria-describedby"],
  });
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [up, setUp] = React.useState(false);
  const base = useUid("hb-sel");
  const btn = React.useRef<HTMLButtonElement>(null);
  const list = React.useRef<HTMLUListElement>(null);
  const typed = React.useRef({ text: "", at: 0 });
  React.useImperativeHandle(ref, () => btn.current as HTMLButtonElement);

  const selIndex = options.findIndex((o) => o.value === current);
  const selected = selIndex >= 0 ? options[selIndex] : undefined;
  const sz = size ?? (variant === "sort" ? "medium" : "large");

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (value === undefined) setInner(o.value);
    if (o.value !== current) onValueChange?.(o.value);
  };
  const step = (from: number, dir: 1 | -1, n = 1) => {
    let i = from;
    let moved = 0;
    let last = from;
    while (moved < n) {
      i += dir;
      if (i < 0 || i >= options.length) break;
      if (!options[i].disabled) { last = i; moved++; }
    }
    return last;
  };
  const first = () => options.findIndex((o) => !o.disabled);
  const lastIdx = () => {
    for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) return i;
    return -1;
  };
  const openAt = (i: number) => {
    setActive(i);
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const findTyped = (ch: string, from: number) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > 600 ? ch : t.text + ch;
    t.at = now;
    const q = t.text.toLowerCase();
    const order = [...options.keys()].map((k) => (from + 1 + k) % options.length);
    // 같은 글자를 반복해 누르면 그 글자로 시작하는 다음 항목으로
    const same = q.split("").every((c) => c === q[0]);
    const hit = order.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(same ? q[0] : q));
    return hit ?? -1;
  };

  // 열릴 때 방향 정하기 + 가리키는 항목 보이게
  React.useLayoutEffect(() => {
    if (!open || !btn.current || !list.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = list.current.offsetHeight;
    const below = window.innerHeight - r.bottom;
    setUp(below < h + 8 && r.top > below);
  }, [open]);
  React.useEffect(() => {
    if (!open || active < 0) return;
    list.current?.querySelector<HTMLElement>(`#${base}-o-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, base]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
        e.preventDefault();
        openAt(selIndex >= 0 ? selIndex : k === "ArrowUp" ? lastIdx() : first());
      } else if (k === "Home") { e.preventDefault(); openAt(first()); }
      else if (k === "End") { e.preventDefault(); openAt(lastIdx()); }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const i = findTyped(k, selIndex);
        if (i >= 0) { e.preventDefault(); openAt(i); }
      }
      return;
    }
    if (k === "ArrowDown") { e.preventDefault(); if (e.altKey) return; setActive((a) => step(a, 1)); }
    else if (k === "ArrowUp") {
      e.preventDefault();
      if (e.altKey) { choose(active); close(); return; }
      setActive((a) => step(a, -1));
    }
    else if (k === "Home") { e.preventDefault(); setActive(first()); }
    else if (k === "End") { e.preventDefault(); setActive(lastIdx()); }
    else if (k === "PageDown") { e.preventDefault(); setActive((a) => step(a, 1, PAGE)); }
    else if (k === "PageUp") { e.preventDefault(); setActive((a) => step(a, -1, PAGE)); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); choose(active); close(); }
    else if (k === "Escape") { e.preventDefault(); close(); }
    else if (k === "Tab") { choose(active); close(false); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = findTyped(k, active);
      if (i >= 0) setActive(i);
    }
  };

  const listId = `${base}-list`;
  const dis = !!f.disabled;
  return (
    <div className={cx("hb-select", variant === "sort" && "is-sort", className)}>
      <button
        ref={btn}
        type="button"
        role="combobox"
        id={f.id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${base}-o-${active}` : undefined}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={f["aria-describedby"]}
        aria-invalid={f["aria-invalid"]}
        aria-required={f.required}
        disabled={dis}
        className={cx(variant === "sort" ? "krds-form-select-sort" : "krds-form-select", sz, selected && "has-value", f["aria-invalid"] && "is-error")}
        onClick={() => (open ? close() : openAt(selIndex >= 0 ? selIndex : first()))}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
      >
        <span className="hb-select-value">{selected ? selected.label : placeholder}</span>
      </button>
      <ul
        ref={list}
        id={listId}
        role="listbox"
        tabIndex={-1}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"] ?? (props["aria-label"] ? undefined : f.id)}
        hidden={!open}
        className={cx("hb-select-list", up && "is-up")}
        onMouseDown={(e) => e.preventDefault()}
      >
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`${base}-o-${i}`}
            role="option"
            aria-selected={o.value === current}
            aria-disabled={o.disabled || undefined}
            className={cx("hb-select-option", i === active && "is-active")}
            onMouseEnter={() => !o.disabled && setActive(i)}
            onClick={() => {
              if (o.disabled) return;
              choose(i);
              close();
            }}
          >
            {o.label}
          </li>
        ))}
      </ul>
      {name && <input type="hidden" name={name} value={current ?? ""} />}
    </div>
  );
});
