// 도식 캔버스(@xyflow/react, 약 400KB)를 쓰는 화면이 열릴 때만 받는다 — 예전엔 모든 모듈 화면의 공통 덩어리(639KB)에 묶여
// powerAssets·powerMock·powerGuide 첫 진입에도 내려받았다(2026-10-20 속도 점검).
import { lazy, Suspense, type ComponentProps } from "react";

const Inner = lazy(() => import("./OverviewCanvas").then((m) => ({ default: m.OverviewCanvas })));

export function OverviewCanvas(props: ComponentProps<typeof Inner>) {
  return (
    <Suspense fallback={<div className="grid h-[320px] place-items-center text-sm text-ink-4">도식을 불러오는 중</div>}>
      <Inner {...props} />
    </Suspense>
  );
}
