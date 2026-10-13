"use client";
// 명령 팔레트 — shadcn Command(cmdk) 와 같은 사용법. 검색 입력 + 결과 목록을 직접 구현했다.
//   <Command label="메뉴 찾기">
//     <CommandInput placeholder="찾을 메뉴를 입력하세요" />
//     <CommandList>
//       <CommandEmpty>찾는 메뉴가 없습니다.</CommandEmpty>
//       <CommandGroup heading="민원">
//         <CommandItem value="전입신고" keywords={["이사"]} onSelect={…}>전입신고</CommandItem>
//       </CommandGroup>
//     </CommandList>
//   </Command>
//   <CommandDialog open={open} onOpenChange={setOpen}>…같은 내용…</CommandDialog>   ← 대화상자로 띄우기
//
// 접근성(WAI-ARIA 콤보 상자 + 목록 상자): 포커스는 입력칸에 그대로 두고, ↑↓·Home/End 로 옮긴
// 현재 항목을 aria-activedescendant 로 알린다. Enter 로 고른다. 결과 건수는 상태 영역(role=status)으로 읽힌다.
import * as React from "react";
import { Dialog } from "radix-ui";
import { cx, useUid } from "./utils";

interface Ctx {
  search: string;
  setSearch: (v: string) => void;
  active: string | null;
  setActive: (id: string | null) => void;
  listId: string;
  count: number;
  filter: (text: string) => boolean;
}
const CmdCtx = React.createContext<Ctx | null>(null);
const useCmd = () => {
  const c = React.useContext(CmdCtx);
  if (!c) throw new Error("Command 안에서만 쓸 수 있습니다");
  return c;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export interface CommandProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 목록 상자 이름(스크린리더). 기본 "검색 결과" */
  label?: string;
  /** 직접 거를 때 false — 항목이 늘 보인다(서버 검색 등) */
  shouldFilter?: boolean;
}

export const Command = React.forwardRef<HTMLDivElement, CommandProps>(function Command(
  { label = "검색 결과", shouldFilter = true, className, children, ...props },
  ref,
) {
  const [search, setSearch] = React.useState("");
  const [active, setActive] = React.useState<string | null>(null);
  const [count, setCount] = React.useState(0);
  const listId = useUid("hb-cmd-list");
  const root = React.useRef<HTMLDivElement | null>(null);

  // 걸러진 뒤 보이는 항목 수를 세고, 현재 항목이 사라졌으면 첫 항목으로 옮긴다
  React.useLayoutEffect(() => {
    const opts = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? []);
    setCount(root.current?.querySelectorAll('[role="option"]').length ?? 0);
    if (!opts.some((o) => o.id === active)) setActive(opts[0]?.id ?? null);
  });

  const filter = (text: string) => !shouldFilter || !search || norm(text).includes(norm(search));

  return (
    <CmdCtx.Provider value={{ search, setSearch, active, setActive, listId, count, filter }}>
      <div
        ref={(el) => {
          root.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        className={cx("hb-command", className)}
        data-label={label}
        {...props}
      >
        {children}
        <p className="sr-only" role="status" aria-live="polite">
          {search ? `검색 결과 ${count}건` : ""}
        </p>
      </div>
    </CmdCtx.Provider>
  );
});

export interface CommandInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: string;
  onValueChange?: (v: string) => void;
}

export const CommandInput = React.forwardRef<HTMLInputElement, CommandInputProps>(function CommandInput(
  { className, value, onValueChange, onKeyDown, "aria-label": ariaLabel, placeholder, ...props },
  ref,
) {
  const c = useCmd();
  const current = value ?? c.search;
  React.useEffect(() => {
    if (value !== undefined) c.setSearch(value);
  }, [value]);

  const move = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    const list = document.getElementById(c.listId);
    const opts = Array.from(list?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? []);
    if (!opts.length) return;
    const i = opts.findIndex((o) => o.id === c.active);
    let next = -1;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % opts.length;
    else if (e.key === "ArrowUp") next = i < 0 ? opts.length - 1 : (i - 1 + opts.length) % opts.length;
    else if (e.key === "Home" && e.ctrlKey) next = 0;
    else if (e.key === "End" && e.ctrlKey) next = opts.length - 1;
    else if (e.key === "Enter" && i >= 0) {
      e.preventDefault();
      opts[i].click();
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    c.setActive(opts[next].id);
    opts[next].scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="hb-command-input-wrap">
      <i className="svg-icon ico-sch" aria-hidden="true" />
      <input
        ref={ref}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={c.listId}
        aria-autocomplete="list"
        aria-activedescendant={c.active ?? undefined}
        aria-label={ariaLabel ?? placeholder ?? "검색어"}
        autoComplete="off"
        placeholder={placeholder}
        className={cx("hb-command-input", className)}
        value={current}
        onChange={(e) => {
          c.setSearch(e.target.value);
          onValueChange?.(e.target.value);
        }}
        onKeyDown={move}
        {...props}
      />
    </div>
  );
});

