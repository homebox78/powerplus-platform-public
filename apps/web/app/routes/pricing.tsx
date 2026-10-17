// 출처: homebox-handoff apps/web/app/routes/pricing.tsx — 요금제는 billing.visible 플래그 뒤로(기획 §12.3): 꺼져 있으면 숫자 없이 "준비 중"과 지금 이용 자격(회원 전용, 2026-10-16)만. 켜져 있으면 /plans 응답으로 카드를 그린다(결제 연동은 P6 이라 버튼은 상담·마이페이지로). 기관 파비콘 띠·비교표·결제창은 뺐다.
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { BrandName } from "@/components/hb/brand-name";
import { Copy, MBr, glueDots } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { BillingToggle, PlanCard, SaveNote } from "@/components/hb/pricing";
import type { Billing, PlanRow } from "@/lib/billing";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { MODULES } from "@/lib/modules";
import type { Route } from "./+types/pricing";

export const meta: Route.MetaFunction = () => [{ title: "요금제 — powerPlus" }];

interface ServerPlan { code: string; name: string; price_month_krw: number; price_year_krw: number; limits: Record<string, number | boolean> | null }

export default function PricingPage() {
  const { me } = useMe();
  return me?.billing_visible ? <PlansView /> : <Soon />;
}

/** 요금제 공개 전 — 숫자 없이 지금 이용 자격만. 서비스는 회원 전용(Pro·Team·임직원, 외부 가입자는 관리자 승인 뒤 — 사용자 결정 2026-10-17) */
const ACCESS: { title: string; desc: string }[] = [
  { title: "가입(Free)", desc: "로그인 후 보기만 · 사용 불가" },
  { title: "사용(Pro 이상)", desc: "임직원 / 협력사·계약직은 관리자 전환 뒤" },
];
function Soon() {
  return (
    <div className="pb-14">
      <section className="container-page flex flex-col items-center pt-13 text-center">
        <Tag tone="soft">준비 중</Tag>
        <h1 className="mt-5 text-5xl font-extrabold leading-[1.15] tracking-[-0.04em] md:text-[64px]">요금제는<br />곧 안내합니다</h1>
        <Copy className="mt-6 max-w-[640px] text-lg leading-[1.7] text-ink-3" text="모든 기능은 회원 전용입니다. 요금제를 열 때 공지사항으로 먼저 알려 드립니다." />
      </section>
      <section className="container-page mt-9">
        {/* 가입·이용 두 칸 — 누가 무엇을 쓰는지 먼저(모듈 카드는 회원이 쓰는 것) */}
        <ul className="mx-auto mb-4 grid max-w-(--container-hb) grid-cols-1 gap-4 sm:grid-cols-2" aria-label="이용 자격">
          {ACCESS.map((a) => (
            <li key={a.title} className="flex min-w-0 flex-col rounded-panel border border-line p-6">
              <span className="text-xl font-bold">{a.title}</span>
              <span className="mt-1 text-md text-ink-3">{glueDots(a.desc)}</span>
            </li>
          ))}
        </ul>
        <ul className="mx-auto grid max-w-(--container-hb) grid-cols-1 gap-4 sm:grid-cols-2">
          {MODULES.map((m) => (
            <li key={m.id}><Link to={m.to} className="group flex h-full min-w-0 gap-4 rounded-panel bg-ground-3 p-6 transition-colors hover:bg-ground-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white dark:bg-ground"><m.icon className="size-6" aria-hidden /></span>
              <span className="flex min-w-0 flex-col">
                <span className="pp-module-title text-xl"><BrandName name={m.name} /></span>
                <span className="mt-1 text-md text-ink-3">{glueDots(`회원 전용 · ${m.free}`)}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ink">바로 해 보기<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              </span>
            </Link></li>
          ))}
        </ul>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg"><Link to="/signup">가입하기</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/contact?topic=team">팀 도입 상담</Link></Button>
        </div>
        <p className="mt-6 text-center text-md text-ink-3">새 소식은 <Link to="/community?c=notice" className="font-semibold text-ink underline underline-offset-4">공지사항</Link>에서 봅니다.</p>
      </section>
    </div>
  );
}

/** 공개 후(지금은 superadmin 에게만) — /plans 응답(core_plans)을 마이페이지와 같은 카드로. 시작은 마이페이지 플랜·결제에서. */
function PlansView() {
  const { me } = useMe();
  const nav = useNavigate();
  const [billing, setBilling] = useState<Billing>("year");
  const q = useQuery({ queryKey: ["plans"], queryFn: () => apiFetch<ServerPlan[]>("/plans") });
  const plans: PlanRow[] = (q.data ?? []).filter((p) => p.code === "pro" || p.code === "team").map((p) => ({
    code: p.code as "pro" | "team", name: p.name, price_month: p.price_month_krw, price_year_month: p.price_year_krw, credits_month: 0, limits: p.limits ?? {},
  }));
  const go = () => nav(me ? "/account/plan" : "/login?next=/account/plan");
  return (
    <div className="pb-14">
      <section className="container-page flex flex-col items-center pt-13 text-center">
        <h1 className="text-5xl font-extrabold leading-[1.1] tracking-[-0.04em] md:text-[64px]">SI 작업을<br />한 요금제로</h1>
        <Copy className="mt-6 max-w-[640px] text-lg text-ink-3" text="4개 모듈과 powerMCP 를 한 계정으로 씁니다." />
        <div className="mt-9 flex flex-col items-center gap-3"><BillingToggle value={billing} onChange={setBilling} /><SaveNote plan={plans[0]} /></div>
      </section>
      <section className="container-page mt-8">
        <div className="mx-auto grid max-w-(--container-hb) grid-cols-1 gap-5 md:grid-cols-2">
          {plans.map((p) => <PlanCard key={p.code} plan={p} billing={billing} current={me?.plan === p.code} cta={me?.plan === p.code ? "이용 중 — 플랜·결제 보기" : `${p.name} 시작하기`} onSelect={go} />)}
        </div>
        {q.isLoading && <p className="mt-6 text-center text-md text-ink-4">요금제를 불러오는 중…</p>}
        {q.isError && <p className="mt-6 text-center text-md text-warn">요금제를 불러오지 못했습니다.</p>}
        <p className="mt-8 text-center text-sm text-ink-4">임직원 계정은 결제 없이 모든 기능을 씁니다.<MBr />결제는 마이페이지 플랜·결제에서 합니다.</p>
      </section>
    </div>
  );
}
