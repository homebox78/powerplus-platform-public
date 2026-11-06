// 시안 그림 월 상한에 막힌 회원에게만 보이는 띠 — 관리자에게 증액 요청(문의 topic=limit 로 접수, 2026-10-27 사용자 지시).
// 막히지 않았으면 아무것도 그리지 않는다. 그림 상한 오류 토스트가 뜨면 상태를 다시 읽는다(작업 도중 막힌 경우).
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { cn, Ms, toast } from "./ui";

type State = { cap: number | null; spent: number; blocked: boolean; requested: boolean };

export function ImageCapNotice() {
  const [s, setS] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api<State>("/ai/image-cap").then(setS).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const f = (e: Event) => { const m = (e as CustomEvent<{ msg?: string }>).detail?.msg ?? ""; if (m.includes("그림 비용 상한")) load(); };
    window.addEventListener("pd:toast", f);
    return () => window.removeEventListener("pd:toast", f);
  }, [load]);
  if (!s?.blocked) return null;
  const send = async () => {
    setBusy(true);
    try {
      setS(await api<State>("/ai/image-cap/request", { method: "POST", body: JSON.stringify({ reason }) }));
      setOpen(false);
      toast("관리자에게 증액을 요청했습니다. 확인되면 알림으로 알려 드립니다.", "ok");
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };
  return (
    <div role="status" className="mb-4 rounded-[4px] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-4 py-3 text-[14px] text-ink2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Ms name="block" size={19} className="text-[var(--color-warn)]" />
        <span className="break-keep">
          이달 시안 그림 한도(<b className="text-ink">${(s.cap ?? 0).toFixed(2)}</b>)에 도달해 그림을 더 만들 수 없습니다. 사용 ${s.spent.toFixed(2)}.
          기획·대본 같은 글 작업은 그대로 쓸 수 있고, 다음 달 1일에 풀립니다.
        </span>
        {s.requested
          ? <span className="font-semibold text-ink">증액을 요청했습니다 — 관리자가 확인하면 알려 드립니다.</span>
          : !open && <button type="button" className="btn-dark !h-9 !px-4 !font-semibold ml-auto" onClick={() => setOpen(true)}><Ms name="contact_support" size={18} />관리자에게 증액 요청</button>}
      </div>
      {open && !s.requested && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea className={cn("field !text-[14px] !resize-y")} rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="어떤 작업에 더 필요한지 적어 주시면 빨리 처리됩니다 (선택)" aria-label="증액 요청 사유" />
          <div className="flex gap-2">
            <button type="button" className="btn-dark !h-9 !px-4 !font-semibold" disabled={busy} onClick={send}><Ms name="send" size={18} />요청 보내기</button>
            <button type="button" className="btn-ghost !h-9 !px-4" disabled={busy} onClick={() => setOpen(false)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
