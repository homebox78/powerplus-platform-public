// 통합 홈 — 기획 §13.2-3: 한 문장 정의 + 모듈별 "지금 바로 해 보기" + 로그인 유도. 모듈 카드만 나열하지 않는다.
// 2026-10-08 디자인 점검 리포트 반영: 히어로 = 문구만(이미지 없음, 2026-10-08 사용자), 숫자 띠, powerMCP 안내 띠.
// 모듈 카드 그림: public/img/home/cards/*-v2.html — 움직이는 그림(원본 docs/powerplus-cards, 2026-10-11 사용자 제작). 카드 링크 클릭을 막지 않게 pointer-events 없음.
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { BrandName } from "@/components/hb/brand-name";
import { MainChat } from "@/components/chat/main-chat";
import { Button } from "@/components/ui/button";
import { Copy, MBr, glueDots } from "@/components/hb/copy";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { MODULES } from "@/lib/modules";
import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = () => [{ title: "powerPlus — SI 실무자의 올인원" }];

interface HomeStats { assets: number; icons: number; photos: number; deck_steps: number; gallery: number; kit_parts: number }
const n = (v?: number) => (v ?? 0).toLocaleString("ko-KR");

export default function Home() {
  const { me } = useMe();
  const stats = useQuery({ queryKey: ["home-stats", me?.user?.id ?? ""], queryFn: () => apiFetch<HomeStats>("/home/stats"), staleTime: 300_000 });
  const s = stats.data;
  const band = [
    { v: n(s?.assets), l: `에셋 · 아이콘 ${n(s?.icons)} · 사진 ${n(s?.photos)}`, to: "/assets/browse" },
    { v: `${s?.deck_steps ?? 6}단계`, l: "자료 정리부터 발표 대본까지 · 팀과 함께 편집", to: "/deck" },
    { v: n(s?.gallery), l: "갤러리 시안 · 관공서·대학·일반", to: "/mock/mockups" },
    { v: n(s?.kit_parts), l: "KRDS 대응 부품 · React·Vue", to: "/guide/components" },
  ];
  return (
    <div className="container-hb pb-12 pt-6">
      <section className="py-4 text-center md:py-6">
        <h1 className="text-3xl font-extrabold tracking-[-0.035em] md:text-4xl xl:text-5xl">SI 실무자에게 필요한 것을 한 곳에.</h1>
        <p className="mt-3 text-lg leading-[1.7] text-ink-3">제안서 에셋, 장표 변환, 홈페이지 목업, 디자인 규칙.<MBr />로그인 한 번으로 전부 씁니다.</p>
        {!me && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button asChild size="lg"><Link to="/signup">가입하기</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/login">로그인</Link></Button>
          </div>
        )}
      </section>

      <div className="mx-auto mt-6 w-full lg:w-[48%] 2xl:w-[39%]">
        {/* 대표 작업 하나를 앞세운다(리포트 4-1) — 나머지 모듈은 아래 카드로 */}
        <div className="mb-3 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center">
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-ground">대표 작업</span>
          <span className="text-balance text-md font-semibold text-ink">제안서 장표 만들기 — 사업명이나 제안요청서를 말하면 시작합니다.</span>
        </div>
        <MainChat />
        {!me && (
          <p className="mt-2 text-center text-sm text-ink-4">
            로그인 전에는 답만 드립니다.<MBr />로그인하면 결과를 저장하고 장표 작업으로 이어 갑니다.<MBr /><Link to="/login?next=/" className="pp-hit font-semibold text-ink underline underline-offset-2">로그인</Link>
          </p>
        )}
      </div>

      <MobileCarousel as="section" label="모듈" className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4" aria-label="모듈">
        {MODULES.map((m, i) => (
          <Link key={m.id} to={m.to} className="group flex flex-col overflow-hidden rounded-panel border border-line bg-ground transition-colors hover:bg-ground-2">
            <iframe src={`/img/home/cards/${m.id}-v2.html`} title="" aria-hidden tabIndex={-1} className="pointer-events-none block aspect-[1200/670] w-full border-0" loading={i < 2 ? "eager" : "lazy"} />
            <div className="flex flex-1 flex-col gap-4 p-7 xl:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-11 items-center justify-center rounded-card bg-ink text-white"><m.icon className="size-5" aria-hidden /></span>
                <div><h2 className="pp-module-title text-[22px] font-normal leading-tight"><BrandName name={m.name} /></h2><div className="text-sm text-ink-4">{m.sub}</div></div>
              </div>
              <Copy className="text-md leading-[1.7] text-ink-3" text={m.desc} />
              {/* 아래 칸은 네 카드 모두 두 줄(이용 범위 / 바로 해 보기) — 글 길이에 따라 한 줄·두 줄로 갈려 높이가 달랐다(2026-10-17 점검) */}
              <div className="mt-auto flex flex-col items-start gap-2 text-sm">
                <span className="text-ink-4">{glueDots(`회원 전용 · ${m.free}`)}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-ink">바로 해 보기<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              </div>
            </div>
          </Link>
        ))}
      </MobileCarousel>

      <MobileCarousel as="section" label="숫자" className="mt-8 grid grid-cols-2 border-y border-line xl:grid-cols-4" aria-label="숫자로 보는 powerPlus">
        {band.map((b, i) => (
          <Link key={b.to} to={b.to} className={`flex flex-col gap-1 px-5 py-7 transition-colors hover:bg-ground-2 ${i % 2 ? "border-l border-line" : ""} ${i > 1 ? "max-xl:border-t xl:border-l" : ""} max-sm:border-0`}>
            <span className="text-3xl font-extrabold tracking-[-0.03em] text-ink tabular-nums md:text-4xl">{b.v}</span>
            <span className="text-sm text-ink-3">{b.l}</span>
          </Link>
        ))}
      </MobileCarousel>

      <section className="mt-8 flex flex-col gap-6 rounded-panel bg-dark px-6 py-6 text-white sm:px-10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em]">연결 방법은 <span className="pp-module-title"><BrandName name="powerMCP" /></span> 에서</h2>
          <p className="mt-2 text-md leading-[1.7] text-white/70"><Copy as="span" text="키 만들기와 도구별 설정을 한곳에 모았습니다. AI 도구에 연결하면 이 서비스를 말로 부릅니다." /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" variant="outline" className="border-white bg-white text-ink hover:bg-white/90"><Link to="/powermcp">powerMCP 열기</Link></Button>
          <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/docs">자세한 문서</Link></Button>
        </div>
      </section>
    </div>
  );
}
