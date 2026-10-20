// 회원 전용 잠금 안내(사용자 2026-10-16 "로그인해서 pro·team 이 아니면 서비스를 이용 못 하게").
// 서버 Router 가 같은 판정(Access::member)으로 API 를 막는다 — 이 화면은 그 안내만 한다(화면 숨김만으로 막지 않는다, G30).
// 비로그인 → 로그인·회원가입 / Free → 요금제 / 임직원 기간 끝 → 관리자 문의.
// 2026-10-20 사내 전용 운영 — PLANS_UI 가 꺼져 있으면 플랜·전환 문구 대신 사내 이용 안내 + 관리자 문의(/contact)만. 판정은 그대로 서버.
import { Eye, Lock } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Copy } from "@/components/hb/copy";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { PLANS_UI } from "@/lib/plans-ui";
import { cn } from "@/lib/utils";

/**
 * 회원이 아니면 안내 띠를, 회원이면 children 을 그린다. 불러오는 중에는 아무것도 그리지 않는다(깜빡임 방지).
 * title 을 주면 화면 한 장 전체(커뮤니티·검색 등)를 막는 모양 — 제목 + 안내 띠를 본문 폭 안에.
 */
export function MemberGate({ children, title }: { children: React.ReactNode; title?: string }) {
  const { me, loading, member, canView } = useMe();
  if (loading) return null;
  if (member) return <>{children}</>;
  // 로그인한 Free 회원 — 보기만(2026-10-17). 안내 띠를 위에 두고 화면은 그린다. 쓰기·내려받기는 서버가 402 로 막는다
  if (canView) return <>{title ? <div className="container-hb pt-6"><ViewOnlyNotice /></div> : <ViewOnlyNotice />}{children}</>;
  const lock = <MemberLock reason={me ? (me.access?.reason ?? "PLAN_REQUIRED") : "UNAUTHORIZED"} />;
  if (!title) return lock;
  return (
    <div className="container-hb pb-16 pt-10">
      <h1 className="text-[26px] font-extrabold leading-[1.25] tracking-[-0.025em]">{title}</h1>
      {lock}
    </div>
  );
}

/** 보기 전용 안내 — 로그인한 Free 회원(또는 임직원 기간 끝)에게 화면 위 한 줄로 */
export function ViewOnlyNotice({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("mt-6 flex items-center gap-3 rounded-panel border border-line bg-ground-2 px-5 py-3 max-sm:flex-col max-sm:items-start", className)}>
      <Eye className="size-4 shrink-0 text-ink-4" aria-hidden />
      <span className="text-sm text-ink-3"><Copy as="span" text={PLANS_UI ? "보기 전용 계정입니다. 기능 사용은 Pro 이상 회원만 됩니다." : "보기 전용 계정입니다. 이용 권한은 관리자에게 문의해 주세요."} /></span>
      <Button asChild size="sm" variant="outline" className="ml-auto shrink-0 max-sm:ml-0"><Link to="/contact">{PLANS_UI ? "전환 요청" : "관리자에게 문의"}</Link></Button>
    </div>
  );
}

export function MemberLock({ reason, className }: { reason: "UNAUTHORIZED" | "PLAN_REQUIRED" | "STAFF_EXPIRED"; className?: string }) {
  const { pathname, search } = useLocation();
  const next = encodeURIComponent(pathname + search);
  const text = {
    UNAUTHORIZED: "로그인하면 볼 수 있습니다. 사용은 임직원(solideos.com 메일 인증)과 관리자가 전환한 협력사 계정만 됩니다.",
    PLAN_REQUIRED: PLANS_UI ? "Pro 이상 회원만 사용할 수 있습니다. 협력사·계약직은 관리자에게 전환을 요청하세요." : "사내 임직원·승인된 협력사 계정으로 이용할 수 있습니다. 이용 권한은 관리자에게 문의해 주세요.",
    STAFF_EXPIRED: "임직원 이용 기간(가입일로부터 1년)이 끝났습니다. 관리자에게 연장을 요청하세요.",
  }[reason];
  return (
    <div className={cn("mt-8 flex items-center gap-3 rounded-panel border border-line bg-ground-2 p-6 max-sm:flex-col max-sm:items-start", className)}>
      <Lock className="size-5 shrink-0 text-ink-4" aria-hidden />
      <span className="text-md"><Copy as="span" text={text} /></span>
      <div className="ml-auto flex shrink-0 gap-2 max-sm:ml-0">
        {reason === "UNAUTHORIZED" ? (
          <>
            <Button asChild size="sm" variant="outline"><Link to={`/signup?next=${next}`}>회원가입</Link></Button>
            <Button asChild size="sm"><Link to={`/login?next=${next}`}>로그인</Link></Button>
          </>
        ) : reason === "PLAN_REQUIRED" && PLANS_UI ? (
          <>
            <Button asChild size="sm" variant="outline"><Link to="/contact">문의</Link></Button>
            <Button asChild size="sm"><Link to="/pricing">요금제 보기</Link></Button>
          </>
        ) : (
          <Button asChild size="sm"><Link to="/contact">관리자에게 문의</Link></Button>
        )}
      </div>
    </div>
  );
}
