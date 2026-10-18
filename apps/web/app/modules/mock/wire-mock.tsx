// powerMock 기획 와이어 "내용 보기" — 칸마다 섹션 모양(구조) 안에 예시 글을 실제 자리에 넣어 그린다(목업 와이어).
// powerDeck 와이어(modules/deck/legacy/Wireframe.tsx)가 기획 글·수치를 상자에 그대로 넣어 "완성 목업 수준"으로 보여 주는 것을 홈페이지 섹션에 옮겼다
// (2026-10-18 사용자 "홈페이지 제작 와이어프레임도 목업 와이어프레임 수준으로"). 예전 내용 보기는 큰 빈 상자에 글만 위에 적혀 있었다.
// 글은 서버 WireContent::fill 이 채운 것(t 제목 · s 한 줄 · items 항목 · desc 설명 · img 그림 종류) — 여기서는 지어내지 않고 배치만 한다.
// 날짜·번호·달력 숫자처럼 모양을 잡는 장식 값만 결정적으로 붙인다. 무채색 와이어(색 없음) — 구조 보기(wire-art.tsx)와 같은 표기.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Bar, Dot, Img, Lines } from "./wire-art";

export interface MockCol { k: string; span: number; t?: string; s?: string; items?: string[]; desc?: string[]; img?: { kind: string; label: string }; label?: string; sign?: string }

const T = ({ children, size = 13, className, lines = 2 }: { children: ReactNode; size?: number; className?: string; lines?: 1 | 2 | 3 }) => (
  <span className={cn("block break-keep font-bold leading-snug text-ink", lines === 1 ? "truncate" : lines === 2 ? "line-clamp-2" : "line-clamp-3", className)} style={{ fontSize: size }}>{children}</span>
);
const S = ({ children, className, lines = 2 }: { children: ReactNode; className?: string; lines?: 1 | 2 | 3 }) => (
  <span className={cn("block break-keep text-[11px] leading-snug text-ink-3", lines === 1 ? "truncate" : lines === 2 ? "line-clamp-2" : "line-clamp-3", className)}>{children}</span>
);
/** 그림 자리 꼬리표 — 어떤 샘플 그림이 들어갈지 */
const ImgTag = ({ label }: { label?: string }) => label ? <span className="absolute bottom-1 right-1 max-w-[90%] truncate rounded-sm bg-white/95 px-1 py-[1px] text-[10px] leading-tight text-ink-4 ring-1 ring-line-3">그림: {label}</span> : null;
const Pill = ({ children, dark }: { children: ReactNode; dark?: boolean }) => (
  <span className={cn("inline-flex h-[20px] shrink-0 items-center rounded-[3px] border px-2 text-[10.5px] font-semibold leading-none", dark ? "border-ink-3 bg-ink-3 text-white" : "border-ink-4 bg-white text-ink-2")}>{children}</span>
);
const More = () => <span className="ml-auto shrink-0 text-[10.5px] font-semibold text-ink-4">더보기 +</span>;
/** 모양용 날짜 — 위에서부터 최근순(결정적) */
const dateOf = (i: number) => `2026.10.${String(Math.max(1, 17 - i * 3)).padStart(2, "0")}`;
/** "AI 상담 1,240건" → ["AI 상담", "1,240건"], "재학생 1만 2천 명" → ["재학생", "1만 2천 명"] — 첫 숫자부터가 수치 */
const splitNum = (s: string): [string, string] => {
  const m = s.match(/^(\D*?)\s*(\d.*)$/u);
  return m && m[1] ? [m[1], m[2]!] : [s, ""];
};
const list = (c: MockCol) => (c.items ?? []).filter(Boolean);
const parts = (s?: string, sep = " · ") => (s ?? "").split(sep).map((x) => x.trim()).filter(Boolean);

