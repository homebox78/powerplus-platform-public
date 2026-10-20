// 관리자 · 자산 받은편지함 — 그림을 여러 장 올려 두면 서버(api/bin/asset-inbox.php, 10분마다)가 중복·AI 판정 뒤 powerAssets 로 등록한다.
// (사용자 2026-10-20 "내가 이미지를 올려두면 알아서 일정시간 서버가 확인 후 자동 등록" — 올리는 곳은 관리자 화면)
// 위: 올리기(묶음 이름·종류·파일 끌어 놓기, 몇 장씩 나눠 보내며 파일마다 진행) / 아래: 받은 그림 목록(상태로 거르기, 검토 필요 → 등록·빼기, 실패 → 다시 시도).
// API: api/routes/asset_inbox.php. 처리 규칙: api/src/Assets/Inbox.php.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, RotateCcw, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AdminTitle, Pager, useQueryState } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtAt, fmtBytes } from "@/lib/admin";
import { apiBase, apiList, ApiError, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/admin-asset-inbox";

export const meta: Route.MetaFunction = () => [{ title: "자산 받은편지함 — powerPlus 관리자" }];

type InboxStatus = "pending" | "processing" | "done" | "review" | "dup" | "failed" | "rejected";
type InboxKind = "auto" | "photo" | "illust" | "icon";
interface InboxItem {
  id: string; batch: string; set_name: string; set_code: string; kind: InboxKind; orig_name: string; bytes: number; w: number | null; h: number | null;
  status: InboxStatus; reason: string | null; ai_name: string | null; ai_ko: string[]; ai_en: string[]; ai_category: string | null; ai_has_text: boolean | null;
  item: { id: string; name: string | null; category: string; deleted: boolean } | null; tries: number; created_at: string; updated_at: string; thumb_url: string | null;
}

const STATUS_KO: Record<InboxStatus, string> = { pending: "대기", processing: "처리 중", done: "등록됨", review: "검토 필요", dup: "중복", failed: "실패", rejected: "뺌" };
const STATUS_TONE: Record<InboxStatus, "line" | "ink" | "ok" | "warn" | "soft" | "dash"> = { pending: "soft", processing: "line", done: "ok", review: "warn", dup: "line", failed: "dash", rejected: "soft" };
const KIND_KO: Record<InboxKind, string> = { auto: "자동", photo: "사진", illust: "일러스트", icon: "아이콘" };
const CAT_KO: Record<string, string> = { photo: "사진", illust: "일러스트", icon: "아이콘" };
const KINDS = (Object.keys(KIND_KO) as InboxKind[]).map((k) => ({ id: k, label: KIND_KO[k], hint: k === "auto" ? "AI 가 사진·일러스트·아이콘을 고른다" : undefined }));

/** 화면 한도 — 서버 한도(post_max_size 250M·upload_max_filesize 200M, 한 요청 50장)보다 작게 나눠 보낸다 */
const MAX_FILES = 200;
const MAX_BYTES = 50 * 1024 * 1024;
const CHUNK_FILES = 4;
const CHUNK_BYTES = 150 * 1024 * 1024;
const OK_TYPE = /^image\/(png|jpe?g|webp)$/;

type Queued = { key: string; file: File; state: "wait" | "send" | "ok" | "error"; pct: number; msg?: string };

/** 한 조각 보내기 — XHR 이라 보낸 바이트를 받아 파일마다 진행 막대를 채운다 */
function sendChunk(files: File[], set: string, kind: InboxKind, batch: string, onPct: (loaded: number) => void): Promise<{ batch: string; items: InboxItem[]; errors: Array<{ name: string; message: string }> }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("set", set);
    fd.append("kind", kind);
    if (batch) fd.append("batch", batch);
    for (const f of files) fd.append("files[]", f, f.name);
    const x = new XMLHttpRequest();
    x.open("POST", `${apiBase}/admin/assets/inbox`);
    x.withCredentials = true;
    x.setRequestHeader("X-Requested-With", "powerplus");
    x.setRequestHeader("Accept", "application/json");
    x.upload.onprogress = (e) => onPct(e.loaded);
    x.onload = () => {
      let body: { data?: { batch: string; items: InboxItem[]; errors: Array<{ name: string; message: string }> }; error?: string; code?: string; hint?: string } | null = null;
      try { body = JSON.parse(x.responseText); } catch { body = null; }
      // 400 이어도 data.errors 가 있으면 파일별 사유를 보인다(전부 틀린 조각)
      if (body?.data) resolve(body.data);
      else reject(new ApiError(x.status, body?.code ?? "HTTP_ERROR", body?.error ?? `HTTP ${x.status}`, body?.hint));
    };
    x.onerror = () => reject(new ApiError(0, "NETWORK", "서버에 보내지 못했습니다."));
    x.send(fd);
  });
}

