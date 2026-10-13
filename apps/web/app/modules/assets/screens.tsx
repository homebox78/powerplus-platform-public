// powerAssets 작업 단위 화면 — 둘러보기(검색·세트·최신, 옛 최근 업데이트 합침)·자료 요청 + 에셋 상세 창.
// 디자인 = 기존 홈박스(hom2box.com/homebox) 기관 탐색 화면과 같은 값으로(사용자 지시 2026-10-06 "사이즈 색상 크기 모달 버튼 탭 라인"):
//   선택 = ChoiceButton(알약 44px·굵게·다크 모달 #2A2A2C) · 건수 줄 13px ink-4 · 그리드 gap 32/48 · 카드 = ThumbFrame(20px·ground-3·9% 안쪽 여백) 위 흰 판(10px·그림자)
//   카드 발 = 이름 15px 굵게 + 메타 13px ink-4 + 오른쪽 13px 600 ink-3. 호버 = 흰 알약 버튼 2개.
// 목록은 Access 가 거른 것만 오므로 잠금 표시는 meta.hidden 으로 안내한다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { Download, Lock, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { StepCards } from "@/components/hb/step-cards";
import { SaveButton } from "@/components/hb/save-button";
import { SavedBadge } from "@/components/hb/saved-badge";
import { SearchInput } from "@/components/hb/search-input";
import { Tag } from "@/components/hb/tag";
import { ThumbFrame } from "@/components/hb/thumb-frame";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, postJson } from "@/lib/api";
import { CATEGORY_KO, REQUEST_STATUS_KO, SORT_KO, setLabel, assetCategoriesQuery, assetDetailQuery, assetListQuery, assetRequestsQuery, assetSetsQuery, type AssetCategory, type AssetItem, type AssetListParams, type AssetRequest } from "@/lib/assets";
import { useMe } from "@/lib/auth";
import { useIsSaved } from "@/lib/saved";
import { cn } from "@/lib/utils";

const fmtDate = (s: string) => s.slice(0, 10).replace(/-/g, ".");
const GRID = "grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8";
const GRID_DENSE = "grid grid-cols-3 gap-x-4 gap-y-6 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8";

// 비회원은 내려받기 대신 로그인으로 — 돌아올 곳은 지금 화면(서버도 비회원에겐 워터마크 미리보기만 준다)
function loginNext() {
  const here = typeof window === "undefined" ? "/assets" : window.location.pathname + window.location.search;
  return `/login?next=${encodeURIComponent(here)}`;
}

function AssetCard({ a, onOpen }: { a: AssetItem; onOpen: (id: string) => void; dense?: boolean }) {
  const photo = a.category === "photo" || a.category === "ppt" || a.category === "diagram";
  const title = a.name ?? a.alt ?? `${a.category_ko} ${a.id.slice(0, 6)}`;
  const saved = useIsSaved("asset", a.id);
  const { me } = useMe();
  return (
    // 행 전체가 <button> 이면 안의 호버 버튼을 못 넣는다(중첩 button) — div role=button + 안쪽 stopPropagation (DeckGen·dsai 교훈)
    <div role="button" tabIndex={0} onClick={() => onOpen(a.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(a.id); } }} className="group flex min-w-0 cursor-pointer flex-col gap-2 text-center" aria-label={`${title} 상세`}>
      {/* 저장 표시는 ThumbFrame(overflow-hidden) 바깥 모서리에 — 안에 두면 잘린다 */}
      <div className="relative">
        <ThumbFrame
          radius="lg"
          ratio="auto"
          className="bg-ground-3 p-[4.5%]"
          hover={<><Button variant="white" size="icon-sm" type="button" asChild onClick={(e) => e.stopPropagation()}>{me ? <a href={a.thumb_url.replace(/\/thumb$/, "/original")} download aria-label="내려받기" title="내려받기"><Download aria-hidden /></a> : <Link to={loginNext()} aria-label="로그인 후 내려받기" title="로그인 후 내려받기"><Lock aria-hidden /></Link>}</Button><SaveButton type="asset" id={a.id} size="icon-sm" iconOnly /></>}
        >
          <span className={cn("relative flex w-full items-center justify-center overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] aspect-square")}>
            <img src={a.thumb_url} alt="" loading="lazy" className={cn("size-full", photo ? "object-contain" : "object-contain p-[12%]")} />
          </span>
        </ThumbFrame>
        {saved && <SavedBadge />}
      </div>
      {/* 목록은 그림만 — 이름은 눌러서 여는 상세 창에서(사용자 2026-10-11 "카드 높이 동일, 목록 텍스트 불필요") */}
    </div>
  );
}

