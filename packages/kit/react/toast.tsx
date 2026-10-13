"use client";
// 토스트 — sonner 와 같은 사용법. 새 패키지 없이 직접 만들었다(KRDS 에 없음, 모양은 KRDS 토큰·상태 아이콘).
//   <Toaster />                          ← 앱에 한 번
//   toast("민원이 접수되었습니다");
//   toast.success("저장했습니다", { description: "접수번호 2026-0412" });
//   toast.error("전송하지 못했습니다", { action: { label: "다시 시도", onClick: retry } });
//   toast.promise(save(), { loading: "저장 중…", success: "저장했습니다", error: "저장하지 못했습니다" });
//   toast.dismiss(id)
//
// 접근성: 알림 영역은 aria-live="polite"(오류는 role="alert"로 즉시 읽힘). 마우스를 올리거나 포커스가 들어가면
// 사라지는 시간이 멈춘다(WCAG 2.2.1 시간 조절). Alt+T 로 알림 영역으로 바로 이동, 각 알림에 닫기 버튼.
// 상태는 색만이 아니라 아이콘과 숨은 글자("성공" 등)로 함께 알린다.
import * as React from "react";
import { createPortal } from "react-dom";
import { cx } from "./utils";

export type ToastType = "default" | "success" | "error" | "info" | "warning" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string | number;
  description?: React.ReactNode;
  /** 사라지기까지(ms). Infinity 면 직접 닫을 때까지 */
  duration?: number;
  action?: ToastAction;
}

export interface ToastItem extends ToastOptions {
  id: string | number;
  type: ToastType;
  message: React.ReactNode;
}

// ── 저장소(부품 밖에서도 toast() 를 부를 수 있게 모듈에 둔다)
let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function push(type: ToastType, message: React.ReactNode, opts: ToastOptions = {}) {
  const id = opts.id ?? `hb-toast-${++seq}`;
  const next: ToastItem = { ...opts, id, type, message };
  const i = items.findIndex((t) => t.id === id);
  items = i >= 0 ? items.map((t, k) => (k === i ? next : t)) : [...items, next];
  emit();
  return id;
}

type PromiseMsg<T> = React.ReactNode | ((v: T) => React.ReactNode);
const resolveMsg = <T,>(m: PromiseMsg<T>, v: T) => (typeof m === "function" ? (m as (v: T) => React.ReactNode)(v) : m);

export const toast = Object.assign((message: React.ReactNode, opts?: ToastOptions) => push("default", message, opts), {
  success: (m: React.ReactNode, o?: ToastOptions) => push("success", m, o),
  error: (m: React.ReactNode, o?: ToastOptions) => push("error", m, o),
  info: (m: React.ReactNode, o?: ToastOptions) => push("info", m, o),
  warning: (m: React.ReactNode, o?: ToastOptions) => push("warning", m, o),
  loading: (m: React.ReactNode, o?: ToastOptions) => push("loading", m, { duration: Infinity, ...o }),
  promise<T>(p: Promise<T>, msg: { loading: React.ReactNode; success: PromiseMsg<T>; error: PromiseMsg<unknown> }) {
    const id = push("loading", msg.loading, { duration: Infinity });
    p.then(
      (v) => push("success", resolveMsg(msg.success, v), { id }),
      (e) => push("error", resolveMsg(msg.error, e), { id }),
    );
    return p;
  },
  dismiss(id?: string | number) {
    items = id === undefined ? [] : items.filter((t) => t.id !== id);
    emit();
  },
});

// 포커스가 들어 있던 알림을 닫으면 이웃 알림으로 포커스를 옮긴다(포커스가 body 로 사라지지 않게)
function dismissKeepFocus(id: string | number, from: HTMLElement) {
  const li = from.closest(".hb-toast");
  const next = (li?.nextElementSibling ?? li?.previousElementSibling) as HTMLElement | null;
  const had = !!li?.contains(document.activeElement);
  toast.dismiss(id);
  if (had && next) requestAnimationFrame(() => next.focus());
}

// ── 표시
export type ToasterPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface ToasterProps {
  position?: ToasterPosition;
  /** 기본 사라짐 시간(ms) */
  duration?: number;
  /** 한 번에 보이는 최대 개수(넘치면 오래된 것부터 숨김) */
  visibleToasts?: number;
  closeButton?: boolean;
  label?: string;
}

const TYPE_LABEL: Record<ToastType, string> = { default: "알림", success: "성공", error: "오류", info: "안내", warning: "주의", loading: "처리 중" };
const TYPE_ICON: Partial<Record<ToastType, string>> = {
  success: "ico-success-fill",
  error: "ico-error-fill",
  info: "ico-information-fill",
  warning: "ico-urgent-danger",
};