export default function AdminAssetInbox() {
  const { get, set, page } = useQueryState();
  const status = get("status");
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "asset-inbox", status, page],
    queryFn: () => apiList<InboxItem>(`/admin/assets/inbox?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page) })}`),
    // 처리를 기다리는 그림이 있으면 30초마다 다시 본다(서버 처리는 10분 간격)
    refetchInterval: (q) => ((q.state.data?.data ?? []).some((x) => x.status === "pending" || x.status === "processing") ? 30_000 : false),
  });
  const counts = (list.data?.meta?.counts ?? {}) as Partial<Record<InboxStatus, number>>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "asset-inbox"] });

  const act = useMutation({
    mutationFn: ({ id, what }: { id: string; what: "approve" | "reject" | "retry" }) => postJson<InboxItem>(`/admin/assets/inbox/${id}/${what}`, {}),
    onSuccess: (_r, v) => { toast.success(v.what === "approve" ? "에셋으로 등록했습니다." : v.what === "reject" ? "뺐습니다. 받은 파일도 지웠습니다." : "대기로 돌렸습니다. 다음 확인 때 다시 봅니다."); refresh(); qc.invalidateQueries({ queryKey: ["admin", "assets"] }); },
    onError: (e) => toastError(e),
  });

  const statusOptions = (Object.keys(STATUS_KO) as InboxStatus[]).map((s) => ({ id: s, label: STATUS_KO[s], count: counts[s] ?? 0 }));
  const rows = list.data?.data ?? [];

  return (
    <div>
      <AdminTitle title="자산 받은편지함" desc="그림을 올려 두면 서버가 10분마다 확인해 powerAssets 에 등록합니다. 글자가 박혔거나 AI 가 판단하지 못한 그림만 여기서 직접 고릅니다." />
      <UploadCard onDone={refresh} />

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={status} onChange={(v) => set({ status: v })} options={statusOptions} allLabel="전체(뺀 것 제외)" />
        <span className="ml-auto text-sm text-ink-4 tabular-nums">
          {list.data ? `${(list.data.total ?? 0).toLocaleString()}장` : ""}
          {(counts.review ?? 0) > 0 && status !== "review" && <> · <button type="button" className="font-semibold text-warn underline-offset-4 hover:underline" onClick={() => set({ status: "review" })}>검토 필요 {counts.review}장</button></>}
        </span>
      </div>

      <Card className="mt-3">
        <CardContent className="px-0">
          {/* 칸 폭(R08): 미리보기 88 · 종류 88 · 상태 108 · 올린 때 128 · 작업 168 — 나머지(이름·묶음·사유)는 남는 폭을 나눈다. 관리자 PC 화면 전용 */}
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[88px]">미리보기</TableHead>
                <TableHead>이름</TableHead>
                <TableHead className="w-[18%]">묶음</TableHead>
                <TableHead className="w-[88px]">종류</TableHead>
                <TableHead className="w-[108px]">상태</TableHead>
                <TableHead className="w-[26%]">사유 · 낱말</TableHead>
                <TableHead className="w-[128px]">올린 때</TableHead>
                <TableHead className="w-[168px]">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="text-center">
                    <span className="mx-auto flex size-16 items-center justify-center overflow-hidden rounded-thumb border border-line bg-ground-3">
                      {x.thumb_url ? <img src={x.thumb_url} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="size-5 text-ink-4" aria-hidden />}
                    </span>
                  </TableCell>
                  <TableCell className="text-left">
                    <span className="block truncate font-semibold">{x.ai_name || x.item?.name || x.orig_name}</span>
                    <span className="block truncate text-xs text-ink-4">{x.orig_name} · {fmtBytes(x.bytes)}{x.w ? ` · ${x.w}×${x.h}` : ""}</span>
                  </TableCell>
                  <TableCell className="text-left"><span className="block truncate">{x.set_name}</span></TableCell>
                  <TableCell className="text-center">{x.kind === "auto" ? (x.ai_category ? `${CAT_KO[x.ai_category] ?? x.ai_category}` : "자동") : KIND_KO[x.kind]}</TableCell>
                  <TableCell className="text-center"><Tag tone={STATUS_TONE[x.status]}>{STATUS_KO[x.status]}</Tag></TableCell>
                  <TableCell className="text-left">
                    {x.reason && <Copy as="span" className="block text-sm text-ink-2" text={x.reason} />}
                    {x.ai_ko.length > 0 && <span className="block truncate text-xs text-ink-4" title={x.ai_ko.join(", ")}>{x.ai_ko.slice(0, 6).join(" · ")}</span>}
                    {!x.reason && x.ai_ko.length === 0 && <span className="text-ink-4">—</span>}
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-ink-3">{fmtAt(x.created_at)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {x.status === "review" && <Button size="xs" disabled={act.isPending} onClick={() => act.mutate({ id: x.id, what: "approve" })}>등록</Button>}
                      {(x.status === "failed" || (x.status === "review" && x.reason?.includes("AI 판정 못 함"))) && (
                        <Button size="xs" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: x.id, what: "retry" })}><RotateCcw aria-hidden />다시 시도</Button>
                      )}
                      {(x.status === "review" || x.status === "failed" || x.status === "pending" || x.status === "dup") && (
                        <Button size="xs" variant="ghost" disabled={act.isPending} onClick={() => confirmToast("이 그림을 뺄까요?", () => act.mutate({ id: x.id, what: "reject" }), { action: "빼기", description: "받은 파일도 지웁니다. 되돌릴 수 없습니다." })}>빼기</Button>
                      )}
                      {x.status === "done" && x.item && <Link to={`/admin/assets?q=${x.item.id}`} className="text-sm font-semibold underline-offset-4 hover:underline">에셋 보기</Link>}
                      {x.status === "processing" && <span className="text-sm text-ink-4">처리 중</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {list.data && rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-ink-4">{status ? `${STATUS_KO[status as InboxStatus] ?? status} 그림이 없습니다.` : "받은 그림이 없습니다. 위에서 올려 주세요."}</TableCell></TableRow>}
              {!list.data && <TableRow><TableCell colSpan={8} className="py-10 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {list.data && <Pager page={page} total={list.data.total ?? 0} limit={list.data.limit ?? 60} onPage={(p) => set({ page: String(p) })} />}
      <Copy className="mt-4 text-sm text-ink-4" text="자동 등록 조건은 같은 파일이 없고 글자·결함이 없으며 AI 판정이 된 그림입니다. 등록본은 공개 범위가 공개이고 가로 2500px 이하로 줄입니다." />
    </div>
  );
}

function UploadCard({ onDone }: { onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<InboxKind>("auto");
  const [picks, setPicks] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (list: FileList | File[]) => {
    const next: Queued[] = [];
    let skipped = 0;
    for (const f of Array.from(list)) {
      if (!OK_TYPE.test(f.type) || f.size > MAX_BYTES) { skipped++; continue; }
      next.push({ key: `${f.name}-${f.size}-${f.lastModified}`, file: f, state: "wait", pct: 0 });
    }
    setPicks((cur) => {
      const seen = new Set(cur.map((p) => p.key));
      const merged = [...cur.filter((p) => p.state !== "ok"), ...next.filter((p) => !seen.has(p.key))];
      if (merged.length > MAX_FILES) toast.error(`한 번에 ${MAX_FILES}장까지 올릴 수 있습니다. 앞의 ${MAX_FILES}장만 남겼습니다.`);
      return merged.slice(0, MAX_FILES);
    });
    if (skipped > 0) toast.error(`${skipped}장은 뺐습니다. PNG·JPG·WEBP, 한 장 50MB 이하만 됩니다.`);
  };

  const upload = async () => {
    if (!label.trim()) { toast.error("묶음 이름을 먼저 적어 주세요."); return; }
    const todo = picks.filter((p) => p.state === "wait" || p.state === "error");
    if (todo.length === 0) return;
    setBusy(true);
    // 조각 나누기 — 4장 또는 150MB 를 넘기 전에 끊는다
    const chunks: Queued[][] = [];
    let cur: Queued[] = [];
    let bytes = 0;
    for (const p of todo) {
      if (cur.length > 0 && (cur.length >= CHUNK_FILES || bytes + p.file.size > CHUNK_BYTES)) { chunks.push(cur); cur = []; bytes = 0; }
      cur.push(p); bytes += p.file.size;
    }
    if (cur.length) chunks.push(cur);
    const patch = (keys: string[], fn: (p: Queued) => Queued) => setPicks((all) => all.map((p) => (keys.includes(p.key) ? fn(p) : p)));
    let batch = "";
    let ok = 0;
    let bad = 0;
    for (const ch of chunks) {
      const keys = ch.map((p) => p.key);
      patch(keys, (p) => ({ ...p, state: "send", pct: 0, msg: undefined }));
      // 보낸 바이트를 파일 순서대로 나눠 막대를 채운다
      const sizes = ch.map((p) => p.file.size);
      try {
        const r = await sendChunk(ch.map((p) => p.file), label.trim(), kind, batch, (loaded) => {
          let left = loaded;
          const pct = sizes.map((s) => { const v = Math.max(0, Math.min(s, left)); left -= v; return s ? Math.round((v / s) * 100) : 100; });
          setPicks((all) => all.map((p) => { const i = keys.indexOf(p.key); return i >= 0 && p.state === "send" ? { ...p, pct: pct[i] ?? 0 } : p; }));
        });
        batch = r.batch;
        const errs = new Map(r.errors.map((e) => [e.name, e.message]));
        setPicks((all) => all.map((p) => (keys.includes(p.key) ? (errs.has(p.file.name) ? { ...p, state: "error", pct: 0, msg: errs.get(p.file.name) } : { ...p, state: "ok", pct: 100 }) : p)));
        ok += ch.length - r.errors.length;
        bad += r.errors.length;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "보내지 못했습니다.";
        patch(keys, (p) => ({ ...p, state: "error", pct: 0, msg }));
        bad += ch.length;
      }
    }
    setBusy(false);
    onDone();
    if (ok > 0) toast.success(`${ok}장을 받았습니다. 서버가 10분 안에 확인해 등록합니다.${bad ? ` 실패 ${bad}장은 사유를 보고 다시 올려 주세요.` : ""}`);
    else if (bad > 0) toast.error(`${bad}장을 올리지 못했습니다. 파일마다 사유를 확인해 주세요.`);
  };

  const waiting = picks.filter((p) => p.state === "wait" || p.state === "error").length;
  const total = picks.reduce((s, p) => s + p.file.size, 0);

  return (
    <Card className="mt-7">
      <CardHeader>
        <CardTitle>올리기</CardTitle>
        <CardDescription>묶음 이름은 에셋 세트가 됩니다. 같은 이름으로 다시 올리면 그 세트에 이어 붙습니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-[240px] flex-1 gap-1.5 sm:max-w-[360px]">
            <Label htmlFor="inbox-set">묶음(세트) 이름</Label>
            <Input id="inbox-set" className="h-9 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="예: 의약품 심사 3D 장면" disabled={busy} />
          </div>
          <ChoiceButton size="sm" label="종류" value={kind} onChange={(v) => setKind((v || "auto") as InboxKind)} options={KINDS} showAll={false} description="자동이면 AI 가 그림을 보고 고릅니다." />
          <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy}><ImagePlus aria-hidden />파일 고르기</Button>
          <Button size="sm" onClick={upload} disabled={busy || waiting === 0 || !label.trim()}><Upload aria-hidden />{busy ? "올리는 중" : `올리기${waiting ? ` (${waiting}장)` : ""}`}</Button>
          <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
        </div>

        <div
          role="button" tabIndex={0}
          onClick={() => !busy && input.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy && e.dataTransfer.files.length) add(e.dataTransfer.files); }}
          className={cn("mt-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-3 bg-ground-2 px-4 py-6 text-center transition-colors", over && "border-ink bg-ground-3")}
        >
          <Upload className="size-6 text-ink-3" aria-hidden />
          <span className="text-md font-semibold">여기에 그림을 끌어 놓으세요</span>
          <span className="text-sm text-ink-4">PNG·JPG·WEBP, 한 장 50MB 이하, 한 번에 {MAX_FILES}장까지</span>
        </div>

        {picks.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-sm text-ink-3">
              <span className="tabular-nums">{picks.length}장 · {fmtBytes(total)}</span>
              {!busy && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setPicks([])}><X aria-hidden />목록 비우기</Button>}
            </div>
            <ul className="mt-2 grid max-h-[320px] gap-1 overflow-y-auto">
              {picks.map((p) => (
                <li key={p.key} className="grid grid-cols-[minmax(0,1fr)_72px_160px_32px] items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-ground-2">
                  <span className="min-w-0">
                    <span className="block truncate">{p.file.name}</span>
                    {p.msg && <span className="block truncate text-xs text-warn">{p.msg}</span>}
                  </span>
                  <span className="text-right text-xs tabular-nums text-ink-4">{fmtBytes(p.file.size)}</span>
                  <span className="flex items-center gap-2">
                    {p.state === "send" ? <Progress value={p.pct} className="h-1.5" aria-label={`${p.file.name} 올리는 중`} />
                      : <Tag tone={p.state === "ok" ? "ok" : p.state === "error" ? "dash" : "soft"} className="mx-auto">{p.state === "ok" ? "받음" : p.state === "error" ? "실패" : "대기"}</Tag>}
                  </span>
                  {!busy && p.state !== "ok"
                    ? <button type="button" className="inline-flex size-8 items-center justify-center rounded-full text-ink-4 hover:bg-ground-3 hover:text-ink" aria-label={`${p.file.name} 빼기`} onClick={() => setPicks((all) => all.filter((x) => x.key !== p.key))}><X className="size-4" /></button>
                    : <span />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

