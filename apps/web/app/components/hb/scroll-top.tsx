import { ArrowUp, Bot, MessageCircle, MessagesSquare, X } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// 화면 우측 하단에 따라다니는 버튼 — 예전엔 powerPlus AI(주황) + 문의(흰색) + TOP 이 세로로 쌓여 모바일에서 카드·금액·추천 질문을 가렸다(종합평가 1-5).
// → 버튼 하나(도움)로 합치고, 누르면 작은 창에서 "AI 에게 묻기 / 문의하기" 를 고른다. TOP 은 400px 넘게 내려가야 도움 버튼 위에 나타난다.
// powerPlus AI 는 홈 한가운데 채팅과 같은 대화다(2026-10-08 사용자 "메인 채팅과 챗봇은 하나야") — 홈에서는 창을 띄우지 않고 맨 위 채팅으로 올려 보낸다.
// 모바일은 하단 탭바 위로 띄우고, 페이지 맨 아래에 버튼 높이만큼 빈 자리를 둔다(바닥글 로고를 덮지 않게).
const BTN = "inline-flex size-12 items-center justify-center rounded-full bg-ground-3 text-ink shadow-[0_4px_16px_rgba(0,0,0,.08)] ring-1 ring-line hb-float duration-300 hover:bg-line";
const ITEM = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/10 focus-visible:bg-white/10";
const MainChat = lazy(() => import("@/components/chat/main-chat").then((m) => ({ default: m.MainChat })));

export function ScrollTop() {
  const [show, setShow] = useState(false);
  const [bot, setBot] = useState(false);
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const home = pathname === "/";
  // 바닥글이 화면에 들어오면 버튼 묶음을 바닥글 위로 올린다 — 1440×900 에서 "개인정보처리방침"·"© 2026 SOLIDEO." 를 덮었다(2026-10-17 점검)
  const dock = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const on = () => {
      const f = document.querySelector("[data-site-footer]");
      const el = dock.current;
      // 모바일은 바닥글 아래 여백(pb-28)이 버튼 자리라 올리지 않는다 — 올리면 바로 위 띠의 버튼을 덮는다
      if (!f || !el || window.innerWidth < 768) { setLift(0); return; }
      const over = window.innerHeight - f.getBoundingClientRect().top; // 바닥글이 화면 아래에서 올라온 높이
      const bottom = parseFloat(getComputedStyle(el).bottom) || 0; // 버튼 묶음 아래 여백(모바일 탭바 위 96 · PC 32)
      setLift(Math.max(0, Math.round(over - bottom + 16)));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    const ro = new ResizeObserver(on); // 본문이 늦게 채워져 바닥글 위치가 바뀌는 경우
    ro.observe(document.body);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); ro.disconnect(); };
  }, [pathname]);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 400);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!bot) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") setBot(false); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [bot]);
  const askAi = () => {
    setMenu(false);
    if (home) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBot(true);
  };
  return (
    <>
      {bot && !home && (
        <div role="dialog" aria-label="powerPlus AI"
          className="hb-pop fixed inset-x-5 bottom-[156px] z-50 ml-auto flex h-[min(640px,calc(100dvh-236px))] max-w-[460px] flex-col overflow-hidden rounded-2xl bg-ground shadow-[0_16px_48px_rgba(0,0,0,.18)] ring-1 ring-line md:inset-x-8 md:bottom-[92px] md:h-[min(640px,calc(100dvh-172px))]">
          <Suspense fallback={<p className="p-5 text-sm text-ink-4">불러오는 중…</p>}><MainChat variant="dock" onClose={() => setBot(false)} /></Suspense>
        </div>
      )}
      <div ref={dock} style={lift ? { transform: `translateY(-${lift}px)` } : undefined} className="pointer-events-none fixed bottom-24 right-5 z-40 flex flex-col items-center gap-3 md:bottom-8 md:right-8">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="맨 위로" tabIndex={show ? 0 : -1}
          className={cn(BTN, show ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>
          <ArrowUp className="size-5" aria-hidden />
        </button>
        {bot ? (
          <button type="button" onClick={() => setBot(false)} aria-label="powerPlus AI 닫기"
            className="pointer-events-auto relative inline-flex size-12 items-center justify-center rounded-full bg-point text-white shadow-[0_6px_20px_rgba(228,107,55,.35)] hb-float duration-300 hover:brightness-105">
            <X className="size-5" aria-hidden />
          </button>
        ) : (
          <Popover open={menu} onOpenChange={setMenu}>
            <PopoverTrigger asChild>
              <button type="button" aria-label="도움 — AI 에게 묻기·문의하기" title="도움"
                className="pointer-events-auto relative inline-flex size-12 items-center justify-center rounded-full bg-point text-white shadow-[0_6px_20px_rgba(228,107,55,.35)] hb-float duration-300 hover:brightness-105">
                {menu ? <X className="size-5" aria-hidden /> : <MessagesSquare className="size-5" aria-hidden />}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={10} className="w-[200px] p-1.5">
              <button type="button" className={ITEM} onClick={askAi}><Bot className="size-4 shrink-0 text-white/70" aria-hidden />AI 에게 묻기</button>
              <Link to="/contact" className={ITEM} onClick={() => setMenu(false)}><MessageCircle className="size-4 shrink-0 text-white/70" aria-hidden />문의하기</Link>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </>
  );
}