export function Toaster({ position = "bottom-right", duration = 4000, visibleToasts = 3, closeButton = true, label = "알림" }: ToasterProps) {
  const list = React.useSyncExternalStore(subscribe, () => items, () => items);
  const [mounted, setMounted] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [focusIn, setFocusIn] = React.useState(false);
  const paused = hover || focusIn;
  const regionRef = React.useRef<HTMLElement>(null);
  // 알림마다 남은 시간 — 멈췄다 다시 흐를 때 이어서 센다
  const timers = React.useRef(new Map<string | number, { left: number; started: number; handle?: number; type: ToastType }>());

  React.useEffect(() => setMounted(true), []);
  // 마우스 올림은 네이티브 이벤트로 — React 의 합성 onMouseLeave 는 포인터 아래 알림이 지워지면 빠질 때가 있다
  React.useEffect(() => {
    const r = regionRef.current;
    if (!r) return;
    const on = () => setHover(true);
    const off = () => setHover(false);
    r.addEventListener("mouseenter", on);
    r.addEventListener("mouseleave", off);
    return () => {
      r.removeEventListener("mouseenter", on);
      r.removeEventListener("mouseleave", off);
    };
  }, [mounted]);
  // 포커스가 있던 알림이 사라지면 blur 가 오지 않는다 → 목록이 바뀔 때마다 다시 확인
  React.useEffect(() => {
    setFocusIn(!!regionRef.current?.contains(document.activeElement));
  }, [list]);

  React.useEffect(() => {
    const map = timers.current;
    for (const [id, t] of map) {
      if (!list.some((x) => x.id === id)) {
        window.clearTimeout(t.handle);
        map.delete(id);
      }
    }
    for (const t of list) {
      const ms = t.duration ?? duration;
      const cur = map.get(t.id);
      if (cur && cur.type === t.type) continue; // 같은 알림이면 그대로
      if (cur) window.clearTimeout(cur.handle);
      map.set(t.id, { left: ms, started: Date.now(), type: t.type });
    }
    for (const [id, t] of map) {
      window.clearTimeout(t.handle);
      if (paused || !Number.isFinite(t.left)) continue;
      t.started = Date.now();
      t.handle = window.setTimeout(() => toast.dismiss(id), t.left);
    }
    return () => {
      for (const t of map.values()) {
        window.clearTimeout(t.handle);
        if (!paused && Number.isFinite(t.left)) t.left = Math.max(0, t.left - (Date.now() - t.started));
      }
    };
  }, [list, paused, duration]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyT") {
        e.preventDefault();
        regionRef.current?.querySelector<HTMLElement>(".hb-toast")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!mounted) return null;
  const shown = list.slice(-visibleToasts);
  const [v, h] = position.split("-");
  const ordered = v === "top" ? [...shown].reverse() : shown;

  return createPortal(
    <section
      ref={regionRef}
      className="hb-kit hb-toaster"
      data-y={v}
      data-x={h}
      aria-label={`${label} (Alt+T)`}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocusIn(false)}
    >
      <ol className="hb-toast-list" aria-live="polite" aria-relevant="additions text">
        {ordered.map((t) => (
          <li
            key={t.id}
            className="hb-toast"
            data-type={t.type}
            role={t.type === "error" ? "alert" : "status"}
            tabIndex={-1}
            onKeyDown={(e) => e.key === "Escape" && dismissKeepFocus(t.id, e.currentTarget)}
          >
            {t.type === "loading" ? (
              <span className="hb-toast-spinner" aria-hidden="true" />
            ) : TYPE_ICON[t.type] ? (
              <i className={cx("svg-icon hb-toast-icon", TYPE_ICON[t.type])} aria-hidden="true" />
            ) : null}
            <div className="hb-toast-body">
              <p className="hb-toast-title">
                {t.type !== "default" && <span className="sr-only">{TYPE_LABEL[t.type]}: </span>}
                {t.message}
              </p>
              {t.description && <p className="hb-toast-desc">{t.description}</p>}
            </div>
            {t.action && (
              <button
                type="button"
                className="krds-btn xsmall secondary hb-toast-action"
                onClick={(e) => {
                  t.action!.onClick();
                  dismissKeepFocus(t.id, e.currentTarget);
                }}
              >
                {t.action.label}
              </button>
            )}
            {closeButton && (
              <button type="button" className="krds-btn xsmall icon hb-toast-close" onClick={(e) => dismissKeepFocus(t.id, e.currentTarget)}>
                <span className="sr-only">알림 닫기</span>
                <i className="svg-icon ico-popup-close" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>,
    document.body,
  );
}
