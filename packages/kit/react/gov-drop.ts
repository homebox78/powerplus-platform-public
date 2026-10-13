// 정부 서비스 공통(G 묶음) 내부 도우미 — KRDS 「드롭다운(krds-drop-wrap)」 열고 닫기
//   language-switcher·resize·header 유틸 메뉴가 함께 쓴다. (.ts 라 index 로 내보내지 않는다)
//   키보드: 버튼 ↓/Enter/Space 로 열기, 목록 안 ↑/↓·Home/End 이동, Esc 닫고 버튼으로 복귀,
//   바깥 누름·초점 이탈 시 닫기. 화면 끝에 걸리면 drop-left/drop-right 로 붙인다(KRDS 와 같음).
import * as React from "react";
import { uid } from "./utils";

const ITEMS = ".drop-menu .item-link, .drop-menu .drop-bottom button";

export function useGovDrop() {
  const [open, setOpen] = React.useState(false);
  const [align, setAlign] = React.useState<"" | "drop-left" | "drop-right">("");
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const focusFirst = React.useRef(false);
  const [menuId] = React.useState(() => uid("hb-drop"));

  const items = () => Array.from(wrapRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []);
  const close = React.useCallback((restore = false) => {
    setOpen(false);
    if (restore) btnRef.current?.focus();
  }, []);

  // 바깥 누름 → 닫기
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // 열린 직후: 화면 밖으로 나가면 한쪽으로 붙이고, 키보드로 열었으면 첫 항목(또는 선택 항목)에 초점
  React.useLayoutEffect(() => {
    if (!open) {
      setAlign("");
      return;
    }
    const menu = wrapRef.current?.querySelector<HTMLElement>(".drop-menu");
    if (menu) {
      const r = menu.getBoundingClientRect();
      if (r.left < 0) setAlign("drop-left");
      else if (r.right > window.innerWidth) setAlign("drop-right");
    }
    if (focusFirst.current) {
      focusFirst.current = false;
      const list = items();
      (list.find((el) => el.classList.contains("active")) ?? list[0])?.focus();
    }
  }, [open]);

  const onWrapKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % list.length;
    else if (e.key === "ArrowUp") next = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    if (next >= 0 && list[next]) {
      e.preventDefault();
      list[next].focus();
    }
  };

  const onWrapBlur = (e: React.FocusEvent) => {
    // relatedTarget 이 없으면(마우스로 초점 없는 곳을 누름) 바깥 누름 처리에 맡긴다
    const to = e.relatedTarget as Node | null;
    if (open && to && !wrapRef.current?.contains(to)) setOpen(false);
  };

  const onBtnKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      focusFirst.current = true;
      setOpen(true);
    }
  };

  const onBtnClick = (e: React.MouseEvent) => {
    // 키보드 Enter/Space 로 연 경우(detail 0)도 첫 항목에 초점
    if (!open && e.detail === 0) focusFirst.current = true;
    setOpen((v) => !v);
  };

  return {
    open,
    setOpen,
    close,
    menuId,
    wrapClass: [open && "hb-open", align].filter(Boolean).join(" "),
    wrapProps: { ref: wrapRef, onKeyDown: onWrapKeyDown, onBlur: onWrapBlur },
    btnProps: {
      ref: btnRef,
      type: "button" as const,
      "aria-expanded": open,
      "aria-controls": menuId,
      onClick: onBtnClick,
      onKeyDown: onBtnKeyDown,
    },
  };
}

/** 대상 요소 찾기 — 선택자 문자열·요소·함수 모두 받는다 */
export function resolveTarget(target: string | HTMLElement | null | undefined, fallback = ".hb-kit"): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (target && typeof target !== "string") return target;
  return document.querySelector<HTMLElement>(target || fallback);
}
