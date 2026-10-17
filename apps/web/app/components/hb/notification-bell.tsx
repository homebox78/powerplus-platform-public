// 출처: homebox-handoff apps/web/app/components/hb/notification-bell.tsx — 빈 상태 문구는 플랫폼 기준(커뮤니티·자료 요청·장표 완료).
// 2026-10-07 "고르기" 추가 — 여러 개를 골라 읽음·지우기(/me/bulk/notifications/*, 서버가 내 알림만).
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, ListChecks, Trash2, CircleCheck, CreditCard, Heart, Info, Megaphone, MessageCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shortDate, useMarkRead, useNotifications, useUnread, type NotificationItem } from "@/lib/community";
import { postJson } from "@/lib/api";
import { toastError } from "@/components/hb/confirm";
import { cn } from "@/lib/utils";

// 우측 상단 알림 (2026-09-26 사용자 지시). 계정 메뉴와 같은 다크 패널 톤(#2A2A2C).
// 안 읽은 개수 = 포인트 파랑 배지(하이라이트 전용 색). 항목을 누르면 읽음 처리 후 그 화면으로.
const ICON: Record<string, typeof Bell> = { comment: MessageCircle, like: Heart, notice: Megaphone, request: CircleCheck, billing: CreditCard, system: Info, deck: CircleCheck };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { count: unread, latest } = useUnread();
  const mark = useMarkRead();
  const navigate = useNavigate();
  // 새 알림이 오면 우측 상단 토스트 + 탭 제목에 안 읽은 수(사용자 2026-10-07 "사이트에 있으면 우측 상단에도"). 첫 로드는 띄우지 않는다
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!latest) return;
    if (seen.current !== null && latest.id > seen.current) {
      toast(latest.title, { position: "top-right", description: latest.body ?? undefined, duration: 8000,
        action: latest.link ? { label: "보기", onClick: () => { mark.mutate({ ids: [latest.id] }); navigate(latest.link!); } } : undefined });
    }
    seen.current = Math.max(seen.current ?? 0, latest.id);
  }, [latest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
  }, [unread]);
  const list = useNotifications(open);
  const items = list.data?.items ?? [];
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const togglePick = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const endPick = () => { setPicking(false); setPicked([]); };
  const bulk = async (what: "read" | "delete") => {
    try {
      await postJson<{ count: number }>("/me/bulk/notifications/" + what, { ids: picked });
      endPick(); void qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) { toastError(e); }
  };

  const go = (n: NotificationItem) => {
    if (!n.read) mark.mutate({ ids: [n.id] });
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) endPick(); }}>
      <PopoverTrigger asChild>
        <button type="button" className="relative hidden size-9 items-center justify-center rounded-full text-ink hover:bg-ground-3 sm:inline-flex" aria-label={unread ? `알림 ${unread}개 안 읽음` : "알림"}>
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-point px-1 pt-px text-xs font-bold leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[380px] rounded-panel border-0 bg-[#2A2A2C] p-0 text-white ring-0 outline-none" style={{ boxShadow: "0 16px 48px rgba(0,0,0,.35)" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="text-md font-bold">알림{unread > 0 && <span className="ml-1.5 text-sm font-medium text-white/55">{unread}개 안 읽음</span>}</div>
          <span className="flex items-center gap-1">
            {items.length > 0 && (
              <button type="button" aria-pressed={picking} onClick={() => (picking ? endPick() : setPicking(true))}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm text-white/75 hover:bg-[#3D3D40] hover:text-white">
                <ListChecks className="size-4" aria-hidden />{picking ? "고르기 끝" : "고르기"}
              </button>
            )}
            {!picking && <button type="button" disabled={!unread || mark.isPending} onClick={() => mark.mutate({ all: true })}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm text-white/75 hover:bg-[#3D3D40] hover:text-white disabled:pointer-events-none disabled:opacity-40">
              <CheckCheck className="size-4" aria-hidden />모두 읽음
            </button>}
          </span>
        </div>
        <div className="max-h-[440px] overflow-y-auto border-t border-white/10 p-2">
          {list.isLoading ? (
            <p className="px-3 py-10 text-center text-sm text-white/55">불러오는 중…</p>
          ) : items.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <Bell className="mx-auto size-7 text-white/30" aria-hidden />
              <p className="mt-3 text-sm text-white/60">새 알림이 없습니다.</p>
              <p className="text-sm text-white/60">장표 기획·완성, 댓글, 공지, 요청 처리 소식이 여기에 옵니다.</p>
            </div>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = ICON[n.kind] ?? Info;
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => (picking ? togglePick(n.id) : go(n))} aria-pressed={picking ? picked.includes(n.id) : undefined} className="flex w-full gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#3D3D40] focus-visible:bg-[#3D3D40] focus-visible:outline-none">
                      {picking && <span className={cn("mt-1.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-md border", picked.includes(n.id) ? "border-white bg-white text-[#2A2A2C]" : "border-white/40")} aria-hidden>{picked.includes(n.id) && <Check className="size-3.5" strokeWidth={3} />}</span>}
                      <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full", n.read ? "bg-white/8 text-white/50" : "bg-white/15 text-white")}><Icon className="size-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm leading-snug", n.read ? "text-white/65" : "font-semibold text-white")}>{n.title}</span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-white/55">{n.body}</span>}
                        <span className="mt-1 block text-xs text-white/40">{shortDate(n.created_at)}</span>
                      </span>
                      {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-point" aria-label="안 읽음" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {picking ? (
          <div className="flex items-center gap-1.5 border-t border-white/10 p-2">
            <span className="px-2 text-sm text-white/60 tabular-nums">{picked.length}개 고름</span>
            <button type="button" onClick={() => setPicked(picked.length === items.length ? [] : items.map((n) => n.id))} className="h-10 rounded-xl px-3 text-sm text-white/75 hover:bg-[#3D3D40] hover:text-white">{picked.length === items.length ? "모두 해제" : "모두 고르기"}</button>
            <span className="flex-1" />
            <button type="button" disabled={!picked.length} onClick={() => void bulk("read")} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-white/75 hover:bg-[#3D3D40] hover:text-white disabled:pointer-events-none disabled:opacity-40"><CheckCheck className="size-4" aria-hidden />읽음</button>
            <button type="button" disabled={!picked.length} onClick={() => void bulk("delete")} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-white/75 hover:bg-[#3D3D40] hover:text-white disabled:pointer-events-none disabled:opacity-40"><Trash2 className="size-4" aria-hidden />지우기</button>
          </div>
        ) : (
        <div className="border-t border-white/10 p-2">
          <button type="button" onClick={() => { setOpen(false); navigate("/community"); }} className="h-10 w-full rounded-xl text-sm text-white/75 hover:bg-[#3D3D40] hover:text-white">커뮤니티로 가기</button>
        </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
