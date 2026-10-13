// 정부 서비스 공통(G 묶음) 내부 도우미 — KRDS 「드롭다운(krds-drop-wrap)」 열고 닫기 (Vue)
//   React 판 react/gov-drop.ts 와 같은 동작. (.ts 라 index 로 내보내지 않는다)
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useUid } from "./utils";

const ITEMS = ".drop-menu .item-link, .drop-menu .drop-bottom button";

export function useGovDrop() {
  const open = ref(false);
  const align = ref<"" | "drop-left" | "drop-right">("");
  const wrap = ref<HTMLElement | null>(null);
  const btn = ref<HTMLButtonElement | null>(null);
  const menuId = useUid("hb-drop");
  let focusFirst = false;

  const items = () => Array.from(wrap.value?.querySelectorAll<HTMLElement>(ITEMS) ?? []);
  const close = (restore = false) => {
    open.value = false;
    if (restore) btn.value?.focus();
  };

  const onDown = (e: PointerEvent) => {
    if (!wrap.value?.contains(e.target as Node)) open.value = false;
  };
  watch(open, async (v) => {
    if (!v) {
      align.value = "";
      document.removeEventListener("pointerdown", onDown);
      return;
    }
    document.addEventListener("pointerdown", onDown);
    await nextTick();
    const menu = wrap.value?.querySelector<HTMLElement>(".drop-menu");
    if (menu) {
      const r = menu.getBoundingClientRect();
      if (r.left < 0) align.value = "drop-left";
      else if (r.right > window.innerWidth) align.value = "drop-right";
    }
    if (focusFirst) {
      focusFirst = false;
      const list = items();
      (list.find((el) => el.classList.contains("active")) ?? list[0])?.focus();
    }
  });
  onBeforeUnmount(() => document.removeEventListener("pointerdown", onDown));

  const onWrapKeyDown = (e: KeyboardEvent) => {
    if (!open.value) return;
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
  const onWrapFocusOut = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (open.value && to && !wrap.value?.contains(to)) open.value = false;
  };
  const onBtnKeyDown = (e: KeyboardEvent) => {
    if (!open.value && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      focusFirst = true;
      open.value = true;
    }
  };
  const onBtnClick = (e: MouseEvent) => {
    if (!open.value && e.detail === 0) focusFirst = true;
    open.value = !open.value;
  };

  const wrapClass = computed(() => [open.value && "hb-open", align.value].filter(Boolean).join(" "));
  return { open, wrap, btn, menuId, close, wrapClass, onWrapKeyDown, onWrapFocusOut, onBtnKeyDown, onBtnClick };
}

export function resolveTarget(target: string | HTMLElement | null | undefined, fallback = ".hb-kit"): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (target && typeof target !== "string") return target;
  return document.querySelector<HTMLElement>(target || fallback);
}
