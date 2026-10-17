// 출처: homebox-handoff apps/web/app/routes/contact.tsx + removal.tsx — 문의와 삭제요청을 한 폼으로(사용자 지시 2026-10-06 "문의와 삭제요청을 한 폼에, 카테고리 있게").
// 종류: 삭제요청·일반 문의·사업제휴·팀 도입·자료 정정·오류 신고. 삭제요청만 대상 주소·사유·동의가 더 붙고 POST /api/v1/removal(접수번호·48h 기한), 나머지는 POST /api/v1/contact.
// 필드 오류는 422 hint(필드 이름)로 받는다. 화면 우측 하단 문의 아이콘(scroll-top.tsx)과 푸터·/removal(→ 여기로 이동)이 이 화면으로 온다.
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Copy } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch, postJson } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { OPERATOR } from "@/lib/docs-content";
import { MODULES } from "@/lib/modules";
import type { Route } from "./+types/contact";

export const meta: Route.MetaFunction = () => [{ title: "문의 — powerPlus" }];

const TOPICS = [
  ["general", "일반 문의"], ["removal", "삭제요청"], ["partner", "사업제휴"], ["team", "팀 도입"], ["data", "자료 정정·추가"], ["bug", "오류 신고"],
] as const;
type Topic = (typeof TOPICS)[number][0];
const REASONS = [["copyright", "저작권", "내 저작물이 허락 없이 쓰임"], ["privacy", "개인정보", "이름·연락처·얼굴 등이 드러남"], ["other", "기타", "위 사유 외"]] as const;
const STATUS_KO = { received: ["접수", "line"], reviewing: ["검토 중", "soft"], done: ["삭제 완료", "ok"], rejected: ["거절", "warn"] } as const;
type Status = { ticket_no: string; status: keyof typeof STATUS_KO; due_at: string; resolution: string | null; created_at: string };
const NONE = "none";
const field = "h-10 rounded-chip border-0 bg-ground-3 px-4 text-sm";
const when = (s: string) => s.slice(0, 16).replace("T", " ");

