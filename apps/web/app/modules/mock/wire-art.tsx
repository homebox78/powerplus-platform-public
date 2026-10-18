// powerMock 와이어 칸 그림 — powerDeck 와이어프레임(modules/deck/legacy/Wireframe.tsx)의 표기를 홈페이지 섹션에 옮겼다.
// 흰 판 + 1px 회색 테두리 + 그림 자리는 대각선(X), 글은 회색 막대, 강조는 진한 회색. 색은 쓰지 않는다(무채색 와이어).
// 사용자 2026-10-08 "파워덱 와이어프레임 디자인 느낌을 가져와 완성도 있게".
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 그림·사진 자리 — 대각선 두 줄 */
export function XFill({ className }: { className?: string }) {
  return (
    <svg className={cn("pointer-events-none text-line-3", className)} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
      <path d="M0 0L100 100M100 0L0 100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" />
    </svg>
  );
}

/** 글 한 줄 자리 */
export const Bar = ({ w = "100%", dark, h = 5, className }: { w?: string | number; dark?: boolean; h?: number; className?: string }) => (
  <span className={cn("block shrink-0 rounded-[1px]", dark ? "bg-ink-4" : "bg-line-3", className)} style={{ width: w, height: h }} />
);
export const Img = ({ className, children }: { className?: string; children?: ReactNode }) => (
  <span className={cn("relative block overflow-hidden border border-line-3 bg-white", className)}><XFill className="absolute inset-0" />{children}</span>
);
export const Lines = ({ n, last = "60%" }: { n: number; last?: string }) => (
  <span className="flex flex-col gap-[5px]">{Array.from({ length: n }).map((_, i) => <Bar key={i} w={i === n - 1 ? last : "100%"} />)}</span>
);
const Title = ({ w = "34%" }: { w?: string }) => <Bar w={w} dark h={7} />;
export const Btn = ({ w = 44, dark }: { w?: number; dark?: boolean }) => <span className={cn("block h-[14px] shrink-0 rounded-[2px] border", dark ? "border-ink-4 bg-ink-4" : "border-ink-4 bg-white")} style={{ width: w }} />;
export const Dot = ({ on }: { on?: boolean }) => <span className={cn("block size-[5px] rounded-full", on ? "bg-ink-4" : "bg-line-3")} />;
const Tabs = ({ n = 4 }: { n?: number }) => (
  <span className="flex border-b border-line-3">
    {Array.from({ length: n }).map((_, i) => <span key={i} className={cn("flex h-[16px] flex-1 items-center justify-center", i === 0 && "border-b-2 border-ink-4")}><Bar w="54%" dark={i === 0} h={4} /></span>)}
  </span>
);
const Grid = ({ cols, children }: { cols: number; children: ReactNode }) => <span className="grid gap-[6px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>{children}</span>;

