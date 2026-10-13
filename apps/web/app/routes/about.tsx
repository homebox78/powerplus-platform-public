// 출처: homebox-handoff apps/web/app/routes/about.tsx — 관공서 레퍼런스 소개 → powerPlus(SI 실무자의 올인원) 소개로. 수집 규모 숫자는 빼고 모듈 4종(modules.ts)과 원칙·운영 주체(㈜솔리데오)로 다시 썼다.
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { BrandName } from "@/components/hb/brand-name";
import { Link } from "react-router";
import { Copy } from "@/components/hb/copy";
import { Button } from "@/components/ui/button";
import { MODULES } from "@/lib/modules";
import type { Route } from "./+types/about";

// 가운데 큰 헤드라인 → 모듈 4칸(원형 아이콘) → 원칙(어두운 상자) → 운영 주체 → CTA
export const meta: Route.MetaFunction = () => [{ title: "powerPlus 소개 — powerPlus" }];

const PRINCIPLES = [
  ["내 파일은 내 것", "올린 파일은 요청한 작업에만 씁니다. 작업이 끝나고 7일이 지나면 지웁니다."],
  ["AI 는 AI 라고", "AI 로 만든 에셋에는 표시를 붙입니다. 결과물도 똑같습니다."],
  ["출처는 남깁니다", "참고한 화면은 출처를 적습니다. 삭제요청은 48시간 안에 처리합니다."],
] as const;

export default function AboutPage() {
  return (
    <div className="pb-14">
      <section className="container-page flex flex-col items-center pt-10 text-center">
        <h1 className="text-5xl font-extrabold leading-[1.15] tracking-[-0.035em] md:text-[64px]">SI 실무자의<br />올인원 작업대</h1>
        <Copy className="mt-6 max-w-[820px] text-lg leading-[1.7] text-ink-3" text="제안서 에셋, 장표 변환, 홈페이지 목업, 디자인 규칙을 한곳에 모았습니다. 기획자·디자이너·퍼블리셔가 한 계정으로 같은 도구를 씁니다." />
      </section>

      <section className="container-page mt-16">
        <h2 className="text-center text-3xl font-extrabold tracking-[-0.02em]"><BrandName name="powerPlus" /> 가 하는 일</h2>
        <MobileCarousel label="모듈" className="mx-auto mt-14 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <Link key={m.id} to={m.to} className="group flex flex-col items-center text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-ground-3 transition-colors group-hover:bg-ground-4"><m.icon className="size-6" aria-hidden /></span>
              <h3 className="pp-module-title mt-5 text-[22px]"><BrandName name={m.name} /></h3>
              <p className="mt-1 text-sm font-semibold text-ink-4">{m.sub}</p>
              <Copy className="mt-2 max-w-[480px] text-md leading-[1.7] text-ink-3" text={m.desc} />
            </Link>
          ))}
        </MobileCarousel>
        <Copy className="mt-14 text-center text-md text-ink-3" text="AI 도구에서는 powerMCP 하나로 4개 모듈을 모두 부릅니다." />
      </section>

      <section className="container-page mt-19">
        <h2 className="text-center text-3xl font-extrabold tracking-[-0.02em]">원칙</h2>
        <div className="mt-10 grid grid-cols-1 border-t border-line md:grid-cols-3 md:divide-x md:divide-line">
          {PRINCIPLES.map(([t, d]) => (
            <div key={t} className="border-b border-line px-2 py-8 text-center md:border-b-0 md:px-8">
              <h3 className="text-lg font-bold">{t}</h3>
              <Copy className="mt-3 text-md leading-[1.7] text-ink-3" text={d} />
            </div>
          ))}
        </div>
        <div className="border-b border-line" />
      </section>

      <section className="container-page mt-19 flex flex-col items-center text-center">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em]">지금 바로 써 보세요</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg"><Link to="/">시작하기</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/community">커뮤니티</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/contact">문의하기</Link></Button>
        </div>
      </section>
    </div>
  );
}
