// 작업 화면 공간 확보 — "넓게 보기"(콘텐츠 폭 제한 풀기)와 옆 패널 접기. 둘 다 이 브라우저에 기억한다.
// 출처: 2026-10-07 사용자 "작업하는 곳에서는 공간 확보가 더 필요할 수도" — 플랫폼 신규(홈박스·파워덱에 없던 부품).
//
// 쓰는 법
//   · 넓게 보기: 폭을 묶는 바깥 틀(container-hb·container-page)에 className "work-wide" 를 붙이고, 그 화면 머리에 <WideToggle />.
//     토글이 화면에 있는 동안만 html[data-wide="1"] 이 걸리므로, 같은 틀을 쓰는 랜딩·목록 화면은 그대로다(styles/app.css).
//   · 패널 접기: const [open, setOpen] = usePane("deck-review-side"); … <PaneToggle open={open} onToggle={setOpen} label="장 목록" />
import { useEffect, useSyncExternalStore } from "react";
import { Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ── localStorage 값 하나를 여러 부품이 같이 보는 작은 저장소 ── */
const EVT = "pp:work-space";
function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { /* 사생활 보호 모드 — 기억만 못 한다 */ }
  window.dispatchEvent(new Event(EVT));
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
}
function useStored(key: string): string | null {
  return useSyncExternalStore(subscribe, () => read(key), () => null);
}

/* ── 넓게 보기 ── */
const WIDE_KEY = "pp:wide";
export function useWideMode(): [boolean, (v: boolean) => void] {
  const wide = useStored(WIDE_KEY) === "1";
  return [wide, (v) => write(WIDE_KEY, v ? "1" : null)];
}

/* 화면 안 도구 줄(멈추기 옆 등)에 놓인 토글 수 — 하나라도 있으면 머리의 기본 토글은 숨긴다 */
let inlineCount = 0;
let mounted = 0;
const INLINE_EVT = "pp:wide-inline";
function subInline(cb: () => void) { window.addEventListener(INLINE_EVT, cb); return () => window.removeEventListener(INLINE_EVT, cb); }
export function useWideInlinePresent(): boolean {
  return useSyncExternalStore(subInline, () => inlineCount > 0, () => false);
}

/**
 * 넓게 보기 버튼. 이 버튼이 그려져 있는 동안만 넓게 보기가 적용된다.
 * 공통 규칙(사용자 2026-10-07): 넓게 보기를 켜면 화면 머리(경로·제목·메뉴 탭·화면 제목·설명 — className "wide-hide")가 통째로 사라지고,
 * 버튼은 작업 도구 줄 맨 오른쪽(멈추기 오른쪽)에 둔다 → 그 자리에 <WideToggle inline /> 를 놓으면 머리의 기본 버튼은 저절로 빠진다.
 */
export function WideToggle({ className, size = "icon-sm", inline = false }: { className?: string; size?: "icon" | "icon-sm"; inline?: boolean }) {
  const [wide, setWide] = useWideMode();
  useEffect(() => {
    if (!inline) return;
    inlineCount++; window.dispatchEvent(new Event(INLINE_EVT));
    return () => { inlineCount--; window.dispatchEvent(new Event(INLINE_EVT)); };
  }, [inline]);
  // 버튼이 하나라도 그려져 있는 동안만 html[data-wide] — 머리 버튼이 사라지고 도구 줄 버튼이 남는 경우에도 꺼지지 않게 수를 센다
  useEffect(() => {
    mounted++;
    return () => { mounted--; if (mounted === 0) delete document.documentElement.dataset.wide; };
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (wide) el.dataset.wide = "1"; else delete el.dataset.wide;
  }, [wide]);
  const label = wide ? "기본 폭으로" : "넓게 보기";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size={size} aria-label={label} aria-pressed={wide} onClick={() => setWide(!wide)} className={cn("shrink-0", className)}>
          {wide ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/* ── 옆 패널 접기 ── */
/** 열림 상태(기본 열림). key 는 화면마다 다르게 — 예: "pane:community-list" */
export function usePane(key: string, defaultOpen = true): [boolean, (v: boolean) => void] {
  const v = useStored(`pp:pane:${key}`);
  const open = v === null ? defaultOpen : v === "1";
  return [open, (o) => write(`pp:pane:${key}`, o === defaultOpen ? null : o ? "1" : "0")];
}

/** 패널 접기·펴기 아이콘 버튼. side = 패널이 놓인 쪽 */
export function PaneToggle({ open, onToggle, label, side = "left", className, size = "icon-sm" }: {
  open: boolean; onToggle: (v: boolean) => void; label: string; side?: "left" | "right"; className?: string; size?: "icon" | "icon-sm";
}) {
  const Icon = side === "left" ? (open ? PanelLeftClose : PanelLeftOpen) : (open ? PanelRightClose : PanelRightOpen);
  const text = `${label} ${open ? "접기" : "펴기"}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size={size} aria-label={text} aria-expanded={open} onClick={() => onToggle(!open)} className={cn("shrink-0", className)}>
          <Icon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