export const CommandList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CommandList(
  { className, "aria-label": ariaLabel, ...props },
  ref,
) {
  const c = useCmd();
  return <div ref={ref} id={c.listId} role="listbox" aria-label={ariaLabel ?? "검색 결과"} className={cx("hb-command-list", className)} {...props} />;
});

export function CommandEmpty({ className, children = "검색 결과가 없습니다.", ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const c = useCmd();
  if (c.count > 0) return null;
  return (
    <p role="presentation" className={cx("hb-command-empty", className)} {...props}>
      {children}
    </p>
  );
}

export interface CommandGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: React.ReactNode;
}

export function CommandGroup({ heading, className, children, ...props }: CommandGroupProps) {
  useCmd(); // 검색어가 바뀔 때 다시 그려져야 빈 묶음을 숨긴다
  const ref = React.useRef<HTMLDivElement>(null);
  const id = useUid("hb-cmd-g");
  const [empty, setEmpty] = React.useState(false);
  React.useLayoutEffect(() => {
    setEmpty(!ref.current?.querySelector('[role="option"]'));
  });

  return (
    <div ref={ref} role="group" aria-labelledby={heading ? id : undefined} hidden={empty} className={cx("hb-command-group", className)} {...props}>
      {heading && (
        <div id={id} role="presentation" className="hb-menu-label">
          {heading}
        </div>
      )}
      {children}
    </div>
  );
}

export interface CommandItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** 거르기·고르기에 쓰는 값. 없으면 글자 내용을 쓴다 */
  value?: string;
  /** 함께 찾아질 낱말(동의어) */
  keywords?: string[];
  disabled?: boolean;
  onSelect?: (value: string) => void;
}

export function CommandItem({ value, keywords = [], disabled, onSelect, className, children, ...props }: CommandItemProps) {
  const c = useCmd();
  const id = useUid("hb-cmd-o");
  const text = value ?? (typeof children === "string" ? children : "");
  if (!c.filter([text, ...keywords].join(" "))) return null;
  const on = c.active === id;
  return (
    <div
      id={id}
      role="option"
      aria-selected={on}
      aria-disabled={disabled || undefined}
      data-value={text}
      className={cx("hb-menu-item", "hb-command-item", className)}
      onMouseMove={() => !disabled && !on && c.setActive(id)}
      onClick={() => !disabled && onSelect?.(text)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CommandSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const c = useCmd();
  if (c.search) return null;
  // 목록(listbox) 안에는 option·group 만 올 수 있다 — 구분선은 보이기만 하고 보조기기에는 숨긴다
  return <div role="none" aria-hidden="true" className={cx("hb-menu-separator", className)} {...props} />;
}

export function CommandShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("hb-menu-shortcut", className)} {...props} />;
}

export interface CommandDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 대화상자 제목(화면에는 숨김, 스크린리더가 읽는다) */
  title?: string;
  label?: string;
  children?: React.ReactNode;
}

export function CommandDialog({ title = "메뉴 찾기", label, children, ...props }: CommandDialogProps) {
  // 바깥 버튼으로 열었을 때도 닫으면 그 버튼으로 포커스를 돌려준다
  const prev = React.useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root {...props}>
      <Dialog.Portal>
        <Dialog.Overlay className="hb-kit hb-command-overlay" />
        <Dialog.Content
          className="hb-kit hb-command-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            prev.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(e) => {
            if (prev.current?.isConnected) {
              e.preventDefault();
              prev.current.focus();
            }
          }}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Command label={label ?? title}>{children}</Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
