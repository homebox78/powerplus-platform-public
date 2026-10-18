// 받기 링크 — 완성 산출물(결과 장표·전체 묶음·서체 묶음)을 URL 로 보낸다(사용자 2026-10-18, api Deck\Links · 0044).
// 주소에는 무작위 토큰만 — 작업 id·파일 경로는 드러나지 않는다. 로그인 없이 받으므로 만들 때 한 번 묻는다(엠바고).
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type Job } from "../api";
import { ask, Ms, toast } from "../ui";

type LinkKind = "result" | "export" | "fonts";
type LinkRow = { id: number; tail: string; kind: LinkKind; created_at: string; expires_at: string; revoked_at: string | null; downloads: number; last_download_at: string | null; state: "active" | "expired" | "revoked" };
type Created = { url: string; id: number; kind: LinkKind; expires_at: string; links: LinkRow[] };

const KIND_LABEL: Record<LinkKind, string> = { result: "결과 장표", export: "전체 묶음", fonts: "서체 묶음" };
const KIND_OPTION: Record<LinkKind, string> = { result: "결과 장표 (.pptx)", export: "전체 묶음 (.zip, 서체 포함)", fonts: "서체 묶음 (.zip)" };
const DAYS = ["1", "7", "30"] as const;
/** 'YYYY-MM-DD HH:MM:SS' → 'MM.DD HH:MM' */
const short = (s: string | null) => (s ? s.slice(5, 16).replace("-", ".") : "—");

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast("링크를 복사했습니다.", "ok"); }
  catch { toast("복사하지 못했습니다. 주소를 직접 골라 복사해 주세요.", "warn"); }
}

export function ShareLinks({ job, hasFonts }: { job: Job; hasFonts: boolean }) {
  const [rows, setRows] = useState<LinkRow[] | null>(null);
  const [kind, setKind] = useState<LinkKind>("result");
  const [days, setDays] = useState<(typeof DAYS)[number]>("7");
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/jobs/${job.id}/links`;

  useEffect(() => {
    let live = true;
    api<LinkRow[]>(base).then((r) => { if (live) setRows(r ?? []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [base]);

  const create = async () => {
    const ok = await ask("이 링크를 가진 사람은 로그인 없이 받을 수 있습니다.\n사업명이 들어간 장표라면 받을 사람을 한 번 더 확인해 주세요.", { title: "받기 링크를 만들까요?", ok: "만들기" });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api<Created>(base, { method: "POST", body: JSON.stringify({ kind, days: Number(days) }) });
      setMade(r.url);
      setRows(r.links);
      void copy(r.url);
    } catch { /* api.ts 가 토스트로 알린다 */ }
    finally { setBusy(false); }
  };

  const revoke = async (row: LinkRow) => {
    const ok = await ask(`${KIND_LABEL[row.kind]} 링크(…${row.tail})를 끊습니다.\n끊은 뒤에는 이 주소로 받을 수 없습니다.`, { title: "링크를 끊을까요?", ok: "끊기", danger: true });
    if (!ok) return;
    try {
      const r = await api<{ links: LinkRow[] }>(`${base}/${row.id}`, { method: "DELETE" });
      setRows(r.links);
      toast("링크를 끊었습니다.", "ok");
    } catch { /* api.ts 토스트 */ }
  };

  const kinds: LinkKind[] = hasFonts ? ["result", "export", "fonts"] : ["result", "export"];

  return (
    <div className="border border-line rounded-md p-4 flex flex-col gap-3">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-bold whitespace-nowrap flex-none">다운로드 링크</span>
        <span className="text-[13px] text-dim truncate">로그인 없이 받는 주소를 만들어 보냅니다</span>
      </div>
      {/* 한 줄 컨트롤 — 셀렉트·버튼 모두 38px(btn-next·btn-back 높이) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={kind} onValueChange={(v) => setKind(v as LinkKind)} disabled={busy}>
          <SelectTrigger className="!h-[38px] min-w-[210px] rounded-full" aria-label="링크 종류"><SelectValue /></SelectTrigger>
          <SelectContent>{kinds.map((k) => <SelectItem key={k} value={k}>{KIND_OPTION[k]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={days} onValueChange={(v) => setDays(v as (typeof DAYS)[number])} disabled={busy}>
          <SelectTrigger className="!h-[38px] min-w-[110px] rounded-full" aria-label="받을 수 있는 기간"><SelectValue /></SelectTrigger>
          <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d}일 동안</SelectItem>)}</SelectContent>
        </Select>
        <button className="btn-next" onClick={create} disabled={busy}><Ms name="link" size={17} />링크 만들기</button>
      </div>
      {made && (
        <div className="flex items-center gap-2 min-w-0">
          <input readOnly value={made} onFocus={(e) => e.currentTarget.select()} aria-label="만든 링크"
            className="flex-1 min-w-0 h-[38px] rounded-full border border-line bg-panel px-4 font-mono text-[13px] text-ink" />
          <button className="btn-back" onClick={() => void copy(made)}><Ms name="content_copy" size={17} />복사</button>
        </div>
      )}
      {made && <div className="text-[13px] text-dim">주소는 지금만 보입니다. 잃어버리면 새로 만들어 주세요.</div>}
      {rows && rows.length > 0 && (
        <Table className="text-[13.5px]">
          <TableHeader>
            <TableRow>
              <TableHead>종류</TableHead>
              <TableHead>기한</TableHead>
              <TableHead>받은 횟수</TableHead>
              <TableHead>끊기</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={r.state === "active" ? undefined : "text-faint"}>
                <TableCell className="text-center">{KIND_LABEL[r.kind]} <span className="font-mono text-[12px] text-dim">…{r.tail}</span></TableCell>
                <TableCell className="text-center">{r.state === "revoked" ? "끊김" : r.state === "expired" ? "만료" : `${short(r.expires_at)} 까지`}</TableCell>
                <TableCell className="text-right tabular-nums" title={r.last_download_at ? `마지막 ${short(r.last_download_at)}` : undefined}>{r.downloads.toLocaleString()}</TableCell>
                <TableCell className="text-center">
                  {r.state === "active"
                    ? <button className="btn-icon danger mx-auto" onClick={() => void revoke(r)} title="이 링크 끊기" aria-label={`${KIND_LABEL[r.kind]} 링크 끊기`}><Ms name="link_off" size={18} /></button>
                    : <span className="text-faint">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
