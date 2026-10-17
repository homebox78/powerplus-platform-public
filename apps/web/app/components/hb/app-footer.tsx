// 출처: homebox-handoff apps/web/app/components/hb/app-footer.tsx — 사용자 지시(2026-10-06)대로 네 줄 구성:
// 모바일은 바닥글 안쪽 아래 여백(pb-28)으로 하단 탭·떠 있는 버튼 자리를 둔다 — 바닥글 뒤 흰 빈 칸을 두지 않는다(사용자 2026-10-09)
//   [로고] / [슬로건]   [소개 | 도움말 | 이용약관 | 개인정보처리방침] / [주소·대표·전화] / [카피라이트]
// 모바일(768 미만, 사용자 2026-10-10): 로고+짧은 슬로건 한 줄 → 링크 | 구분 한 줄 → 회사·대표·전화 / 주소 두 줄 → © 한 줄
// 문의·삭제요청은 화면 우측 하단 문의 아이콘(scroll-top.tsx)에서, 모듈·커뮤니티는 헤더 메뉴에서 간다. 통신판매업 등 결제 법정 표기는 billing.visible 공개 결정 뒤(기획 §17.2-③)
import { Link } from "react-router";
import { BrandName } from "@/components/hb/brand-name";
import { MBr } from "@/components/hb/copy";
import { OPERATOR } from "@/lib/docs-content";

// 요금제(/pricing)는 서비스 안내 묶음(소개·도움말·문서) 끝에 — 2026-10-17 점검 "바닥글에 요금제 링크 없음"
const LINKS: Array<[string, string]> = [["소개", "/about"], ["도움말", "/help"], ["문서", "/docs"], ["요금제", "/pricing"], ["이용약관", "/legal/terms"], ["개인정보처리방침", "/legal/privacy"]];

function FooterLinks({ mobile }: { mobile?: boolean }) {
  return (
    // 모바일은 | 구분선 없이 간격만 — 요금제를 더해 두 줄이 되면서 줄 머리에 | 가 오던 것(2026-10-17)
    <nav aria-label="바닥 메뉴" className={mobile ? "flex flex-wrap items-center gap-x-4 text-[13px]" : "flex flex-wrap items-center text-sm"}>
      {LINKS.map(([label, to], i) => (
        <span key={to} className="flex items-center">
          {i > 0 && !mobile && <span aria-hidden className="mx-3 text-white/25">|</span>}
          <Link to={to} className={mobile ? "pp-hit inline-flex min-h-8 items-center whitespace-nowrap text-white/85 hover:text-white" : "inline-flex min-h-8 items-center text-white/85 hover:text-white"}>{label}</Link>
        </span>
      ))}
    </nav>
  );
}

export function AppFooter() {
  return (
    <footer data-site-footer className="mt-auto bg-[#161616] text-white">
      {/* 모바일 — 오른쪽 pr-16 은 떠 있는 도움·TOP 버튼 칸(글이 버튼 밑으로 지나가지 않게, 2026-10-17 점검) */}
      <div className="container-hb flex flex-col gap-3 pb-28 pr-16 pt-7 md:hidden">
        <div className="flex items-baseline gap-2.5">
          <span className="pp-logo text-[18px]"><BrandName name="powerPlus" /></span>
          <p className="text-[13px] text-white/60">SI 실무자의 올인원</p>
        </div>
        <FooterLinks mobile />
        <div className="mt-1 flex flex-col gap-0.5 text-xs leading-[1.6] text-white/45">
          <p>{OPERATOR.name} · 대표 {OPERATOR.ceo} · 대표전화 {OPERATOR.tel}</p>
          <p>{OPERATOR.address}</p>
        </div>
        <p className="text-xs leading-[1.6] text-white/45">© 2026 SOLIDEO.</p>
      </div>
      {/* 태블릿·PC */}
      <div className="container-hb hidden flex-col gap-3 pb-6 pt-8 md:flex">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="pp-logo text-[20px]"><BrandName name="powerPlus" /></span>
            <p className="text-sm leading-[1.6] text-white/60">SI 실무자의 올인원.<MBr />에셋·장표·목업·디자인 규칙.</p>
          </div>
          <FooterLinks />
        </div>
        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-6">
          <p className="text-xs leading-[1.6] text-white/45">{OPERATOR.name} · 대표 {OPERATOR.ceo} · {OPERATOR.address} · 대표전화 {OPERATOR.tel}</p>
          <p className="shrink-0 text-xs leading-[1.6] text-white/45">© 2026 SOLIDEO.</p>
        </div>
      </div>
    </footer>
  );
}
