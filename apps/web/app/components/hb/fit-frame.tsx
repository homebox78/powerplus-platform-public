// 시안 iframe 을 원래 폭(PC 1920·태블릿 768·폰 390)으로 그린 뒤, 틀이 그보다 좁으면 비율대로 줄여 보여 준다.
// 이유: 시안은 1920 기준이라 좁은 틀(관리자 패널·1399 본문)에 그대로 넣으면 오른쪽이 잘렸다(2026-10-07 사용자 지적).
// 틀이 더 넓으면 줄이지 않고 가운데 둔다. sandbox 는 홈박스 방식 그대로.
// autoHeight: 시안이 알려 주는 내용 높이(api/src/Mock/FrameHeight.php)만큼 늘려 안쪽 세로 스크롤을 없앤다(사용자 2026-10-07).
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface FitFrameProps {
  src: string;
  title: string;
  /** 시안이 설계된 폭(px) */
  designWidth: number;
  /** 보이는 틀 높이(CSS 값) — autoHeight 면 높이를 알려 오기 전까지의 높이 */
  height: string;
  /** 내용 높이만큼 늘리기 */
  autoHeight?: boolean;
  className?: string;
  frameClassName?: string;
}

const MAX_H = 24000;

export function FitFrame({ src, title, designWidth, height, autoHeight = false, className, frameClassName }: FitFrameProps) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const [contentH, setContentH] = useState(0);
  // 시안이 알려 온 실제 폭 — 고정 폭(min-width:1920 등) 시안은 좁은 기기 폭에서도 1920 으로 그려진다
  const [contentW, setContentW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      setW(e.contentRect.width);
      setH(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 높이 받기 — 100vh 요소가 있으면 iframe 을 늘릴수록 내용도 같은 만큼 늘어난다. 같은 차이가 세 번 이어지면 멈춘다.
  useEffect(() => {
    if (!autoHeight) return;
    let frameH = 0;
    let lastDelta = -1;
    let same = 0;
    let frozen = false;
    const onMsg = (e: MessageEvent) => {
      if (frozen || e.source !== frame.current?.contentWindow) return;
      const v = Number((e.data as { ppFrameHeight?: unknown } | null)?.ppFrameHeight);
      if (!Number.isFinite(v) || v <= 0) return;
      const cw = Number((e.data as { ppFrameWidth?: unknown } | null)?.ppFrameWidth);
      if (Number.isFinite(cw) && cw > 0) setContentW(Math.ceil(cw));
      const next = Math.min(MAX_H, Math.ceil(v));
      const delta = next - frameH;
      if (frameH > 0 && delta > 0 && Math.abs(delta - lastDelta) <= 2) {
        same += 1;
        if (same >= 3) { frozen = true; return; }
      } else same = 0;
      lastDelta = delta;
      frameH = next;
      setContentH(next);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [autoHeight, src, designWidth]);

  // 내용이 기기 폭보다 넓으면(반응형 아님) 그 폭 전체가 보이게 줄인다
  const fixedW = contentW > designWidth + 2 ? contentW : 0;
  const drawW = fixedW || designWidth;
  const scale = w > 0 && w < drawW ? w / drawW : 1;
  const shown = w > 0 ? Math.min(drawW, w) : 0;
  const auto = autoHeight && contentH > 0;
  const frameH = auto ? contentH : h > 0 ? h / scale : undefined;
  return (
    <>
    {fixedW > 0 && <p className="mb-2 text-sm text-warn" role="note">이 시안은 폭 {fixedW}px 로 고정돼 있어 {designWidth}px 화면에 맞춰 바뀌지 않습니다(반응형 미적용). 전체를 줄여 보여 줍니다.</p>}
    <div ref={box} className={cn("relative w-full min-w-0 overflow-hidden", className)} style={{ height: auto ? contentH * scale : height }}>
      <div className="relative mx-auto h-full overflow-hidden" style={{ width: shown || "100%" }}>
        <iframe
          ref={frame}
          src={src}
          title={title}
          sandbox="allow-scripts allow-popups allow-forms allow-modals"
          scrolling={auto ? "no" : undefined}
          className={cn("absolute left-0 top-0 block origin-top-left border-0 bg-white", frameClassName)}
          style={{ width: drawW, height: frameH ?? "100%", transform: scale < 1 ? `scale(${scale})` : undefined }}
        />
      </div>
    </div>
    </>
  );
}