/** 칸 종류별 안쪽 그림. span 은 12칸 중 폭 — 좁으면 항목 수를 줄인다 */
export function SectionArt({ k, span, mobile }: { k: string; span: number; mobile?: boolean }) {
  const narrow = mobile || span <= 4;
  const n = (wide: number, nar: number) => (narrow ? nar : wide);
  switch (k) {
    case "masthead":
      return <span className="flex h-full items-center gap-2 px-2"><span className="size-[8px] rounded-full border border-ink-4" /><Bar w="38%" h={4} /></span>;
    case "skip_nav":
      return <span className="flex h-full items-center px-2"><Bar w="22%" h={4} /></span>;
    case "header":
      return (
        <span className="flex h-full items-center gap-3 px-3">
          <Img className="h-[60%] w-[64px] shrink-0" />
          {!narrow && <span className="flex flex-1 justify-center gap-[6%]">{Array.from({ length: 6 }).map((_, i) => <Bar key={i} w="9%" dark h={5} />)}</span>}
          <span className={cn("flex gap-1.5", narrow && "ml-auto")}><span className="size-[14px] rounded-full border border-ink-4" /><span className="flex size-[14px] flex-col justify-center gap-[2px]"><Bar h={2} dark /><Bar h={2} dark /><Bar h={2} dark /></span></span>
        </span>
      );
    case "main_visual": case "hero": case "sub_visual":
      return (
        <span className="relative flex h-full">
          <XFill className="absolute inset-0" />
          <span className={cn("relative flex flex-col justify-center gap-[7px] bg-white/85 p-3", narrow ? "w-full" : "w-[44%]")}>
            <Bar w="40%" h={4} />
            <Bar w="86%" dark h={k === "sub_visual" ? 8 : 11} />
            {k !== "sub_visual" && <Bar w="70%" dark h={11} />}
            <Lines n={2} />
            {k !== "sub_visual" && <span className="mt-1 flex gap-1.5"><Btn dark /><Btn /></span>}
          </span>
          {k !== "sub_visual" && <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1"><Dot on /><Dot /><Dot /><Dot /></span>}
        </span>
      );
    case "main_search":
      return (
        <span className="flex h-full flex-col items-center justify-center gap-2 px-3">
          <span className="flex h-[22px] w-full max-w-[520px] items-center rounded-full border-2 border-ink-4 bg-white px-2"><Bar w="40%" h={4} /><span className="ml-auto size-[10px] rounded-full border-2 border-ink-4" /></span>
          <span className="flex flex-wrap justify-center gap-1.5">{Array.from({ length: n(5, 3) }).map((_, i) => <span key={i} className="rounded-full border border-line-3 px-2 py-[3px]"><Bar w={22} h={3} /></span>)}</span>
        </span>
      );
    case "quick_links": case "floating_quick": {
      const c = k === "floating_quick" ? 1 : n(8, 4);
      return (
        <span className="flex h-full items-center px-3">
          <span className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${c}, minmax(0, 1fr))` }}>{Array.from({ length: c }).map((_, i) => (
            <span key={i} className="flex flex-col items-center gap-[7px]"><span className="flex size-[40px] items-center justify-center rounded-full border border-ink-4 bg-white"><span className="size-[16px] rounded-[3px] border border-ink-4 bg-ground-3" /></span><Bar w="60%" h={5} /></span>
          ))}</span>
        </span>
      );
    }
    case "text_band":
      return <span className="flex h-full items-center gap-[3%] px-3">{Array.from({ length: n(5, 2) }).map((_, i) => <span key={i} className="flex flex-1 items-center gap-1"><Bar w="70%" h={5} dark /><span className="text-[9px] leading-none text-ink-4">›</span></span>)}</span>;
    case "news_tabs": case "board_list":
      return (
        <span className="flex h-full flex-col gap-[6px] p-3">
          {k === "news_tabs" ? <Tabs n={n(4, 3)} /> : <span className="flex items-center gap-2"><Bar w="20%" h={4} /><span className="ml-auto flex h-[14px] w-[34%] items-center rounded-[2px] border border-ink-4 px-1"><Bar w="50%" h={3} /></span></span>}
          {k === "board_list" && <span className="flex border-y border-ink-4 bg-ground-3 py-[4px]">{["8%", "58%", "16%", "18%"].map((w, i) => <span key={i} className="flex justify-center" style={{ width: w }}><Bar w="60%" h={3} dark /></span>)}</span>}
          <span className="flex flex-1 flex-col justify-around">
            {Array.from({ length: k === "board_list" ? 6 : 5 }).map((_, i) => <span key={i} className="flex items-center gap-2 border-b border-line py-[3px]"><Bar w={narrow ? "68%" : "74%"} h={4} /><Bar w="14%" h={3} className="ml-auto" /></span>)}
          </span>
          {k === "board_list" && <span className="flex justify-center gap-1">{Array.from({ length: 5 }).map((_, i) => <span key={i} className={cn("size-[11px] rounded-[2px] border", i === 0 ? "border-ink-4 bg-ink-4" : "border-line-3")} />)}</span>}
        </span>
      );
    case "board_view":
      return (
        <span className="flex h-full flex-col gap-[6px] p-3">
          <span className="border-y-2 border-ink-4 py-1.5"><Bar w="62%" dark h={7} /><span className="mt-1.5 flex gap-2"><Bar w="12%" h={3} /><Bar w="12%" h={3} /><Bar w="10%" h={3} /></span></span>
          <span className="flex flex-1 flex-col gap-[5px] py-1"><Lines n={5} /><Img className="mt-1 h-[34%] w-[46%]" /></span>
          <span className="flex items-center gap-2 rounded-[2px] bg-ground-3 px-2 py-1"><span className="size-[8px] border border-ink-4" /><Bar w="30%" h={3} /></span>
          <span className="flex justify-center"><Btn w={56} dark /></span>
        </span>
      );
    case "greeting_vision":
      return (
        <span className={cn("flex h-full gap-3 p-3", narrow && "flex-col")}>
          <Img className={cn("shrink-0", narrow ? "h-[46%] w-full" : "h-full w-[30%]")} />
          <span className="flex flex-1 flex-col justify-center gap-[6px]"><Bar w="30%" h={4} /><Bar w="80%" dark h={9} /><Lines n={4} /><Bar w="26%" dark h={6} className="ml-auto" /></span>
        </span>
      );
    case "calendar":
      return (
        <span className="flex h-full flex-col gap-[4px] p-3">
          <span className="flex items-center justify-center gap-2"><span className="text-[9px] text-ink-4">‹</span><Bar w="26%" dark h={5} /><span className="text-[9px] text-ink-4">›</span></span>
          <span className="grid flex-1 grid-cols-7 gap-[2px]">{Array.from({ length: 35 }).map((_, i) => <span key={i} className={cn("rounded-[1px] border", i === 16 ? "border-ink-4 bg-ink-4" : "border-line")} />)}</span>
        </span>
      );
    case "sns_video": case "tour_cards": case "photo_gallery": case "popup_zone": {
      const c = k === "popup_zone" ? 1 : n(4, 2);
      return (
        <span className="flex h-full flex-col gap-[6px] p-3">
          {k !== "popup_zone" && <Title />}
          <span className="grid flex-1 gap-[8px]" style={{ gridTemplateColumns: `repeat(${c}, minmax(0,1fr))` }}>
            {Array.from({ length: c }).map((_, i) => (
              <span key={i} className="flex min-h-0 flex-col gap-[4px]">
                <Img className="min-h-0 flex-1">{k === "sns_video" && <span className="absolute left-1/2 top-1/2 size-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-4 bg-white" />}</Img>
                {k !== "popup_zone" && <Bar w="80%" h={4} />}
              </span>
            ))}
          </span>
          {k === "popup_zone" && <span className="flex items-center justify-center gap-1"><Dot on /><Dot /><Dot /></span>}
        </span>
      );
    }
    case "banner_zone":
      return (
        <span className="flex h-full items-center gap-2 px-3 py-3">
          <span className="size-[14px] shrink-0 rounded-full border border-ink-4" />
          <span className="grid h-full min-w-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${n(4, 2)}, minmax(0, 1fr))` }}>
            {Array.from({ length: n(4, 2) }).map((_, i) => <Img key={i} className="h-full max-h-[90px] self-center" />)}
          </span>
          <span className="size-[14px] shrink-0 rounded-full border border-ink-4" />
        </span>
      );
    case "news_ticker":
      return <span className="flex h-full items-center gap-2 px-3"><span className="rounded-[2px] bg-ink-4 px-1.5 py-[2px]"><Bar w={20} h={3} className="bg-white" /></span><Bar w="60%" h={4} /><span className="ml-auto flex gap-1"><Dot on /><Dot /></span></span>;
    case "stats": case "stat_cards": {
      const c = n(4, 2);
      return (
        <span className="flex h-full items-center px-3">
          <Grid cols={c}>{Array.from({ length: c }).map((_, i) => (
            <span key={i} className="flex flex-col items-center gap-[5px] rounded-[2px] border border-line-3 bg-white py-2"><Bar w="50%" dark h={12} /><Bar w="64%" h={4} /></span>
          ))}</Grid>
        </span>
      );
    }
    case "breadcrumb":
      return <span className="flex h-full items-center gap-1.5 px-3"><span className="size-[8px] border border-ink-4" />{[18, 22, 26].map((w, i) => <span key={i} className="flex items-center gap-1.5"><span className="text-[9px] text-ink-4">›</span><Bar w={w} h={4} dark={i === 2} /></span>)}</span>;
    case "page_title":
      return <span className="flex h-full items-center gap-2 border-b-2 border-ink-4 px-3"><Bar w="30%" dark h={10} /><span className="ml-auto flex gap-1.5"><span className="size-[12px] rounded-full border border-ink-4" /><span className="size-[12px] rounded-full border border-ink-4" /></span></span>;
    case "content_tabs":
      return <span className="flex h-full flex-col justify-center gap-2 p-3"><Tabs n={n(5, 3)} /><Lines n={3} /></span>;
    case "lnb":
      return (
        <span className="flex h-full flex-col gap-[6px] p-3">
          <span className="rounded-[2px] bg-ink-4 px-2 py-[6px]"><Bar w="60%" h={6} className="bg-white" /></span>
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className={cn("border-b border-line px-1 pb-[5px]", i === 1 && "font-bold")}><Bar w={`${50 + (i % 3) * 12}%`} h={4} dark={i === 1} /></span>)}
        </span>
      );
    case "form":
      return (
        <span className="flex h-full flex-col gap-[7px] p-3">
          <Title w="26%" />
          {Array.from({ length: n(4, 3) }).map((_, i) => <span key={i} className="flex items-center gap-2"><Bar w="18%" h={4} /><span className="h-[16px] flex-1 rounded-[2px] border border-line-3 bg-white" /></span>)}
          <span className="flex items-center gap-2"><Bar w="18%" h={4} /><span className="h-[34px] flex-1 rounded-[2px] border border-line-3 bg-white" /></span>
          <span className="flex items-center gap-1.5"><span className="size-[9px] border border-ink-4" /><Bar w="36%" h={3} /></span>
          <span className="mt-auto flex justify-center gap-2"><Btn w={56} /><Btn w={56} dark /></span>
        </span>
      );
    case "org_chart":
      return (
        <span className="flex h-full flex-col items-center justify-center gap-[10px] p-3">
          <span className="rounded-[2px] border-2 border-ink-4 px-3 py-[5px]"><Bar w={34} dark h={5} /></span>
          <span className="h-[8px] w-px bg-ink-4" />
          <span className="flex w-full justify-center gap-[6%] border-t border-ink-4 pt-[8px]">{Array.from({ length: n(4, 2) }).map((_, i) => <span key={i} className="rounded-[2px] border border-ink-4 bg-white px-2 py-[4px]"><Bar w={26} h={4} /></span>)}</span>
          <span className="flex w-full justify-center gap-[6%]">{Array.from({ length: n(6, 3) }).map((_, i) => <span key={i} className="rounded-[2px] border border-line-3 px-2 py-[3px]"><Bar w={20} h={3} /></span>)}</span>
        </span>
      );
    case "sitemap":
      return <span className="flex h-full p-3"><Grid cols={n(5, 2)}>{Array.from({ length: n(5, 2) }).map((_, i) => <span key={i} className="flex flex-col gap-[5px]"><Bar w="70%" dark h={5} />{Array.from({ length: 4 }).map((_, j) => <Bar key={j} w={`${46 + j * 9}%`} h={3} />)}</span>)}</Grid></span>;
    case "satisfaction":
      return <span className="flex h-full items-center gap-3 rounded-[2px] bg-ground-3 px-3"><Bar w="22%" dark h={5} /><span className="flex gap-2">{Array.from({ length: 5 }).map((_, i) => <span key={i} className="flex items-center gap-1"><span className={cn("size-[8px] rounded-full border border-ink-4", i === 1 && "bg-ink-4")} /><Bar w={14} h={3} /></span>)}</span><Btn w={36} dark /></span>;
    case "notice_box":
      return <span className="flex h-full items-center gap-2 rounded-[2px] border border-line-3 bg-ground-3 px-3"><span className="flex size-[12px] items-center justify-center rounded-full border border-ink-4 text-[8px] font-bold leading-none text-ink-4">!</span><span className="flex-1"><Lines n={2} /></span></span>;
    case "timeline":
      return (
        <span className="flex h-full flex-col justify-around gap-1 p-3">
          {Array.from({ length: 4 }).map((_, i) => <span key={i} className="flex items-center gap-2"><Bar w="12%" dark h={6} /><span className="relative flex self-stretch"><span className="w-px bg-ink-4" /><span className="absolute -left-[3px] top-1/2 size-[7px] -translate-y-1/2 rounded-full border border-ink-4 bg-white" /></span><Bar w="56%" h={4} /></span>)}
        </span>
      );
    case "location_map":
      return (
        <span className={cn("flex h-full gap-3 p-3", narrow && "flex-col")}>
          <Img className={cn(narrow ? "h-[55%] w-full" : "h-full w-[58%]")}><span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none text-ink-4">📍</span></Img>
          <span className="flex flex-1 flex-col justify-center gap-[7px]">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="flex gap-2"><Bar w="22%" dark h={4} /><Bar w="60%" h={4} /></span>)}</span>
        </span>
      );
    case "faq_list":
      return (
        <span className="flex h-full flex-col justify-around p-3">
          {Array.from({ length: 5 }).map((_, i) => <span key={i} className="flex items-center gap-2 border-b border-line-3 py-[4px]"><span className="text-[9px] font-bold leading-none text-ink-4">Q</span><Bar w="66%" h={4} dark={i === 0} /><span className="ml-auto text-[9px] leading-none text-ink-4">{i === 0 ? "−" : "+"}</span></span>)}
        </span>
      );
    case "contact_info":
      return <span className="flex h-full items-center gap-4 rounded-[2px] border border-line-3 px-3">{Array.from({ length: n(3, 2) }).map((_, i) => <span key={i} className="flex items-center gap-1.5"><Bar w={20} dark h={4} /><Bar w={44} h={4} /></span>)}</span>;
    case "step_flow":
      return (
        <span className="flex h-full items-center gap-[2%] px-3">
          {Array.from({ length: n(5, 3) }).map((_, i, a) => (
            <span key={i} className="flex h-[48%] min-h-[24px] flex-1 items-center justify-center bg-line" style={{ clipPath: i < a.length - 1 ? "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%)" : undefined }}><Bar w="44%" dark h={4} /></span>
          ))}
        </span>
      );
    case "info_table":
      return (
        <span className="flex h-full flex-col p-3">
          <span className="flex border-t-2 border-ink-4 bg-ground-3">{Array.from({ length: n(4, 3) }).map((_, i) => <span key={i} className="flex flex-1 justify-center border-r border-line-3 py-[4px] last:border-r-0"><Bar w="50%" h={3} dark /></span>)}</span>
          {Array.from({ length: 4 }).map((_, r) => <span key={r} className="flex flex-1 border-b border-line-3">{Array.from({ length: n(4, 3) }).map((_, i) => <span key={i} className="flex flex-1 items-center justify-center border-r border-line-3 last:border-r-0"><Bar w="56%" h={3} /></span>)}</span>)}
        </span>
      );
    case "ai_chatbot":
      return (
        <span className="flex h-full flex-col gap-[6px] p-3">
          <span className="flex items-center gap-1.5"><span className="size-[14px] rounded-full border border-ink-4" /><Bar w="30%" dark h={5} /></span>
          <span className="self-start rounded-[8px] rounded-tl-[1px] bg-ground-3 px-2 py-1.5"><Bar w={70} h={4} /></span>
          <span className="self-end rounded-[8px] rounded-tr-[1px] border border-line-3 px-2 py-1.5"><Bar w={50} h={4} /></span>
          <span className="mt-auto flex h-[18px] items-center rounded-full border border-ink-4 px-2"><Bar w="40%" h={3} /></span>
        </span>
      );
    case "footer":
      return (
        <span className="flex h-full flex-col gap-[7px] bg-ground-3 p-3">
          <span className="flex gap-3">{Array.from({ length: n(5, 3) }).map((_, i) => <Bar key={i} w="10%" dark={i === 0} h={4} />)}<span className="ml-auto h-[14px] w-[16%] rounded-[2px] border border-ink-4 bg-white" /></span>
          <span className="flex flex-1 items-center gap-3"><Img className="h-[22px] w-[60px] shrink-0" /><span className="flex-1"><Lines n={3} last="40%" /></span></span>
        </span>
      );
    // ── 키트 부품(kit_*) — /guide/components 부품을 와이어 칸으로 ──
    case "kit_language_switcher":
      return <span className="flex h-full items-center justify-end gap-1.5 px-3"><span className="size-[12px] rounded-full border border-ink-4" /><Bar w={36} dark h={4} /><span className="text-[9px] leading-none text-ink-4">▾</span></span>;
    case "kit_resize":
      return <span className="flex h-full items-center justify-end gap-1 px-3">{[8, 10, 12].map((s, i) => <span key={i} className={cn("flex items-center justify-center rounded-[2px] border font-bold leading-none", i === 1 ? "border-ink-4 bg-ink-4 text-white" : "border-line-3 text-ink-4")} style={{ width: s + 8, height: s + 8, fontSize: s }}>가</span>)}</span>;
    case "kit_tts":
      return <span className="flex h-full items-center gap-2 px-3"><span className="flex size-[16px] items-center justify-center rounded-full border border-ink-4 text-[8px] leading-none text-ink-4">▶</span><span className="h-[3px] flex-1 rounded-full bg-line-3"><span className="block h-full w-[30%] rounded-full bg-ink-4" /></span><Bar w={24} h={3} /></span>;
    case "kit_carousel":
      return (
        <span className="flex h-full items-center gap-2 p-3">
          <span className="size-[14px] shrink-0 rounded-full border border-ink-4" />
          <span className="flex h-full min-w-0 flex-1 flex-col gap-[5px]"><Img className="min-h-0 flex-1" /><span className="flex justify-center gap-1"><Dot on /><Dot /><Dot /><Dot /></span></span>
          <span className="size-[14px] shrink-0 rounded-full border border-ink-4" />
        </span>
      );
    case "kit_aspect_ratio":
      return <span className="flex h-full flex-col gap-[5px] p-3"><Img className="min-h-0 flex-1" /><Bar w="40%" h={3} /></span>;
    case "kit_input_group":
      return <span className="flex h-full items-center px-3"><span className="flex h-[20px] w-full items-center gap-1.5 rounded-[2px] border border-ink-4 bg-white pl-2"><Bar w="40%" h={4} /><span className="ml-auto flex h-full w-[40px] items-center justify-center bg-ink-4"><span className="size-[8px] rounded-full border-2 border-white" /></span></span></span>;
    case "kit_pagination":
      return <span className="flex h-full items-center justify-center gap-1"><span className="text-[9px] text-ink-4">‹</span>{Array.from({ length: n(7, 5) }).map((_, i) => <span key={i} className={cn("size-[13px] rounded-[2px] border", i === 0 ? "border-ink-4 bg-ink-4" : "border-line-3")} />)}<span className="text-[9px] text-ink-4">›</span></span>;
    case "kit_in_page_navigation":
      return (
        <span className="flex h-full flex-col gap-[6px] p-3">
          <Bar w="40%" dark h={5} />
          {Array.from({ length: 5 }).map((_, i) => <span key={i} className={cn("border-l-2 pl-2", i === 1 ? "border-ink-4" : "border-line-3")}><Bar w={`${46 + (i % 3) * 14}%`} h={4} dark={i === 1} /></span>)}
        </span>
      );
    case "kit_card": {
      const c = n(3, 1);
      return (
        <span className="flex h-full p-3">
          <span className="grid h-full w-full gap-[8px]" style={{ gridTemplateColumns: `repeat(${c}, minmax(0,1fr))` }}>
            {Array.from({ length: c }).map((_, i) => (
              <span key={i} className="flex min-h-0 flex-col gap-[5px] rounded-[3px] border border-line-3 bg-white p-[6px]"><Img className="min-h-0 flex-1" /><Bar w="70%" dark h={5} /><Lines n={2} /><Btn w={36} /></span>
            ))}
          </span>
        </span>
      );
    }
    case "kit_accordion":
      return (
        <span className="flex h-full flex-col p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className={cn("flex flex-col border-b border-line-3", i === 0 && "flex-1")}>
              <span className="flex items-center gap-2 py-[5px]"><Bar w="56%" h={4} dark={i === 0} /><span className="ml-auto text-[9px] leading-none text-ink-4">{i === 0 ? "∧" : "∨"}</span></span>
              {i === 0 && <span className="bg-ground-3 p-2"><Lines n={2} /></span>}
            </span>
          ))}
        </span>
      );
    case "kit_text_list":
      return <span className="flex h-full flex-col justify-center gap-[7px] p-3">{Array.from({ length: 5 }).map((_, i) => <span key={i} className="flex items-center gap-2"><span className="size-[4px] shrink-0 rounded-full bg-ink-4" /><Bar w={`${58 + (i % 3) * 12}%`} h={4} /></span>)}</span>;
    case "kit_structured_list":
      return (
        <span className="flex h-full flex-col justify-around p-3">
          {Array.from({ length: 4 }).map((_, i) => <span key={i} className="flex items-center gap-3 border-b border-line-3 py-[4px]"><Bar w="22%" dark h={4} /><span className="flex-1"><Bar w="80%" h={4} /></span><Bar w="12%" h={3} /></span>)}
        </span>
      );
    case "kit_avatar":
      return (
        <span className="flex h-full items-center p-3">
          <Grid cols={n(4, 2)}>{Array.from({ length: n(4, 2) }).map((_, i) => (
            <span key={i} className="flex items-center gap-2"><span className="relative size-[30px] shrink-0 overflow-hidden rounded-full border border-line-3"><XFill className="absolute inset-0" /></span><span className="flex flex-1 flex-col gap-[4px]"><Bar w="60%" dark h={4} /><Bar w="80%" h={3} /></span></span>
          ))}</Grid>
        </span>
      );
    case "kit_field":
      return (
        <span className="flex h-full flex-col gap-[7px] p-3">
          {Array.from({ length: n(3, 2) }).map((_, i) => <span key={i} className="flex flex-col gap-[4px]"><Bar w="22%" dark h={4} /><span className="h-[16px] rounded-[2px] border border-line-3 bg-white" /><Bar w="40%" h={3} /></span>)}
        </span>
      );
    case "kit_combobox":
      return <span className="flex h-full items-center px-3"><span className="flex h-[20px] w-full items-center gap-2 rounded-[2px] border border-ink-4 bg-white px-2"><span className="size-[8px] rounded-full border border-ink-4" /><Bar w="40%" h={4} /><span className="ml-auto text-[9px] leading-none text-ink-4">▾</span></span></span>;
    case "kit_date_input":
      return <span className="flex h-full items-center gap-2 px-3">{Array.from({ length: n(2, 1) }).map((_, i) => <span key={i} className="flex h-[20px] flex-1 items-center gap-2 rounded-[2px] border border-line-3 bg-white px-2"><Bar w="50%" h={4} /><span className="ml-auto size-[10px] rounded-[1px] border border-ink-4" /></span>)}</span>;
    case "kit_radio_group": case "kit_checkbox":
      return (
        <span className="flex h-full flex-col justify-center gap-[7px] p-3">
          {k === "kit_checkbox" && <span className="flex items-center gap-2 border-b border-line-3 pb-[6px]"><span className="size-[10px] border border-ink-4 bg-ink-4" /><Bar w="30%" dark h={4} /></span>}
          {Array.from({ length: k === "kit_checkbox" ? 3 : n(4, 3) }).map((_, i) => <span key={i} className="flex items-center gap-2"><span className={cn("size-[10px] border border-ink-4", k === "kit_radio_group" ? "rounded-full" : "rounded-[1px]", i === 0 && "bg-ink-4")} /><Bar w={`${40 + (i % 3) * 12}%`} h={4} /></span>)}
        </span>
      );
    case "kit_chip": case "kit_tag":
      return <span className="flex h-full flex-wrap content-center items-center gap-1.5 px-3">{Array.from({ length: n(6, 3) }).map((_, i) => <span key={i} className={cn("flex items-center gap-1 border px-2 py-[3px]", k === "kit_chip" ? "rounded-full" : "rounded-[2px]", i === 0 ? "border-ink-4 bg-ink-4" : "border-line-3")}><Bar w={22} h={3} className={i === 0 ? "bg-white" : undefined} />{k === "kit_chip" && <span className={cn("text-[8px] leading-none", i === 0 ? "text-white" : "text-ink-4")}>×</span>}</span>)}</span>;
    case "kit_textarea":
      return <span className="flex h-full flex-col gap-[4px] p-3"><Bar w="22%" dark h={4} /><span className="min-h-0 flex-1 rounded-[2px] border border-line-3 bg-white p-1.5"><Bar w="60%" h={3} /></span><Bar w={40} h={3} className="ml-auto" /></span>;
    case "kit_file_upload":
      return (
        <span className="flex h-full flex-col gap-[6px] p-3">
          <span className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[5px] rounded-[2px] border border-dashed border-ink-4 bg-white"><span className="text-[11px] leading-none text-ink-4">↑</span><Bar w="40%" h={4} /><Btn w={44} /></span>
          <span className="flex items-center gap-2"><span className="size-[8px] border border-ink-4" /><Bar w="40%" h={3} /><span className="ml-auto text-[8px] leading-none text-ink-4">×</span></span>
        </span>
      );
    case "kit_input_otp":
      return <span className="flex h-full flex-col items-center justify-center gap-[7px] p-3"><Bar w="40%" dark h={5} /><span className="flex gap-1.5">{Array.from({ length: 6 }).map((_, i) => <span key={i} className={cn("h-[22px] w-[17px] rounded-[2px] border bg-white", i === 2 ? "border-ink-4 border-2" : "border-line-3")} />)}</span><Bar w="30%" h={3} /></span>;
    case "kit_data_table":
      return (
        <span className="flex h-full flex-col gap-[5px] p-3">
          <span className="flex items-center gap-2"><span className="h-[14px] w-[34%] rounded-[2px] border border-line-3 bg-white" /><span className="ml-auto flex gap-1"><Btn w={30} /><Btn w={30} /></span></span>
          <span className="flex border-t-2 border-ink-4 bg-ground-3">{Array.from({ length: n(5, 3) }).map((_, i) => <span key={i} className="flex flex-1 items-center justify-center gap-[3px] border-r border-line-3 py-[4px] last:border-r-0">{i === 0 ? <span className="size-[7px] border border-ink-4" /> : <><Bar w="44%" h={3} dark /><span className="text-[7px] leading-none text-ink-4">↕</span></>}</span>)}</span>
          {Array.from({ length: 4 }).map((_, r) => <span key={r} className="flex flex-1 border-b border-line-3">{Array.from({ length: n(5, 3) }).map((_, i) => <span key={i} className="flex flex-1 items-center justify-center border-r border-line-3 last:border-r-0">{i === 0 ? <span className="size-[7px] border border-line-3" /> : <Bar w="56%" h={3} />}</span>)}</span>)}
          <span className="flex justify-end gap-1">{Array.from({ length: 4 }).map((_, i) => <span key={i} className={cn("size-[10px] rounded-[2px] border", i === 0 ? "border-ink-4 bg-ink-4" : "border-line-3")} />)}</span>
        </span>
      );
    case "kit_progress":
      return <span className="flex h-full flex-col justify-center gap-[5px] px-3"><span className="flex"><Bar w="24%" dark h={4} /><Bar w={18} h={4} className="ml-auto" /></span><span className="h-[8px] rounded-full bg-line-3"><span className="block h-full w-[62%] rounded-full bg-ink-4" /></span></span>;
    case "kit_alert":
      return <span className="flex h-full items-center gap-2 border-l-4 border-ink-4 bg-ground-3 px-3"><span className="flex size-[12px] items-center justify-center rounded-full bg-ink-4 text-[8px] font-bold leading-none text-white">i</span><span className="flex flex-1 flex-col gap-[4px]"><Bar w="30%" dark h={4} /><Bar w="70%" h={3} /></span><span className="text-[9px] leading-none text-ink-4">×</span></span>;
    case "kit_empty":
      return <span className="flex h-full flex-col items-center justify-center gap-[7px] p-3"><span className="relative size-[38px] overflow-hidden rounded-full border border-line-3"><XFill className="absolute inset-0" /></span><Bar w="34%" dark h={5} /><Bar w="50%" h={3} /><Btn w={52} dark /></span>;
    case "kit_help_panel": case "kit_tutorial_panel":
      return (
        <span className="flex h-full justify-end p-3">
          <span className="flex h-full w-[min(100%,220px)] flex-col gap-[6px] rounded-[3px] border border-ink-4 bg-white p-2">
            <span className="flex items-center gap-1.5"><span className="flex size-[12px] items-center justify-center rounded-full border border-ink-4 text-[8px] font-bold leading-none text-ink-4">{k === "kit_help_panel" ? "?" : "1"}</span><Bar w="50%" dark h={5} /><span className="ml-auto text-[8px] leading-none text-ink-4">×</span></span>
            {k === "kit_tutorial_panel" ? <span className="flex gap-1">{Array.from({ length: 4 }).map((_, i) => <span key={i} className={cn("h-[3px] flex-1 rounded-full", i < 2 ? "bg-ink-4" : "bg-line-3")} />)}</span> : null}
            <Lines n={4} />
            <span className="mt-auto flex justify-end gap-1"><Btn w={30} />{k === "kit_tutorial_panel" && <Btn w={30} dark />}</span>
          </span>
        </span>
      );
    case "kit_dialog":
      return (
        <span className="relative flex h-full items-center justify-center bg-ink/10 p-3">
          <span className="flex w-[min(80%,260px)] flex-col gap-[6px] rounded-[3px] border border-ink-4 bg-white p-2.5 shadow-sm">
            <span className="flex items-center"><Bar w="46%" dark h={6} /><span className="ml-auto text-[9px] leading-none text-ink-4">×</span></span>
            <Lines n={2} />
            <span className="flex justify-end gap-1.5"><Btn w={36} /><Btn w={36} dark /></span>
          </span>
        </span>
      );
    case "kit_drawer":
      return (
        <span className="flex h-full flex-col justify-end bg-ink/10">
          <span className="flex flex-col gap-[6px] rounded-t-[6px] border border-b-0 border-ink-4 bg-white p-2.5">
            <span className="mx-auto h-[3px] w-[28px] rounded-full bg-line-3" />
            <Bar w="34%" dark h={5} /><Lines n={2} /><Btn w={60} dark />
          </span>
        </span>
      );
    case "kit_button_group":
      return <span className="flex h-full items-center justify-center gap-1.5 px-3"><Btn w={50} /><Btn w={50} /><Btn w={64} dark /></span>;
    case "kit_toggle_group":
      return <span className="flex h-full items-center px-3"><span className="flex rounded-[3px] border border-line-3 bg-ground-3 p-[2px]">{Array.from({ length: 3 }).map((_, i) => <span key={i} className={cn("flex h-[16px] w-[40px] items-center justify-center rounded-[2px]", i === 0 && "border border-line-3 bg-white")}><Bar w="50%" h={3} dark={i === 0} /></span>)}</span></span>;
    case "kit_separator":
      return <span className="flex h-full items-center px-3"><span className="h-px w-full bg-ink-4" /></span>;
    case "kit_skeleton":
      return <span className="flex h-full gap-3 p-3"><span className="h-full w-[30%] rounded-[3px] bg-ground-3" /><span className="flex flex-1 flex-col gap-[7px]"><span className="h-[10px] w-[50%] rounded-[2px] bg-ground-3" />{Array.from({ length: 4 }).map((_, i) => <span key={i} className="h-[6px] rounded-[2px] bg-ground-3" style={{ width: `${90 - i * 12}%` }} />)}</span></span>;
    case "kit_identifier":
      return <span className="flex h-full items-center gap-2 px-3"><span className="relative h-[20px] w-[20px] shrink-0 overflow-hidden rounded-full border border-ink-4"><XFill className="absolute inset-0" /></span><Bar w="26%" dark h={5} /><Bar w="20%" h={3} className="ml-auto" /></span>;
    case "content_block":
    default:   // content_block — 제목 + 글 + 그림 반쪽
      return (
        <span className={cn("flex h-full gap-3 p-3", narrow && "flex-col")}>
          <span className="flex flex-1 flex-col gap-[6px]"><Title /><Lines n={narrow ? 3 : 5} /></span>
          {!narrow && <Img className="h-full w-[34%]" />}
        </span>
      );
  }
}

/** 브라우저 창 머리 — 와이어를 실제 화면처럼 보이게 */
export function BrowserBar({ url }: { url: string }) {
  return (
    <div className="flex h-8 items-center gap-2 border-b border-line-3 bg-ground-2 px-3">
      <span className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="size-2.5 rounded-full border border-line-3 bg-white" />)}</span>
      <span className="mx-auto flex h-5 w-[min(420px,60%)] items-center justify-center rounded-full border border-line-3 bg-white px-3 text-[11px] text-ink-4"><span className="truncate">{url}</span></span>
    </div>
  );
}