/** 칸 종류별 목업 그림. 다루지 않는 종류(키트 부품 등)는 null — 부르는 쪽이 구조 그림 + 제목으로 대신한다. */
export function SectionMock({ c, span, mobile }: { c: MockCol; span: number; mobile?: boolean }): ReactNode | null {
  const narrow = mobile || span <= 4;
  const n = (wide: number, nar: number) => (narrow ? nar : wide);
  const items = list(c);
  switch (c.k) {
    case "masthead":
      return <span className="flex h-full items-center gap-2 px-3"><span className="size-[9px] shrink-0 rounded-full border border-ink-4" /><span className="truncate text-[10.5px] text-ink-3">{c.t}</span></span>;
    case "skip_nav":
      return <span className="flex h-full items-center px-3 text-[10.5px] text-ink-4">본문 바로가기 · 주 메뉴 바로가기</span>;
    case "header":
      return (
        <span className="flex h-full items-center gap-3 px-3">
          <span className="flex shrink-0 items-center gap-1.5"><Img className="size-[22px] rounded-full" /><T size={14} lines={1}>{c.t}</T></span>
          {!narrow && <span className="flex min-w-0 flex-1 justify-center gap-[4%] overflow-hidden">{items.slice(0, 6).map((x, i) => <span key={i} className="truncate text-[12px] font-semibold text-ink-2">{x}</span>)}</span>}
          <span className={cn("flex shrink-0 items-center gap-1.5", narrow && "ml-auto")}><span className="size-[14px] rounded-full border-2 border-ink-4" /><span className="flex w-[14px] flex-col gap-[2px]"><Bar h={2} dark /><Bar h={2} dark /><Bar h={2} dark /></span></span>
        </span>
      );
    case "main_visual": case "hero":
      return (
        <span className="relative flex h-full">
          <Img className="absolute inset-0 border-0"><ImgTag label={c.img?.label} /></Img>
          <span className={cn("relative flex flex-col justify-center gap-2 bg-white/90 p-4", narrow ? "w-full" : "w-[46%]")}>
            <T size={narrow ? 15 : 20} lines={3}>{c.t}</T>
            {c.s && <S lines={2} className="text-[12px]">{c.s}</S>}
            <span className="mt-1 flex gap-1.5"><Pill dark>자세히 보기</Pill><Pill>바로가기</Pill></span>
          </span>
          <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1"><Dot on /><Dot /><Dot /><Dot /><span className="ml-1 text-[9px] leading-none text-ink-4">❚❚</span></span>
        </span>
      );
    case "sub_visual":
      return (
        <span className="relative flex h-full items-center justify-center">
          <Img className="absolute inset-0 border-0"><ImgTag label={c.img?.label} /></Img>
          <span className="relative flex flex-col items-center gap-1 bg-white/90 px-4 py-2 text-center"><T size={17} lines={1}>{c.t}</T>{c.s && <S lines={1}>{c.s}</S>}</span>
        </span>
      );
    case "main_search": {
      const chips = parts((c.s ?? "").replace(/^추천 검색어:\s*/u, ""));
      return (
        <span className="flex h-full flex-col items-center justify-center gap-2 px-3">
          <T size={15} lines={1}>{c.t}</T>
          <span className="flex h-[30px] w-full max-w-[560px] items-center rounded-full border-2 border-ink-3 bg-white px-3 text-[11px] text-ink-4">검색어를 입력하세요<span className="ml-auto size-[12px] rounded-full border-2 border-ink-3" /></span>
          {chips.length > 0 && <span className="flex flex-wrap justify-center gap-1.5">{chips.slice(0, n(5, 3)).map((x, i) => <span key={i} className="rounded-full border border-line-3 px-2 py-[2px] text-[10.5px] text-ink-3"># {x}</span>)}</span>}
        </span>
      );
    }
    case "quick_links": case "floating_quick": {
      const cols = c.k === "floating_quick" ? 1 : Math.min(items.length || 6, n(8, 4));   // 한 줄만 — 좁은 칸에서 두 줄이면 칸 높이를 넘어 잘린다
      return (
        <span className="flex h-full flex-col justify-center gap-2 px-3 py-2">
          {c.k === "quick_links" && <T size={13} lines={1}>{c.t}</T>}
          <span className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {(items.length ? items : [c.t ?? ""]).slice(0, cols).map((x, i) => (
              <span key={i} className="flex min-w-0 flex-col items-center gap-1.5">
                <span className={cn("flex items-center justify-center rounded-full border border-ink-4 bg-white", narrow ? "size-[30px]" : "size-[38px]")}><span className="size-[15px] rounded-[3px] border border-ink-4 bg-ground-3" /></span>
                <span className="line-clamp-2 break-keep text-center text-[11px] font-semibold leading-tight text-ink-2">{x}</span>
              </span>
            ))}
          </span>
        </span>
      );
    }
    case "text_band":
      return (
        <span className="flex h-full items-center gap-3 bg-ground-3 px-4">
          <span className="min-w-0 flex-1"><T size={14} lines={narrow ? 2 : 1}>{c.t}</T>{c.s && c.s !== "자세히 보기" && <S lines={1}>{c.s}</S>}</span>
          <Pill dark>{c.s === "자세히 보기" ? "자세히 보기" : "바로가기"} ›</Pill>
        </span>
      );
    case "news_tabs": {
      const tabs = parts(c.t?.replace(/\s*\(\d+\)$/u, ""));
      return (
        <span className="flex h-full flex-col gap-1.5 p-3">
          <span className="flex items-end border-b border-line-3">
            {(tabs.length ? tabs : ["공지사항"]).slice(0, n(4, 3)).map((x, i) => <span key={i} className={cn("truncate px-2 pb-1 text-[12px]", i === 0 ? "-mb-px border-b-2 border-ink font-bold text-ink" : "text-ink-4")}>{x}</span>)}
            <More />
          </span>
          <span className="flex flex-1 flex-col">
            {/* 목록은 다섯 줄 — 예시 글이 모자라면 나머지 줄은 글 자리 막대(빈 띠 대신) */}
            {Array.from({ length: 5 }, (_, i) => items[i] ?? "").map((x, i) => (
              <span key={i} className="flex items-center gap-2 border-b border-line py-[5px]">
                {x ? <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-2">{x}</span> : <span className="flex-1"><Bar w={`${62 - i * 6}%`} h={5} /></span>}
                {!narrow && <span className="shrink-0 text-[10.5px] tabular-nums text-ink-4">{dateOf(i)}</span>}
              </span>
            ))}
          </span>
        </span>
      );
    }
    case "board_list":
      return (
        <span className="flex h-full flex-col gap-1.5 p-3">
          <span className="flex items-center gap-2"><span className="text-[11px] text-ink-3">{c.t}</span><span className="ml-auto flex h-[22px] w-[34%] min-w-[110px] items-center rounded-[3px] border border-ink-4 px-2 text-[10.5px] text-ink-4">검색어 입력<span className="ml-auto size-[9px] rounded-full border-2 border-ink-4" /></span></span>
          <span className="flex border-y border-ink-4 bg-ground-3 py-[4px] text-[10.5px] font-bold text-ink-2">
            {(narrow ? [["번호", "16%"], ["제목", "84%"]] : [["번호", "8%"], ["제목", "58%"], ["작성일", "18%"], ["조회", "16%"]]).map(([h, w], i) => <span key={i} className="text-center" style={{ width: w }}>{h}</span>)}
          </span>
          <span className="flex flex-1 flex-col">
            {items.slice(0, 6).map((x, i) => (
              <span key={i} className="flex items-center border-b border-line py-[5px] text-[11px]">
                <span className="text-center tabular-nums text-ink-4" style={{ width: narrow ? "16%" : "8%" }}>{128 - i}</span>
                <span className="truncate px-1 text-ink-2" style={{ width: narrow ? "84%" : "58%" }}>{x}</span>
                {!narrow && <><span className="text-center tabular-nums text-ink-4" style={{ width: "18%" }}>{dateOf(i)}</span><span className="text-right tabular-nums text-ink-4" style={{ width: "16%", paddingRight: "4%" }}>{(i * 137 + 212) % 900 + 40}</span></>}
              </span>
            ))}
          </span>
          <span className="flex justify-center gap-1">{[1, 2, 3, 4, 5].map((p) => <span key={p} className={cn("flex size-[18px] items-center justify-center rounded-[2px] border text-[10px]", p === 1 ? "border-ink-3 bg-ink-3 text-white" : "border-line-3 text-ink-3")}>{p}</span>)}</span>
        </span>
      );
    case "board_view":
      return (
        <span className="flex h-full flex-col gap-2 p-3">
          <span className="border-y-2 border-ink-3 py-2"><T size={14}>{c.t}</T>{c.s && <S lines={1} className="mt-1">{c.s}</S>}</span>
          <span className="flex flex-1 flex-col gap-[6px] py-1"><Lines n={5} /><Img className="mt-1 h-[34%] w-[46%]" /></span>
          <span className="flex items-center gap-2 rounded-[2px] bg-ground-3 px-2 py-1 text-[10.5px] text-ink-3">📎 첨부파일 1개</span>
          <span className="flex justify-center"><Pill dark>목록</Pill></span>
        </span>
      );
    case "greeting_vision":
      return (
        <span className={cn("flex h-full gap-4 p-4", narrow && "flex-col")}>
          <Img className={cn("shrink-0", narrow ? "h-[40%] w-full" : "h-full w-[30%]")}><ImgTag label={c.img?.label ?? "기관장 사진"} /></Img>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            <T size={16} lines={2}>{c.t}</T>
            {c.s && <S lines={1} className="text-[12px] text-ink-2">{c.s}</S>}
            <Lines n={4} />
            {c.sign && <span className="ml-auto text-[12px] font-bold text-ink-2">{c.sign}</span>}
          </span>
        </span>
      );
    case "calendar": {
      // 달력 달 = 첫 일정의 달, 그 달 일정 날짜만 칠한다("11.03 수시 면접"을 10월 3일로 칠하던 것)
      const md = items.map((x) => x.match(/^(\d{1,2})\.(\d{1,2})/)).filter((m): m is RegExpMatchArray => !!m);
      const month = md[0] ? Number(md[0][1]) : 10;
      const days = new Set(md.filter((m) => Number(m[1]) === month).map((m) => Number(m[2])));
      return (
        <span className={cn("flex h-full gap-3 p-3", (narrow || span <= 6) && "flex-col")}>
          <span className={cn("flex flex-col gap-1", !(narrow || span <= 6) && "w-[46%]")}>
            <span className="flex items-center justify-center gap-3 text-[12px] font-bold text-ink"><span className="text-ink-4">‹</span>2026. {String(month).padStart(2, "0")}<span className="text-ink-4">›</span></span>
            <span className="grid grid-cols-7 gap-[2px] text-center text-[9.5px] leading-[15px] tabular-nums">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => <span key={d} className="font-bold text-ink-3">{d}</span>)}
              {Array.from({ length: 4 }).map((_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: 31 }).map((_, i) => <span key={i} className={cn("rounded-[2px]", days.has(i + 1) ? "bg-ink-3 font-bold text-white" : "text-ink-3")}>{i + 1}</span>)}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center"><T size={12.5} lines={1}>{c.t}</T><More /></span>
            {items.slice(0, 4).map((x, i) => <span key={i} className="truncate border-b border-line py-[3px] text-[11px] text-ink-2">{x}</span>)}
          </span>
        </span>
      );
    }
    case "sns_video": case "tour_cards": case "photo_gallery": {
      const caps = items.length ? items : c.s ? [c.s] : [];
      const cnt = Math.max(1, Math.min(n(4, 2), Math.max(caps.length, n(4, 2))));
      return (
        <span className="flex h-full flex-col gap-2 p-3">
          <span className="flex items-center"><T size={13} lines={1}>{c.t}</T><More /></span>
          <span className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${cnt}, minmax(0,1fr))` }}>
            {Array.from({ length: cnt }).map((_, i) => (
              <span key={i} className="flex min-h-0 flex-col gap-1">
                <Img className="min-h-0 flex-1">
                  {c.k === "sns_video" && <span className="absolute left-1/2 top-1/2 flex size-[20px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink-3 bg-white text-[8px] text-ink-3">▶</span>}
                  {i === 0 && <ImgTag label={c.img?.label} />}
                </Img>
                {/* 같은 설명을 칸마다 되풀이하지 않는다 — 글이 모자라면 나머지는 글 자리 막대 */}
                {caps[i] ? <span className="line-clamp-2 break-keep text-[11px] font-semibold leading-tight text-ink-2">{caps[i]}</span> : <Bar w="72%" h={5} className="my-[3px]" />}
                {c.desc?.[i] && !narrow && <span className="line-clamp-1 text-[10px] text-ink-4">{c.desc[i]}</span>}
              </span>
            ))}
          </span>
        </span>
      );
    }
    case "popup_zone":
      return (
        <span className="flex h-full flex-col gap-1.5 p-3">
          <span className="flex items-center"><T size={12.5} lines={1}>{c.t}</T><span className="ml-auto text-[10px] tabular-nums text-ink-4">1 / 3 ‹ ›</span></span>
          <Img className="min-h-0 flex-1"><span className="absolute inset-x-2 top-1/2 -translate-y-1/2 bg-white/90 px-2 py-1 text-center text-[11.5px] font-bold leading-snug text-ink-2">{c.s}</span><ImgTag label={c.img?.label} /></Img>
        </span>
      );
    case "banner_zone":
      return (
        <span className="flex h-full flex-col gap-1.5 px-3 py-2">
          <span className="flex items-center gap-2"><T size={12.5} lines={1}>{c.t}</T><span className="ml-auto text-[10px] text-ink-4">‹ ❚❚ ›</span></span>
          <span className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(n(3, 1), Math.max(1, items.length))}, minmax(0, 1fr))` }}>
            {(items.length ? items : [""]).slice(0, n(3, 1)).map((x, i) => (
              <Img key={i} className="min-h-[34px]"><span className="absolute inset-x-2 top-1/2 -translate-y-1/2 line-clamp-2 bg-white/90 px-1.5 py-[2px] text-center text-[11px] font-semibold leading-tight text-ink-2">{x}</span></Img>
            ))}
          </span>
        </span>
      );
    case "news_ticker":
      return <span className="flex h-full items-center gap-2 px-3"><Pill dark>{c.t ?? "알림"}</Pill><span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-2">{c.s}</span><span className="shrink-0 text-[10px] text-ink-4">‹ ❚❚ ›</span></span>;
    case "stats": case "stat_cards": {
      const cnt = Math.min(n(4, 2), Math.max(1, items.length));
      return (
        <span className="flex h-full flex-col justify-center gap-2 px-3 py-2">
          <T size={13} lines={1}>{c.t}</T>
          <span className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cnt}, minmax(0,1fr))` }}>
            {items.slice(0, narrow ? 4 : cnt).map((x, i) => {
              const [lab, num] = splitNum(x);
              return (
                <span key={i} className="flex min-w-0 flex-col items-center gap-0.5 rounded-[3px] border border-line-3 bg-white px-1 py-2 text-center">
                  <span className="truncate text-[17px] font-extrabold leading-tight tabular-nums text-ink">{num || lab}</span>
                  {num && <span className="truncate text-[10.5px] text-ink-3">{lab}</span>}
                </span>
              );
            })}
          </span>
        </span>
      );
    }
    case "breadcrumb":
      return <span className="flex h-full items-center gap-1.5 truncate px-3 text-[11px] text-ink-3">⌂ {parts(c.t, " > ").slice(1).map((x, i, a) => <span key={i} className={cn(i === a.length - 1 && "font-bold text-ink")}>› {x}</span>)}</span>;
    case "page_title":
      return <span className="flex h-full items-center gap-2 border-b-2 border-ink-3 px-3"><T size={18} lines={1}>{c.t}</T><span className="ml-auto flex shrink-0 gap-1.5 text-[10px] text-ink-4"><span className="rounded-full border border-ink-4 px-1.5">공유</span><span className="rounded-full border border-ink-4 px-1.5">인쇄</span></span></span>;
    case "content_tabs":
      return (
        <span className="flex h-full flex-col justify-center gap-2 p-3">
          <span className="flex border-b border-line-3">{items.slice(0, n(5, 3)).map((x, i) => <span key={i} className={cn("flex-1 truncate pb-1 text-center text-[11.5px]", i === 0 ? "-mb-px border-b-2 border-ink font-bold text-ink" : "text-ink-4")}>{x}</span>)}</span>
          <Lines n={3} />
        </span>
      );
    case "form":
      return (
        <span className="flex h-full flex-col gap-2 p-3">
          <T size={13} lines={1}>{c.t}</T>
          {items.filter((x) => !/동의|제출/u.test(x)).slice(0, n(4, 3)).map((x, i) => (
            <span key={i} className="flex items-center gap-2"><span className="w-[22%] shrink-0 truncate text-[11px] font-semibold text-ink-2">{x}</span><span className="h-[20px] flex-1 rounded-[3px] border border-line-3 bg-white" /></span>
          ))}
          {items.some((x) => /동의/u.test(x)) && <span className="flex items-center gap-1.5 text-[10.5px] text-ink-3"><span className="size-[10px] border border-ink-4" />개인정보 수집·이용에 동의합니다</span>}
          <span className="mt-auto flex justify-center gap-2"><Pill>취소</Pill><Pill dark>제출</Pill></span>
        </span>
      );
    case "org_chart":
      return (
        <span className="flex h-full flex-col items-center justify-center gap-2 p-3">
          <span className="rounded-[3px] border-2 border-ink-3 px-3 py-1 text-[11.5px] font-bold text-ink">{c.t?.replace(/\s*조직도$/u, "") || "기관장"}</span>
          <span className="h-[8px] w-px bg-ink-4" />
          <span className="flex w-full flex-wrap justify-center gap-1.5 border-t border-ink-4 pt-2">{items.slice(0, n(6, 4)).map((x, i) => <span key={i} className="rounded-[3px] border border-ink-4 bg-white px-2 py-[3px] text-[10.5px] text-ink-2">{x}</span>)}</span>
        </span>
      );
    case "sitemap":
      return (
        <span className="flex h-full p-3">
          <span className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(n(5, 2), Math.max(1, items.length))}, minmax(0,1fr))` }}>
            {items.slice(0, n(5, 2)).map((x, i) => <span key={i} className="flex flex-col gap-[5px]"><span className="truncate border-b-2 border-ink-3 pb-1 text-[11.5px] font-bold text-ink">{x}</span>{Array.from({ length: 4 }).map((_, j) => <Bar key={j} w={`${46 + j * 9}%`} h={3} />)}</span>)}
          </span>
        </span>
      );
    case "satisfaction":
      return (
        <span className="flex h-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[3px] bg-ground-3 px-3">
          <span className="text-[11px] font-bold text-ink-2">{c.t}</span>
          <span className="flex gap-2">{parts(c.s).map((x, i) => <span key={i} className="flex items-center gap-1 text-[10.5px] text-ink-3"><span className={cn("size-[9px] rounded-full border border-ink-4", i === 1 && "bg-ink-4")} />{x}</span>)}</span>
          <Pill dark>평가하기</Pill>
        </span>
      );
    case "notice_box":
      return (
        <span className="flex h-full items-center gap-2 rounded-[3px] border border-line-3 bg-ground-3 px-3">
          <span className="flex size-[16px] shrink-0 items-center justify-center rounded-full border border-ink-4 text-[10px] font-bold text-ink-3">!</span>
          <span className="min-w-0"><T size={12} lines={1}>{c.t}</T>{c.s && <S lines={2}>{c.s}</S>}</span>
        </span>
      );
    case "timeline":
      return (
        <span className="flex h-full flex-col justify-around gap-1 p-3">
          {items.slice(0, 5).map((x, i) => {
            const m = x.match(/^(\d{4})\s*(.*)$/u);
            return (
              <span key={i} className="flex items-center gap-2">
                <span className="w-[44px] shrink-0 text-[12px] font-extrabold tabular-nums text-ink">{m?.[1] ?? ""}</span>
                <span className="relative flex self-stretch"><span className="w-px bg-ink-4" /><span className="absolute -left-[3px] top-1/2 size-[7px] -translate-y-1/2 rounded-full border border-ink-4 bg-white" /></span>
                <span className="truncate text-[11px] text-ink-2">{m?.[2] ?? x}</span>
              </span>
            );
          })}
        </span>
      );
    case "location_map":
      return (
        <span className={cn("flex h-full gap-3 p-3", narrow && "flex-col")}>
          <Img className={cn(narrow ? "h-[55%] w-full" : "h-full w-[58%]")}><span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[15px] leading-none">📍</span><ImgTag label="지도" /></Img>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <T size={13} lines={1}>{c.t}</T>
            {c.s && <S lines={2} className="text-ink-2">{c.s}</S>}
            {["지하철", "버스", "주차"].map((x) => <span key={x} className="flex items-center gap-2"><span className="w-[38px] shrink-0 text-[10.5px] font-bold text-ink-3">{x}</span><Bar w="60%" h={4} /></span>)}
          </span>
        </span>
      );
    case "faq_list":
      return (
        <span className="flex h-full flex-col p-3">
          <T size={13} lines={1}>{c.t}</T>
          {items.slice(0, 5).map((x, i) => (
            <span key={i} className="flex flex-col border-b border-line-3 py-[5px]">
              <span className="flex items-center gap-2"><span className="text-[11px] font-extrabold text-ink-3">Q</span><span className={cn("min-w-0 flex-1 truncate text-[11.5px]", i === 0 ? "font-bold text-ink" : "text-ink-2")}>{x}</span><span className="text-[11px] text-ink-4">{i === 0 ? "−" : "+"}</span></span>
              {i === 0 && <span className="mt-1 flex gap-2 rounded-[2px] bg-ground-3 px-2 py-1.5"><span className="text-[11px] font-extrabold text-ink-4">A</span><span className="flex-1"><Lines n={2} /></span></span>}
            </span>
          ))}
        </span>
      );
    case "contact_info":
      return (
        <span className="flex h-full flex-wrap items-center gap-x-4 gap-y-1 rounded-[3px] border border-line-3 px-3">
          <span className="text-[11.5px] font-bold text-ink">{c.t}</span>
          {parts(c.s).map((x, i) => <span key={i} className="text-[11px] text-ink-2">{x}</span>)}
        </span>
      );
    case "step_flow":
      return (
        <span className="flex h-full flex-col justify-center gap-2 px-3">
          <T size={13} lines={1}>{c.t}</T>
          <span className={cn("flex gap-[2%]", narrow && "flex-col gap-1")}>
            {items.slice(0, 6).map((x, i, a) => (
              <span key={i} className={cn("flex min-h-[38px] flex-1 flex-col items-center justify-center bg-ground-4 px-3 text-center", narrow && "min-h-[26px] flex-row gap-2")}
                style={{ clipPath: !narrow && i < a.length - 1 ? "polygon(0 0,90% 0,100% 50%,90% 100%,0 100%)" : undefined }}>
                <span className="text-[9.5px] font-bold text-ink-4">STEP {i + 1}</span>
                <span className="line-clamp-2 break-keep text-[11px] font-bold leading-tight text-ink-2">{x}</span>
              </span>
            ))}
          </span>
        </span>
      );
    case "info_table": {
      const head = parts(c.s);
      const cols = Math.max(2, Math.min(n(4, 3), head.length || 4));
      const rows = items.length ? items : ["", "", ""];
      return (
        <span className="flex h-full flex-col gap-1.5 p-3">
          <T size={13} lines={1}>{c.t}</T>
          <span className="flex flex-col">
            <span className="flex border-t-2 border-ink-3 bg-ground-3">{Array.from({ length: cols }).map((_, i) => <span key={i} className="flex-1 truncate border-r border-line-3 py-[4px] text-center text-[10.5px] font-bold text-ink-2 last:border-r-0">{head[i] ?? ""}</span>)}</span>
            {rows.slice(0, 4).map((x, r) => (
              <span key={r} className="flex border-b border-line-3">
                {Array.from({ length: cols }).map((_, i) => <span key={i} className="flex flex-1 items-center justify-center border-r border-line-3 py-[5px] last:border-r-0">{i === 0 && x ? <span className="truncate px-1 text-[10.5px] text-ink-2">{x}</span> : <Bar w="56%" h={3} />}</span>)}
              </span>
            ))}
          </span>
        </span>
      );
    }
    case "ai_chatbot":
      return (
        <span className="flex h-full flex-col gap-1.5 p-3">
          <span className="flex items-center gap-1.5"><span className="flex size-[18px] items-center justify-center rounded-full border border-ink-4 text-[9px] font-bold text-ink-3">AI</span><T size={12.5} lines={1}>{c.t}</T></span>
          <span className="max-w-[80%] self-start rounded-[8px] rounded-tl-[1px] bg-ground-3 px-2 py-1 text-[11px] text-ink-2">무엇을 도와드릴까요?</span>
          {c.s && <span className="max-w-[80%] self-end truncate rounded-[8px] rounded-tr-[1px] border border-line-3 px-2 py-1 text-[11px] text-ink-2">{c.s.replace(/^예:\s*/u, "")}</span>}
          <span className="mt-auto flex h-[22px] items-center rounded-full border border-ink-4 px-2 text-[10.5px] text-ink-4">질문을 입력하세요</span>
        </span>
      );
    case "footer":
      return (
        <span className="flex h-full flex-col gap-2 bg-ground-3 p-3">
          <span className="flex items-center gap-3 border-b border-line-3 pb-1.5 text-[10.5px] text-ink-3">
            <span className="font-bold text-ink">개인정보처리방침</span><span>이용약관</span>{!narrow && <><span>저작권정책</span><span>찾아오시는 길</span></>}
            <span className="ml-auto flex h-[20px] w-[22%] min-w-[80px] items-center rounded-[3px] border border-ink-4 bg-white px-1.5 text-[10px] text-ink-4">관련 사이트 ▾</span>
          </span>
          <span className="flex flex-1 items-center gap-3">
            <span className="shrink-0 text-[13px] font-extrabold text-ink-3">{c.t}</span>
            <span className="min-w-0 flex-1"><S lines={2}>{c.s}</S><span className="block text-[10px] text-ink-4">© {c.t}. All rights reserved.</span></span>
          </span>
        </span>
      );
    case "content_block":
      return (
        <span className={cn("flex h-full gap-3 p-3", narrow && "flex-col")}>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5"><T size={14}>{c.t}</T>{c.s && <S lines={3} className="text-ink-2">{c.s}</S>}<Lines n={narrow ? 2 : 3} /></span>
          {!narrow && <Img className="h-full w-[34%]"><ImgTag label={c.img?.label} /></Img>}
        </span>
      );
    case "kit_identifier":
      return <span className="flex h-full items-center gap-2 px-3"><span className="size-[16px] rounded-full border border-ink-4" /><span className="truncate text-[11px] text-ink-3">{c.t}</span></span>;
    default:
      return null;
  }
}
