// 시안 미리보기 — 왼쪽에 기기 탭(PC 1920 / 태블릿 768 / 모바일 390), 오른쪽 위에 새 창 · 새로고침.
// 탭을 누르면 아래 시안이 그 폭으로 다시 그려지고, 높이는 시안 내용만큼 늘어난다(안쪽 세로 스크롤 없음 — 사용자 2026-10-07).
// 공개 시안 상세·갤러리 상세·관리자 시안 패널·체크리스트가 이 한 컴포넌트를 쓴다. sandbox 는 홈박스 방식 그대로.
import { ExternalLink, Monitor, RotateCw, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FitFrame } from "@/components/hb/fit-frame";

export type Device = "pc" | "tablet" | "phone";
const WIDTH: Record<Device, number> = { pc: 1920, tablet: 768, phone: 390 };
const DEVICES: Array<{ id: Device; label: string; px: string; icon: typeof Monitor }> = [
  { id: "pc", label: "PC", px: "1920", icon: Monitor },
  { id: "tablet", label: "태블릿", px: "768", icon: Tablet },
  { id: "phone", label: "모바일", px: "390", icon: Smartphone },
];

export interface MockupPreviewProps {
  /** iframe 에 넣을 주소(/api/v1/mock/…/html 또는 /p/{token}) */
  src: string;
  /** 새 창으로 열 주소 — 없으면 src */
  fullUrl?: string | null;
  title: string;
  /** 초기 기기 */
  device?: Device;
  /** 시안이 높이를 알려 오기 전의 높이 */
  height?: string;
  className?: string;
  /** 탭 줄 오른쪽(새 창 왼쪽)에 끼울 내용(점수·상태 등) */
  lead?: React.ReactNode;
}

export function MockupPreview({ src, fullUrl, title, device: initial = "pc", height = "70vh", className, lead }: MockupPreviewProps) {
  const [device, setDevice] = useState<Device>(initial);
  const [nonce, setNonce] = useState(0);
  const full = fullUrl ?? src;
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex flex-wrap items-end gap-2 border-b border-line">
        <div role="tablist" aria-label="미리보기 기기" className="flex">
          {DEVICES.map((d) => {
            const on = d.id === device;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setDevice(d.id)}
                className={cn(
                  "relative -mb-px inline-flex h-11 items-center gap-1.5 px-4 text-sm transition-colors",
                  on ? "font-bold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink" : "font-medium text-ink-4 hover:text-ink",
                )}
              >
                <d.icon className="size-4" aria-hidden />{d.label}<span className="text-xs font-normal text-ink-4">{d.px}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2 pb-2">
          {lead && <div className="min-w-0 text-sm text-ink-4">{lead}</div>}
          <Button variant="outline" size="icon-sm" onClick={() => setNonce((n) => n + 1)} aria-label="새로고침" title="새로고침"><RotateCw aria-hidden /></Button>
          <Button variant="outline" size="sm" asChild><a href={full} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />새 창</a></Button>
        </div>
      </div>
      <div className="mt-3 rounded-card border border-line bg-ground-3 p-3">
        <FitFrame key={`${nonce}-${device}`} src={src} title={title} designWidth={WIDTH[device]} height={height} autoHeight className="rounded-md" />
      </div>
    </div>
  );
}
