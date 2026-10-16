// 회원 전용 잠금 안내(사용자 2026-10-16 "로그인해서 pro·team 이 아니면 서비스를 이용 못 하게").
// 서버 Router 가 같은 판정(Access::member)으로 API 를 막는다 — 이 화면은 그 안내만 한다(화면 숨김만으로 막지 않는다, G30).
// 비로그인 → 로그인·회원가입 / Free → 요금제 / 임직원 기간 끝 → 관리자 문의.
import { Lock } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Copy } from "@/components/hb/copy";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * 회원이 아니면 안내 띠를, 회원이면 children 을 그린다. 불러오는 중에는 아무것도 그리지 않는다(깜빡임 방지).
 * title 을 주면 화면 한 장 전체(커뮤니티·검색 등)를 막는 모양 — 제목 + 안내 띠를 본문 폭 안에.
 */
export function MemberGate({ children, title }: { children: React.ReactNode; title?: string }) {
  const { me, loading, member } = useMe();
  if (loading) return null;
  if (member) return <>{children}</>;
  const lock = <MemberLock reason={me ? (me.access?.reason ?? "PLAN_REQUIRED") : "UNAUTHORIZED"} />;
  if (!title) return lock;
  return (
    <div className="container-hb pb-16 pt-10">
      <h1 className="text-[26px] font-extrabold leading-[1.25] tracking-[-0.025em]">{title}</h1>
      {lock}
    </div>
  );
}

export function MemberLock({ reason, className }: { reason: "UNAUTHORIZED" | "PLAN_REQUIRED" | "STAFF_EXPIRED"; className?: string }) {
  const { pathname, search } = useLocation();
  const next = encodeURIComponent(pathname + search);
  const text = {
    UNAUTHORIZED: "회원가입 후 로그인하면 이용할 수 있습니다. Pro·Team 회원과 임직원(solideos.com 메일 인증)이 쓸 수 있습니다.",
    PLAN_REQUIRED: "Pro·Team 회원만 이용할 수 있습니다. 요금제를 확인하거나 관리자에게 문의하세요.",
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
        ) : reason === "PLAN_REQUIRED" ? (
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
