// 토스트 저장소(Vue) — sonner 와 같은 사용법. <Toaster /> 를 앱에 한 번 두고 어디서든 toast() 를 부른다.
//   import { toast } from "@homebox/kit/vue/toast";
//   toast("민원이 접수되었습니다");
//   toast.success("저장했습니다", { description: "접수번호 2026-0412" });
//   toast.error("전송하지 못했습니다", { action: { label: "다시 시도", onClick: retry } });
//   toast.promise(save(), { loading: "저장 중…", success: "저장했습니다", error: "저장하지 못했습니다" });
//   toast.dismiss(id)
// (vue/index.ts 는 .vue 부품만 모으므로 toast 함수는 이 파일에서 직접 가져온다)
import { shallowRef } from "vue";

export type ToastType = "default" | "success" | "error" | "info" | "warning" | "loading";
export interface ToastAction {
  label: string;
  onClick: () => void;
}
export interface ToastOptions {
  id?: string | number;
  description?: string;
  /** 사라지기까지(ms). Infinity 면 직접 닫을 때까지 */
  duration?: number;
  action?: ToastAction;
}
export interface ToastItem extends ToastOptions {
  id: string | number;
  type: ToastType;
  message: string;
}

/** Toaster.vue 가 읽는 목록 */
export const toasts = shallowRef<ToastItem[]>([]);
let seq = 0;

function push(type: ToastType, message: string, opts: ToastOptions = {}) {
  const id = opts.id ?? `hb-toast-${++seq}`;
  const next: ToastItem = { ...opts, id, type, message };
  const list = toasts.value;
  const i = list.findIndex((t) => t.id === id);
  toasts.value = i >= 0 ? list.map((t, k) => (k === i ? next : t)) : [...list, next];
  return id;
}

type PromiseMsg<T> = string | ((v: T) => string);
const resolveMsg = <T>(m: PromiseMsg<T>, v: T) => (typeof m === "function" ? m(v) : m);

export const toast = Object.assign((message: string, opts?: ToastOptions) => push("default", message, opts), {
  success: (m: string, o?: ToastOptions) => push("success", m, o),
  error: (m: string, o?: ToastOptions) => push("error", m, o),
  info: (m: string, o?: ToastOptions) => push("info", m, o),
  warning: (m: string, o?: ToastOptions) => push("warning", m, o),
  loading: (m: string, o?: ToastOptions) => push("loading", m, { duration: Infinity, ...o }),
  promise<T>(p: Promise<T>, msg: { loading: string; success: PromiseMsg<T>; error: PromiseMsg<unknown> }) {
    const id = push("loading", msg.loading, { duration: Infinity });
    p.then(
      (v) => push("success", resolveMsg(msg.success, v), { id }),
      (e) => push("error", resolveMsg(msg.error, e), { id }),
    );
    return p;
  },
  dismiss(id?: string | number) {
    toasts.value = id === undefined ? [] : toasts.value.filter((t) => t.id !== id);
  },
});