export default function ContactPage() {
  const [sp] = useSearchParams();
  const { me } = useMe();
  const init = (sp.get("topic") ?? "general") as Topic;
  const initMod = sp.get("module") ?? NONE;
  const [form, setForm] = useState({
    name: me?.user?.name ?? "", email: me?.user?.email ?? "", org: "", phone: "", seats: "",
    topic: TOPICS.some(([k]) => k === init) ? init : "general",
    module: MODULES.some((m) => m.id === initMod) ? initMod : NONE,
    message: sp.get("message") ?? "", target_url: sp.get("url") ?? "", reason: "copyright", agree: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const name = form.name || me?.user?.name || "";
  const email = form.email || me?.user?.email || "";
  const removal = form.topic === "removal";
  const team = form.topic === "team";

  const send = useMutation({
    mutationFn: () => removal
      ? postJson<{ ticket_no: string; due_at: string }>("/removal", { claimant_name: name, claimant_email: email, claimant_org: form.org, claimant_phone: form.phone, target_url: form.target_url, reason: form.reason, detail: form.message, agree: form.agree })
      : postJson<{ id: string }>("/contact", { name, email, org: form.org, topic: form.topic, module: form.module === NONE ? null : form.module, seats: form.seats ? Number(form.seats) : null, message: form.message }).then(() => ({ ticket_no: "", due_at: "" })),
    onError: (e) => setErrors(e instanceof ApiError && e.hint ? { [FIELD_MAP[e.hint] ?? e.hint]: e.message } : { form: e instanceof ApiError ? e.message : "보내지 못했습니다. 잠시 뒤 다시 시도해 주세요." }),
  });
  const set = (k: keyof typeof form) => (v: string | boolean) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: "", form: "" })); };

  if (send.isSuccess) {
    const r = send.data;
    return (
      <div className="container-page flex flex-col items-center pb-16 pt-24 text-center">
        <CheckCircle2 className="size-12 text-ok" aria-hidden />
        <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.03em]">{r.ticket_no ? "삭제요청이 접수되었습니다" : "문의를 받았습니다"}</h1>
        {r.ticket_no
          ? <dl className="mt-6 grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-left text-md"><dt className="text-ink-4">접수번호</dt><dd className="font-bold tracking-wide">{r.ticket_no}</dd><dt className="text-ink-4">처리 기한</dt><dd>{when(r.due_at)}</dd><dt className="text-ink-4">회신</dt><dd className="[overflow-wrap:anywhere]">{email}</dd></dl>
          : <Copy className="mt-4 text-md leading-[1.7] text-ink-3" text={`영업일 기준 1~2일 안에 ${email} 로 답장 드립니다.`} />}
        {r.ticket_no && <Copy className="mt-4 max-w-[480px] text-sm text-ink-4" text="접수번호와 이메일로 아래에서 처리 상태를 확인할 수 있습니다. 48시간 안에 삭제·가림·거절 중 하나로 처리합니다." />}
        <Button asChild size="md" variant="outline" className="mt-8"><Link to="/">홈으로</Link></Button>
      </div>
    );
  }

  return (
    <div className="container-page grid grid-cols-1 gap-16 pb-14 pt-16 lg:grid-cols-2 lg:gap-20">
      <div className="min-w-0">
        {/* 도움말 센터 첫 화면과 h1 이 같았다(2026-10-17 점검) — 문의 화면은 하는 일을 제목으로 */}
        <h1 className="text-5xl font-extrabold leading-[1.15] tracking-[-0.03em]">문의를 남겨 주세요</h1>
        <Copy className="mt-5 max-w-[480px] text-lg leading-[1.7] text-ink-3" text="서비스 이용, 사업제휴, 자료 정정, 삭제요청까지 한 곳에서 받습니다. 영업일 기준 1~2일 안에 답장 드립니다." />
        <dl className="mt-12 flex flex-col gap-6 text-md">
          <div><dt className="font-semibold">바로가기</dt><dd className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/help">도움말</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/powermcp">powerMCP 연결</Link></Button>
          </dd></div>
          <div><dt className="font-semibold">운영</dt><dd className="mt-2 text-ink-3">{OPERATOR.name} · 대표 {OPERATOR.ceo}<br />{OPERATOR.address}<br />대표전화 {OPERATOR.tel}</dd></div>
        </dl>
        <RemovalLookup />
      </div>

      <form className="flex min-w-0 flex-col gap-5 rounded-banner bg-white p-6 shadow-[0_2px_24px_rgba(0,0,0,.06)] ring-1 ring-line sm:p-8 dark:bg-ground-2" onSubmit={(e) => { e.preventDefault(); send.mutate(); }} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Row label="문의 종류" htmlFor="c-topic">
            <Select value={form.topic} onValueChange={set("topic")}>
              <SelectTrigger id="c-topic" aria-labelledby="c-topic-label" className={`${field} w-full`}><SelectValue /></SelectTrigger>
              <SelectContent>{TOPICS.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </Row>
          {!removal && (
            <Row label="관련 서비스" htmlFor="c-module">
              <Select value={form.module} onValueChange={set("module")}>
                <SelectTrigger id="c-module" aria-labelledby="c-module-label" className={`${field} w-full`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>전체·모름</SelectItem>
                  {MODULES.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
          )}
          {removal && <Row label="연락처 (선택)" htmlFor="c-phone" error={errors.phone}><Input id="c-phone" className={field} value={form.phone} onChange={(e) => set("phone")(e.target.value)} maxLength={30} autoComplete="tel" /></Row>}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Row label="이름" htmlFor="c-name" error={errors.name}><Input id="c-name" className={field} value={name} onChange={(e) => set("name")(e.target.value)} maxLength={60} autoComplete="name" /></Row>
          <Row label="이메일" htmlFor="c-email" error={errors.email}><Input id="c-email" type="email" className={field} value={email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" /></Row>
        </div>
        <div className={`grid grid-cols-1 gap-5 ${team ? "sm:grid-cols-[minmax(0,1fr)_140px]" : ""}`}>
          <Row label="소속 (선택)" htmlFor="c-org" error={errors.org}><Input id="c-org" className={field} value={form.org} onChange={(e) => set("org")(e.target.value)} maxLength={120} placeholder="회사·기관 이름" autoComplete="organization" /></Row>
          {team && <Row label="예상 인원" htmlFor="c-seats" error={errors.seats}><Input id="c-seats" inputMode="numeric" className={field} value={form.seats} onChange={(e) => set("seats")(e.target.value.replace(/\D/g, ""))} placeholder="5" /></Row>}
        </div>
        {removal && (
          <>
            <Row label="powerPlus 안 주소" htmlFor="c-url" error={errors.target_url}>
              <Input id="c-url" className={field} value={form.target_url} onChange={(e) => set("target_url")(e.target.value)} placeholder="예: /p/ab12cd34 또는 /community/글번호" />
              <span className="text-xs text-ink-4">문제가 보이는 화면의 주소창 URL 을 그대로 붙여 넣으세요.</span>
            </Row>
            <Row label="사유" htmlFor="c-reason" error={errors.reason}>
              <RadioGroup id="c-reason" aria-labelledby="c-reason-label" value={form.reason} onValueChange={set("reason")} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {REASONS.map(([v, l, d]) => <Label key={v} htmlFor={`r-${v}`} className={`flex cursor-pointer items-start gap-2.5 rounded-card border p-3.5 ${form.reason === v ? "border-ink" : "border-line"}`}><RadioGroupItem id={`r-${v}`} value={v} aria-label={l} className="mt-0.5" /><span className="flex flex-col gap-0.5"><span className="font-bold">{l}</span><span className="text-xs font-normal text-ink-4">{d}</span></span></Label>)}
              </RadioGroup>
            </Row>
          </>
        )}
        <Row label={removal ? "상세 내용 (10자 이상)" : "내용"} htmlFor="c-msg" error={errors.message}>
          <Textarea id="c-msg" className="min-h-40 rounded-panel border-0 bg-ground-3 px-5 py-4 text-md" value={form.message} onChange={(e) => set("message")(e.target.value)} maxLength={3000}
            placeholder={removal ? "어느 화면·영역이 문제인지와 권리 관계를 적어 주세요." : team ? "팀 규모와 쓰실 용도(제안·디자인·개발)를 알려 주시면 빠르게 안내해 드립니다." : form.topic === "partner" ? "제휴 형태와 기대하는 역할을 적어 주세요." : "궁금한 점을 적어 주세요."} />
        </Row>
        {removal && (
          <>
            <label className="flex items-start gap-3 rounded-card border border-line p-4 text-sm"><Checkbox id="c-agree" checked={form.agree} onCheckedChange={(v) => set("agree")(v === true)} className="mt-0.5" /><span>본인은 해당 콘텐츠의 권리자 또는 정당한 대리인이며, 적은 내용이 사실임을 확인합니다.<br /><span className="text-ink-4">허위 요청으로 생긴 책임은 요청자에게 있습니다.</span></span></label>
            {errors.agree && <p className="-mt-3 text-sm text-warn" role="alert">{errors.agree}</p>}
          </>
        )}
        {errors.form && <p className="text-sm text-warn" role="alert">{errors.form}</p>}
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={send.isPending}>{removal && <ShieldCheck aria-hidden />}{send.isPending ? "보내는 중…" : removal ? "삭제요청 접수" : "보내기"}</Button>
        <p className="text-center text-xs text-ink-4">보내면 <Link to="/legal/privacy" className="pp-hit underline underline-offset-2">개인정보처리방침</Link>에 동의한 것으로 봅니다.</p>
      </form>
    </div>
  );
}

/** 삭제요청 API 의 필드 이름(claimant_*·detail) → 이 폼의 필드 이름 */
const FIELD_MAP: Record<string, string> = { claimant_name: "name", claimant_email: "email", claimant_org: "org", claimant_phone: "phone", detail: "message" };

/** 삭제요청 처리 상태 조회 — 접수번호(RM…)+이메일 */
function RemovalLookup() {
  const [lookup, setLookup] = useState({ ticket: "", email: "" });
  const status = useQuery({
    queryKey: ["removal-status", lookup],
    queryFn: () => apiFetch<Status>(`/removal/${encodeURIComponent(lookup.ticket)}?email=${encodeURIComponent(lookup.email)}`),
    enabled: lookup.ticket.length >= 8 && lookup.email.includes("@"),
    retry: false,
  });
  const st = status.data ? STATUS_KO[status.data.status] : undefined;
  return (
    <div className="mt-12 rounded-card border border-line p-5">
      <h2 className="text-md font-bold">삭제요청 처리 상태</h2>
      <div className="mt-3 flex flex-col gap-2">
        <Input placeholder="접수번호 (RM…)" value={lookup.ticket} onChange={(e) => setLookup((l) => ({ ...l, ticket: e.target.value.trim().toUpperCase() }))} aria-label="접수번호" />
        <Input type="email" placeholder="접수 이메일" value={lookup.email} onChange={(e) => setLookup((l) => ({ ...l, email: e.target.value.trim() }))} aria-label="이메일" />
      </div>
      {status.data && (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2"><Tag tone={st?.[1] ?? "line"}>{st?.[0] ?? status.data.status}</Tag><span className="font-semibold">{status.data.ticket_no}</span></div>
          <div className="text-ink-4">접수 {when(status.data.created_at)} · 기한 {when(status.data.due_at)}</div>
          {status.data.resolution && <Copy className="text-ink-3" text={status.data.resolution} />}
        </div>
      )}
      {status.isError && <p className="mt-3 text-xs text-warn">접수번호와 이메일이 일치하는 요청이 없습니다.</p>}
    </div>
  );
}

function Row({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-2"><Label id={htmlFor + "-label"} htmlFor={htmlFor} className="text-sm font-semibold">{label}</Label>{children}{error && <p className="text-sm text-warn" role="alert">{error}</p>}</div>;
}