function HiddenNote({ hidden, plan }: { hidden: number; plan?: string }) {
  if (!hidden) return null;
  return (
    <div className="mb-6 flex items-center gap-3 rounded-card border border-line bg-ground-2 px-5 py-4 text-md">
      <Lock className="size-4 shrink-0 text-ink-4" aria-hidden />
      <Copy as="span" text={plan === "free" || !plan ? `${hidden.toLocaleString()}개가 더 있습니다. 로그인하거나 플랜을 올리면 열립니다.` : `${hidden.toLocaleString()}개는 현재 플랜 밖입니다.`} />
      <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/account/plan">플랜 보기</Link></Button>
    </div>
  );
}

/** "아이콘으로 / 코드로" — 받침이 있으면 '으로', 없거나(ㄹ 받침 포함) 한글이 아니면 '로'. 출처: powerPlus 애드인 roSuffix(2026-08-13) */
function roSuffix(w: string) {
  const code = w.codePointAt(w.length - 1) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return "로";
  const jong = (code - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}

/** 오타 교정 안내 — 서버 meta.corrected = { 원본: 교정 }. 출처: powerPlus 애드인 "'코드'로 고쳐서 찾았어요 · N개" */
function CorrectedNote({ corrected, total }: { corrected: unknown; total: number }) {
  if (!corrected || typeof corrected !== "object") return null;
  const fixed = Object.values(corrected as Record<string, string>).filter((v) => typeof v === "string");
  if (fixed.length === 0) return null;
  const words = fixed.map((w) => `‘${w}’`).join(" ");
  return <p className="mb-4 rounded-card border border-line bg-ground-2 px-5 py-3 text-md" role="status">{words}{roSuffix(fixed[fixed.length - 1]!)} 고쳐서 찾았어요 · {total.toLocaleString()}개</p>;
}

function AssetGrid({ params, emptyText, requestCta }: { params: AssetListParams; emptyText: string; /** 무결과 화면 "자료 요청하기" — 요청 제목에 채울 검색어 */ requestCta?: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery(assetListQuery({ ...params, page, limit: 40 }));
  // 저장 목록 등에서 ?item=<public_id> 로 들어오면 그 에셋 상세를 바로 연다
  const [sp] = useSearchParams();
  const [open, setOpen] = useState<string | null>(() => sp.get("item"));
  const dense = params.category === "icon" || params.category === "illust" || params.category === "logo";
  if (q.isPending) return <div className={cn("mt-10", dense ? GRID_DENSE : GRID)}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className={cn("rounded-panel", dense ? "aspect-square" : "aspect-[16/10]")} />)}</div>;
  if (q.isError) return <p className="py-16 text-center text-ink-4">목록을 불러오지 못했습니다.</p>;
  const { data, total = 0, limit = 40, meta } = q.data;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="mt-10">
      <HiddenNote hidden={Number(meta?.hidden ?? 0)} plan={String(meta?.plan ?? "")} />
      <CorrectedNote corrected={meta?.corrected} total={total} />
      {data.length > 0 && !meta?.corrected && <div className="mb-4 text-sm text-ink-4">{total.toLocaleString()}개 에셋</div>}
      {data.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-ink-4">
          <img src="/img/empty-search-v2.webp" alt="" aria-hidden className="size-40 rounded-panel object-cover" />
          <Copy as="span" text={emptyText} />
          {requestCta !== undefined && <Button asChild size="md" variant="outline"><Link to={`/assets/requests?title=${encodeURIComponent(requestCta)}`}><Plus aria-hidden />자료 요청하기</Link></Button>}
        </div>
      ) : (
        <div className={dense ? GRID_DENSE : GRID}>{data.map((a) => <AssetCard key={a.id} a={a} onOpen={setOpen} dense={dense} />)}</div>
      )}
      {pages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2" aria-label="페이지">
          <Button variant="outline" size="md" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</Button>
          <span className="px-3 text-sm text-ink-4">{page} / {pages}</span>
          <Button variant="outline" size="md" disabled={page >= pages} onClick={() => setPage(page + 1)}>다음</Button>
        </nav>
      )}
      <AssetDialog id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function AssetDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery(assetDetailQuery(id));
  const use = useMutation({ mutationFn: () => postJson<null>(`/assets/items/${id}/use`, { channel: "web" }) });
  const { me } = useMe();
  const a = q.data;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-panel p-8 sm:max-w-none" style={{ width: "min(960px, 96vw)" }}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold tracking-[-0.02em]">{a?.name ?? a?.alt ?? "에셋"}</DialogTitle>
          <DialogDescription className="text-md text-ink-3">{a ? `${a.category_ko}${a.w && a.h ? ` · ${a.w}×${a.h}` : ""} · 등록 ${fmtDate(a.created_at)}` : "불러오는 중"}</DialogDescription>
        </DialogHeader>
        {a && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_300px]">
            <div className="flex min-h-[320px] items-center justify-center rounded-panel bg-ground-3 p-[6%]"><span className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"><img src={a.original_url} alt={a.alt ?? ""} className="max-h-[60vh] max-w-full object-contain" /></span></div>
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {a.set && <Tag tone="ink">세트 · {setLabel(a.set.name)}</Tag>}
                {a.ai_generated && <Tag>AI 생성</Tag>}
                {a.slide_kind && <Tag>{a.slide_kind === "package" ? "패키지" : `낱장 · ${a.slide_page ?? ""}`}</Tag>}
                <Tag tone="soft">삽입 {a.uses.toLocaleString()}회</Tag>
              </div>
              {a.tags.ko.length > 0 && <div><div className="mb-1.5 font-semibold text-ink-3">키워드</div><p className="leading-[1.8] text-ink-3">{a.tags.ko.slice(0, 20).join(" · ")}</p></div>}
              <div className="mt-auto flex flex-col gap-2">
                {!me && <Button asChild size="md"><Link to={loginNext()} onClick={onClose}><Lock aria-hidden />로그인 후 내려받기</Link></Button>}
                {!me && <p className="text-xs leading-[1.6] text-ink-4">비회원은 워터마크가 들어간 미리보기만 볼 수 있습니다.</p>}
                {me && <Button asChild size="md" onClick={() => use.mutate()}><a href={a.original_url} download><Download aria-hidden />원본 내려받기</a></Button>}
                {me && a.slide_url && <Button asChild size="md" variant="outline" onClick={() => use.mutate()}><a href={a.slide_url} download>pptx 내려받기</a></Button>}
                {a.set && <Button asChild size="md" variant="outline"><Link to={`/assets/browse?set=${a.set.id}`} onClick={onClose}>같은 스타일 세트 보기</Link></Button>}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useCategoryOptions() {
  const cats = useQuery(assetCategoriesQuery);
  return (cats.data ?? []).map((c) => ({ id: c.id, label: c.label, count: c.count }));
}
const SORT_OPTIONS = (Object.entries(SORT_KO) as Array<[keyof typeof SORT_KO, string]>).filter(([v]) => v !== "newest").map(([id, label]) => ({ id, label }));

