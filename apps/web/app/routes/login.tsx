// 출처: homebox-handoff apps/web/app/routes/login.tsx — 오른쪽 썸네일 콜라주는 powerMock 이 붙은 뒤. 서버 /auth/providers 가 켜진 제공자만 준다.
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { BrandName } from "@/components/hb/brand-name";
import { MODULES } from "@/lib/modules";
import { GoogleIcon, KakaoIcon, NaverIcon } from "@/components/hb/brand-icons";
import { Copy } from "@/components/hb/copy";
import { EmailLogin } from "@/components/hb/email-login";
import { TestLogin } from "@/components/hb/test-login";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api";
import { oauthUrl, useMe } from "@/lib/auth";
import type { Route } from "./+types/login";

export const meta: Route.MetaFunction = ({ location }) => [{ title: location.pathname.startsWith("/signup") ? "회원가입 — powerPlus" : "로그인 — powerPlus" }];

const ERRORS: Record<string, string> = { state: "로그인 요청이 만료되었거나 위조되었습니다. 다시 시도해 주세요.", exchange: "소셜 로그인 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.", profile: "계정 정보를 가져오지 못했습니다.", access_denied: "로그인을 취소했습니다.", provider: "지원하지 않는 로그인 방식입니다.", DORMANT: "휴면 계정입니다. 3개월 넘게 로그인하지 않아 휴면으로 바뀌었습니다. 관리자에게 승인 요청을 보냈습니다. 승인되면 다시 로그인할 수 있습니다.", BLOCKED: "이용이 제한된 계정입니다. 관리자에게 문의하세요." };

export default function LoginPage() {
  const { pathname } = useLocation();
  const signup = pathname.startsWith("/signup");
  const [sp] = useSearchParams();
  const next = sp.get("next") && sp.get("next")!.startsWith("/") ? sp.get("next")! : "/";
  const error = sp.get("error");
  const { me } = useMe();
  const [codeStep, setCodeStep] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { if (me) navigate(next, { replace: true }); }, [me, next, navigate]);
  const providers = useQuery({ queryKey: ["auth-providers"], queryFn: () => apiFetch<Array<{ provider: "google" | "naver" | "kakao"; enabled: boolean }>>("/auth/providers"), staleTime: Infinity });
  const on = (p: "google" | "naver" | "kakao") => !!providers.data?.find((x) => x.provider === p && x.enabled);
  // 버튼은 늘 보인다. 서버에 키가 아직 없는 제공자는 누르면 안내만(이메일 로그인으로).
  const guard = (e: MouseEvent, p: "google" | "naver" | "kakao") => { if (!on(p)) { e.preventDefault(); toast.info("이 로그인 방식은 곧 열립니다. 지금은 이메일로 로그인해 주세요."); } };

  return (
    <div className="grid min-h-[calc(100dvh-72px)] grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-[420px] flex-col items-center gap-7">
          <Link to="/" className="pp-logo text-[24px] text-ink" aria-label="powerPlus 홈"><BrandName name="powerPlus" /></Link>
          {codeStep
            ? <h1 className="text-center text-[26px] font-extrabold leading-[1.4] tracking-[-0.02em]">이메일로 보낸<br />인증번호 6자리를 입력하세요</h1>
            : <h1 className="text-center text-4xl font-extrabold tracking-[-0.03em]">{signup ? "powerPlus 시작하기" : "다시 오셨군요"}</h1>}
          {error && <Alert variant="destructive" className="w-full"><AlertCircle aria-hidden /><AlertDescription><Copy as="span" text={ERRORS[error] ?? `로그인에 실패했습니다 (${error}).`} /></AlertDescription></Alert>}
          {!codeStep && <><div className="flex w-full flex-col gap-2.5">
            <Button asChild size="lg" variant="outline" className="w-full border-line-3 bg-ground text-ink shadow-none hover:bg-ground-2"><a href={oauthUrl("google", next)} onClick={(e) => guard(e, "google")}><GoogleIcon className="mr-1 size-[18px]" />Google로 계속하기</a></Button>
            <Button asChild size="lg" className="w-full border-0 bg-[#FEE500] text-[#191919] shadow-none hover:bg-[#f5dc00]"><a href={oauthUrl("kakao", next)} onClick={(e) => guard(e, "kakao")}><KakaoIcon className="mr-1 size-[18px]" />카카오로 계속하기</a></Button>
            <Button asChild size="lg" className="w-full border-0 bg-[#03C75A] text-white shadow-none hover:bg-[#02b350]"><a href={oauthUrl("naver", next)} onClick={(e) => guard(e, "naver")}><NaverIcon className="mr-1 size-4" />네이버로 계속하기</a></Button>
          </div>
          <div className="flex w-full items-center gap-3 text-sm text-ink-4"><Separator className="flex-1" />또는 이메일로<Separator className="flex-1" /></div></>}
          <EmailLogin signup={signup} onStep={setCodeStep} onDone={() => navigate(next, { replace: true })} />
          {!codeStep && <TestLogin onDone={() => navigate(next, { replace: true })} />}
          {codeStep && <div className="flex w-full items-center gap-3 text-[13px] text-ink-4"><Separator className="flex-1" />비밀번호 없이 이메일 인증으로 로그인합니다<Separator className="flex-1" /></div>}
          <p className="text-center text-xs leading-[1.6] text-ink-4">회사 메일로 로그인하면 임직원 계정으로 분류됩니다.<br />계속하면 <Link to="/legal/terms" className="pp-hit underline underline-offset-2">이용약관</Link>과 <Link to="/legal/privacy" className="pp-hit underline underline-offset-2">개인정보처리방침</Link>에 동의하는 것입니다.</p>
          <p className="text-sm text-ink-4">{signup ? <>이미 계정이 있으신가요? <Link to={`/login?next=${encodeURIComponent(next)}`} className="pp-hit font-semibold text-ink underline underline-offset-4">로그인</Link></> : <>처음이신가요? <Link to={`/signup?next=${encodeURIComponent(next)}`} className="pp-hit font-semibold text-ink underline underline-offset-4">가입하기</Link></>}</p>
        </div>
      </div>
      {/* 오른쪽 그림 — 디자인 점검 리포트 2026-10-08(시안 06): 그림 + 한 줄 + 모듈 칩 4 */}
      <aside className="relative hidden overflow-hidden bg-ground-3 lg:block" aria-hidden>
        <img src="/img/login-aside-v3.webp" alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white/85 via-white/50 to-transparent px-12 pb-12 pt-24 text-ink dark:from-black/70 dark:via-black/40 dark:text-white">
          <p className="text-2xl font-extrabold leading-[1.4] tracking-[-0.02em]">에셋 · 장표 변환 · 홈페이지 목업 · 디자인 규칙.<br />로그인 한 번으로 전부.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {MODULES.map((m) => <span key={m.id} className="inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-bold text-ink shadow-sm"><BrandName name={m.name} /></span>)}
          </div>
        </div>
      </aside>
    </div>
  );
}
