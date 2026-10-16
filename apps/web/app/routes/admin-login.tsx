// 관리자 로그인 — shadcn blocks login-04 구조(사용자 지시 2026-10-06): [좌 폼 카드 | 우 이미지 패널] + 아래 약관 문구.
// 공개 사이트 로그인과 별개 화면이지만 계정 체계는 같다(이메일 OTP·소셜) — 로그인 뒤 역할이 없으면 들어갈 수 없다.
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { GoogleIcon, KakaoIcon, NaverIcon } from "@/components/hb/brand-icons";
import { Copy } from "@/components/hb/copy";
import { EmailLogin } from "@/components/hb/email-login";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { oauthUrl, useLogout, useMe } from "@/lib/auth";
import type { Route } from "./+types/admin-login";

export const meta: Route.MetaFunction = () => [{ title: "관리자 로그인 — powerPlus" }];

export default function AdminLoginPage() {
  const [sp] = useSearchParams();
  const next = sp.get("next") && sp.get("next")!.startsWith("/admin") ? sp.get("next")! : "/admin";
  const { me, isAdmin, hasRole } = useMe();
  const ops = isAdmin || hasRole("curator") || hasRole("support");
  const navigate = useNavigate();
  const logout = useLogout();
  useEffect(() => { if (me && ops) navigate(next, { replace: true }); }, [me, ops, next, navigate]);
  const providers = useQuery({ queryKey: ["auth-providers"], queryFn: () => apiFetch<Array<{ provider: "google" | "naver" | "kakao"; enabled: boolean }>>("/auth/providers"), staleTime: Infinity });
  const on = (p: "google" | "naver" | "kakao") => !!providers.data?.find((x) => x.provider === p && x.enabled);
  const social = on("google") || on("kakao") || on("naver");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ground-2 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6 md:max-w-4xl">
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="flex flex-col gap-6 p-6 md:p-8">
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="mb-1 inline-flex size-10 items-center justify-center rounded-xl bg-ink text-ground"><ShieldCheck className="size-5" aria-hidden /></span>
                <h1 className="text-2xl font-bold">관리자 로그인</h1>
                <p className="text-balance text-sm text-ink-4">운영 계정으로 powerPlus 관리자에 들어갑니다.</p>
              </div>
              {me && !ops ? (
                <>
                  <Alert variant="destructive"><AlertCircle aria-hidden /><AlertDescription><Copy as="span" text={`${me.user?.email} 계정에는 관리자 권한이 없습니다. 권한이 있는 계정으로 다시 로그인해 주세요.`} /></AlertDescription></Alert>
                  <Button size="lg" variant="outline" className="w-full" onClick={() => logout.mutate()}>다른 계정으로</Button>
                </>
              ) : (
                <>
                  <EmailLogin signup={false} onDone={() => navigate(next, { replace: true })} />
                  {social && (
                    <>
                      <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-line"><span className="relative z-10 bg-card px-2 text-ink-4">또는</span></div>
                      <div className="grid grid-cols-3 gap-4">
                        {on("google") && <Button asChild variant="outline" className="w-full"><a href={oauthUrl("google", next)} aria-label="Google로 계속하기"><GoogleIcon className="size-[18px]" /></a></Button>}
                        {on("kakao") && <Button asChild variant="outline" className="w-full"><a href={oauthUrl("kakao", next)} aria-label="카카오로 계속하기"><KakaoIcon className="size-[18px]" /></a></Button>}
                        {on("naver") && <Button asChild variant="outline" className="w-full"><a href={oauthUrl("naver", next)} aria-label="네이버로 계속하기"><NaverIcon className="size-4" /></a></Button>}
                      </div>
                    </>
                  )}
                  <p className="text-center text-sm text-ink-4">관리자가 아니신가요? <Link to="/login" className="pp-hit underline underline-offset-4">사이트 로그인</Link></p>
                </>
              )}
            </div>
            <div className="relative hidden bg-ground-3 md:block">
              {/* 홈 히어로(hero.webp)는 왼쪽 42% 가 글자 자리 빈 면이라 세로 칸에선 빈 면·이음선이 보였다 → 그림 부분만 잘라 쓴다(2026-10-16) */}
              <img src="/img/admin/login-v1.webp" alt="" className="absolute inset-0 size-full object-cover object-[58%_50%] dark:brightness-[0.3] dark:grayscale" />
            </div>
          </CardContent>
        </Card>
        <p className="px-6 text-center text-xs text-balance text-ink-4 [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-ink">
          계속하면 <Link to="/legal/terms">이용약관</Link>과 <Link to="/legal/privacy">개인정보처리방침</Link>에 동의하는 것입니다.
        </p>
      </div>
    </main>
  );
}