// ---- 화면

export function AssetsBrowse() {
  // 둘러보기 = 검색 + 종류·정렬 + 같은 스타일 세트 + 최신 에셋(옛 '최근 업데이트'를 합침, 사용자 2026-10-12)
  const [sp, setSp] = useSearchParams();
  const catOptions = useCategoryOptions();
  const q = sp.get("q") ?? "";
  // 주소로 들어온 종류가 목록에 없으면(권한 밖 장표·목업 샘플·오타) 전체로 — 라벨이 깨지지 않게(2026-10-09)
  const rawCat = sp.get("category") ?? "";
  const cat = (rawCat && catOptions.length > 0 && !catOptions.some((o) => o.id === rawCat) ? "" : rawCat) as AssetCategory | "";
  const set = sp.get("set") ?? "";
  const rawSort = sp.get("sort") ?? "newest";
  const sort = (rawSort in SORT_KO ? rawSort : "newest") as keyof typeof SORT_KO;
  const sets = useQuery({ ...assetSetsQuery(set || q ? undefined : cat || undefined), enabled: !q });
  const put = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k === "category" || k === "set" || k === "q") n.delete("all"); if (k === "category" || k === "q") n.delete("set"); setSp(n, { replace: true }); };
  const curSet = sets.data?.find((s) => s.id === set);
  // 세트 아래에 최신 에셋 전체 목록을 항상 보여 준다(사용자 2026-10-12 — 예전엔 "전체 보기"를 눌러야 나왔다)
  const hasSets = (sets.data?.length ?? 0) > 0;
  return (
    <>
      <form className="mt-8 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" role="search" onSubmit={(e) => { e.preventDefault(); put("q", String(new FormData(e.currentTarget).get("q") ?? "").trim()); }}>
        <SearchInput key={q} name="q" defaultValue={q} kbd={false} placeholder="에셋 검색 — 예: 파랑 행정, 악수, 표지" className="min-w-0 sm:min-w-[280px] sm:flex-1" />
        <ChoiceButton label="종류" value={cat} onChange={(v) => put("category", v)} options={catOptions} />
        {!q && <ChoiceButton label="정렬" allLabel="최신순" value={sort === "newest" ? "" : sort} onChange={(v) => put("sort", v)} options={SORT_OPTIONS} />}
        <Button type="submit" size="md">검색</Button>
        {q && <Button type="button" variant="ghost" size="md" onClick={() => put("q", "")}><RotateCcw aria-hidden />검색 해제</Button>}
        {!q && curSet && <Button type="button" variant="ghost" size="md" onClick={() => put("set", "")}><RotateCcw aria-hidden />세트 해제 · {setLabel(curSet.name)}</Button>}
      </form>
      {q ? (
        <AssetGrid params={{ q, category: cat || undefined }} emptyText={`“${q}” 에 맞는 에셋이 없습니다. 자료 요청으로 알려 주시면 등록 후 알려 드립니다.`} requestCta={q} />
      ) : (
        <>
          {!set && hasSets && (
            <section className="mt-7" aria-label="같은 스타일 세트">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-sm text-ink-4">같은 스타일 세트 {sets.data!.length}개 · 세트를 누르면 그 세트만 보입니다</span>
              </div>
              <div className="grid grid-cols-4 gap-x-3 gap-y-4 md:grid-cols-6 lg:grid-cols-12">
                {sets.data!.map((s) => (
                  <button key={s.id} type="button" onClick={() => put("set", s.id)} className="group flex min-w-0 flex-col gap-2 text-center" aria-label={`${setLabel(s.name)} 세트`}>
                    <span className="relative block"><ThumbFrame radius="lg" ratio="auto" className="bg-ground-3 p-[4.5%]"><span className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{s.cover_url && <img src={s.cover_url} alt="" loading="lazy" className="size-full object-contain p-[12%]" />}</span></ThumbFrame>{(s.recent ?? 0) > 0 && <span className="absolute right-1 top-1 rounded-full bg-point px-1.5 py-0.5 text-xs font-bold leading-none text-white">새 {s.recent!.toLocaleString()}</span>}</span>
                    <span className="flex min-w-0 flex-col items-center"><span className="w-full line-clamp-2 text-xs font-bold tracking-[-0.01em]" title={setLabel(s.name)}>{setLabel(s.name)}</span><span className="text-xs text-ink-4">{s.count.toLocaleString()}개</span></span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <AssetGrid params={set ? { set, sort } : { category: cat || undefined, sort }} emptyText="이 조건에 보이는 에셋이 없습니다." />
        </>
      )}
    </>
  );
}

export function AssetsRequests() {
  const { me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({ ...assetRequestsQuery, enabled: !!me });
  // 무결과 검색 화면 "자료 요청하기"에서 넘어오면 검색어를 제목에 미리 채운다
  const [sp] = useSearchParams();
  const [title, setTitle] = useState(() => sp.get("title") ?? "");
  const [kind, setKind] = useState("");
  const [detail, setDetail] = useState("");
  const create = useMutation({
    mutationFn: () => postJson<AssetRequest>("/assets/requests", { title, kind, detail }),
    onSuccess: () => { setTitle(""); setDetail(""); toast.success("요청을 접수했습니다."); void qc.invalidateQueries({ queryKey: ["assets", "requests"] }); },
    onError: (e) => toastError(e),
  });
  const kindOptions = (Object.entries(CATEGORY_KO) as Array<[AssetCategory, string]>).filter(([k]) => k !== "mockup_sample").map(([id, label]) => ({ id, label }));
  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[400px_1fr]">
      <form className="flex flex-col gap-5 rounded-panel border border-line bg-ground p-6" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div className="flex flex-col gap-1.5"><Label htmlFor="req-title">무엇이 필요한가요</Label><Input id="req-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 클라우드 보안 3D 아이콘, 데이터센터 사진" required minLength={2} maxLength={200} className="h-11" /></div>
        <div className="flex flex-col gap-1.5"><Label>종류</Label><ChoiceButton label="종류" allLabel="아무거나" value={kind} onChange={setKind} options={kindOptions} className="w-fit" /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="req-detail">설명(선택)</Label><Textarea id="req-detail" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="어떤 장표에 쓰려는지, 색·스타일이 있으면 적어 주세요." rows={4} maxLength={2000} /></div>
        <Button type="submit" size="md" disabled={create.isPending || title.trim().length < 2}><Plus aria-hidden />요청 보내기</Button>
      </form>
      <section aria-label="내 요청">
        <div className="mb-4 text-sm text-ink-4">내 요청 {q.data?.length ?? 0}건</div>
        {q.isPending ? <Skeleton className="h-40 rounded-card" /> : (q.data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-ink-4">아직 보낸 요청이 없습니다.</div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>요청</TableHead><TableHead className="w-28">종류</TableHead><TableHead className="w-24">상태</TableHead><TableHead className="w-28">일시</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data!.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-left">{r.title}</TableCell>
                  <TableCell className="text-center">{r.kind ? CATEGORY_KO[r.kind as AssetCategory] : "—"}</TableCell>
                  <TableCell className="text-center"><Tag tone={r.status === "done" ? "ok" : r.status === "rejected" ? "warn" : "line"}>{REQUEST_STATUS_KO[r.status]}</Tag></TableCell>
                  <TableCell className="text-center">{fmtDate(r.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

/** 애드인 설치 파일 정보 — GET /assets/setup. 파일 본체는 /assets/setup/download 가 302 로 보낸다. */
export interface SetupInfo { url: string; version: string; size: number; published: string; requires: string[]; unsupported: string; assets_setup_visible?: boolean }
const setupQuery = (uid: string) => ({ queryKey: ["assets", "setup", uid], queryFn: () => apiFetch<SetupInfo>("/assets/setup"), staleTime: 3_600_000 });
const fmtMB = (n: number) => `${(n / 1048576).toFixed(0)}MB`;

const INSTALL_STEPS: { img: string; title: string; body: string }[] = [
  { img: "inst-v2-1-start", title: "설치 파일을 받아 실행합니다.", body: "관리자 권한이 필요 없습니다. V3 백신이 막으면 예외로 두고 다시 실행합니다." },
  { img: "inst-v2-2-license", title: "사용권에 동의하고 다음을 누릅니다.", body: "Office 버전은 자동으로 확인합니다. 2016 이하면 작업창이 열리지 않는다는 안내가 뜹니다." },
  { img: "inst-v2-3-options", title: "설치 위치를 확인합니다.", body: "그대로 두면 됩니다. 관리자 권한 없이 내 사용자 폴더에 설치합니다." },
  { img: "inst-v2-4-progress", title: "설치가 1분 안에 끝납니다.", body: "애드인 본체는 서버에서 불러오므로 이후 업데이트는 재설치 없이 반영됩니다." },
  { img: "inst-v2-5-done", title: "PowerPoint 에서 작업창을 엽니다.", body: "삽입 › 추가 기능 › 개발자 추가 기능 › powerAssets 를 누르면 오른쪽에 작업창이 열립니다." },
];
const USE_STEPS: { img: string; title: string; body: string }[] = [
  { img: "addin-v3-login", title: "powerPlus 계정으로 로그인합니다.", body: "사이트와 같은 계정입니다. 이메일을 적고 받은 6자리 코드를 넣습니다. 메일이 안 보이면 스팸함을 봅니다." },
  { img: "addin-v3-main", title: "카드를 누르면 슬라이드에 들어갑니다.", body: "전체·즐겨찾기·최근 탭으로 나뉩니다. 이 슬라이드에 맞는 자료 찾기를 누르면 지금 슬라이드 글로 골라 줍니다." },
  { img: "addin-v3-kind", title: "종류·정렬은 버튼 하나로 고릅니다.", body: "아이콘·사진·일러스트·다이어그램·로고·장표 중에서 고릅니다. 종류마다 등록된 개수가 함께 보입니다." },
  { img: "addin-v3-search", title: "검색은 동의어와 오타를 알아듣습니다.", body: "‘DB’·‘디비’·‘데이터베이스’가 같은 결과로 모입니다. 뒤로가기를 누르면 전체 목록으로 돌아갑니다." },
  { img: "addin-v3-help", title: "막히면 AI 도움말에 물어봅니다.", body: "상단 로봇 버튼을 누르고 질문을 적습니다. 맞는 도움말 문서를 찾아 보여 드립니다." },
  { img: "addin-v3-request", title: "없는 자료는 요청합니다.", body: "내 계정 메뉴의 콘텐츠 요청에서 보냅니다. 등록되면 알림으로 알려 드립니다." },
];

/** 애드인 AI(빠른 판단) 장면 — 설치 안내와 달리 늘 보인다(2026-10-07). 캡처는 애드인 하네스, 서버는 addin/route·addin/suggest */
const AI_STEPS = [
  { img: "ai-v1-slide", title: "슬라이드에 맞는 자료를 골라 줍니다.", body: "슬라이드를 고르고 ‘이 슬라이드에 맞는 자료 찾기’를 누릅니다. 제목·본문을 읽고 자료 종류와 검색 낱말을 정해 바로 찾습니다." },
  { img: "ai-v1-photo", title: "검색어로 자료 종류를 먼저 고릅니다.", body: "‘회의하는 사람들’처럼 적으면 사진에서 찾습니다. 다른 종류도 보고 싶으면 ‘전체에서 보기’를 누릅니다." },
  { img: "ai-v1-ppt", title: "장표도 같은 방식으로 찾습니다.", body: "‘표지’·‘목차’처럼 적으면 장표 템플릿에서 찾습니다. 고른 장표는 클릭 한 번으로 슬라이드에 들어갑니다." },
];

/** 랜딩(시작하기) — 설치 파일 받기·설치 5단계·로그인과 사용(사용자 2026-10-06). 2026-10-07: 이 셋은 설정 features.assets_setup_visible 뒤로 가렸고(superadmin 은 봄),
 *  자주 묻는 질문은 도움말 문서(assets 카테고리, 마이그레이션 0014)로 옮겼다. 숫자 한 줄은 맨 아래. */
export function AssetsLandingStats() {
  const cats = useQuery(assetCategoriesQuery);
  const { me } = useMe();
  const setup = useQuery(setupQuery(me?.user?.id ?? "anon"));
  const total = cats.data?.reduce((s, c) => s + c.total, 0) ?? 0;
  const s = setup.data;
  return (
    <div className="mt-12 space-y-14">
      {s?.assets_setup_visible ? (
        <>
        <section aria-labelledby="dl" className="rounded-panel border border-line bg-ground-2 p-8 md:flex md:items-center md:justify-between md:gap-8">
          <div>
            <h2 id="dl" className="text-[26px] font-extrabold leading-[1.25] tracking-[-0.025em]">PowerPoint 애드인 설치</h2>
            <p className="mt-2 text-md leading-[1.7] text-ink-3"><Copy as="span" text="설치 파일 하나로 끝납니다. 에셋은 서버에서 불러오므로 재설치가 필요 없습니다." /></p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-4">
              {(s?.requires ?? []).map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
          <div className="mt-6 shrink-0 md:mt-0 md:text-right">
            <Button size="lg" asChild><a href="/api/v1/assets/setup/download" download><Download className="size-4" aria-hidden />다운로드 받기</a></Button>
            <p className="mt-2 text-sm text-ink-4">{s ? `v${s.version} · ${fmtMB(s.size)} · ${s.published.replace(/-/g, ".")}` : " "}</p>
          </div>
        </section>
        <Steps id="install" title="설치 5단계" items={INSTALL_STEPS} wide cols={5} />
        <Steps id="use" title="로그인과 사용" items={USE_STEPS} cols={4} />
        </>
      ) : null}
      <section aria-labelledby="ai">
        <h2 id="ai" className="text-[26px] font-extrabold leading-[1.25] tracking-[-0.025em]">AI 가 자료를 골라 줍니다</h2>
        <StepCards items={AI_STEPS.map((st, i) => ({ title: st.title.replace(/[.]$/, ""), desc: st.body, img: `/img/steps/assets-${i + 1}-v3.html` }))} />
      </section>
      {cats.data && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-4">
          <span>전체 {total.toLocaleString()}</span>
          {cats.data.map((c) => <span key={c.id}>{c.label} {c.total.toLocaleString()}</span>)}
        </div>
      )}
    </div>
  );
}

function Steps({ id, title, items, wide, cols = 3 }: { id: string; title: string; items: { img: string; title: string; body: string }[]; wide?: boolean; cols?: 3 | 4 | 5 }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[26px] font-extrabold leading-[1.25] tracking-[-0.025em]">{title}</h2>
      <MobileCarousel as="ol" label={title} className={cn("mt-6 grid grid-cols-1 gap-x-8 gap-y-10", "md:grid-cols-2 lg:grid-cols-3", cols === 4 && "xl:grid-cols-4", cols === 5 && "xl:grid-cols-5 xl:gap-x-5")}>
        {items.map((st, i) => (
          <li key={st.img}>
            {/* 회색 판 없이 연한 회색 테두리만(사용자 2026-10-08) */}<img src={`/img/assets/${st.img}.webp`} alt="" loading="lazy" className={wide ? "block w-full rounded-xl border border-line" : "mx-auto block h-[460px] w-full max-w-[380px] rounded-xl border border-line object-cover object-top"} />
            <div className="mt-4 flex items-start gap-3">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{i + 1}</span>
              <div><p className="text-md font-bold">{st.title}</p><p className="mt-1 text-sm leading-[1.7] text-ink-3"><Copy as="span" text={st.body} /></p></div>
            </div>
          </li>
        ))}
      </MobileCarousel>
    </section>
  );
}

export const ASSET_SCREENS: Record<string, () => React.JSX.Element> = { browse: AssetsBrowse, search: AssetsBrowse, recent: AssetsBrowse, requests: AssetsRequests };
