import { Search } from "lucide-react";
import { MBr } from "@/components/hb/copy";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/auth";
import { MODULES } from "@/lib/modules";
import { titleForPath } from "@/lib/page-title";
import type { Route } from "./+types/not-found";

export const meta: Route.MetaFunction = () => [{ title: titleForPath("", true) }, { name: "robots", content: "noindex" }];

// docs/02 §4: 빈 결과·오류는 일러스트 없이 텍스트 + 되돌아갈 버튼.
// 사이트 종합 평가 리포트 4-8(2026-10-09): 막다른 길이 되지 않게 검색칸과 모듈 바로가기 4개를 더했다(기존 문구·홈 버튼은 그대로).
// 탭 제목 "페이지를 찾을 수 없음 — powerPlus"(lib/page-title).
export default function NotFound() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { me, isAdmin } = useMe();
  // 로그인했지만 관리자가 아닌 사람이 /admin 아래로 오면 일반 404 대신 권한 안내(품질 판정 MCK-015)
  if (pathname.startsWith("/admin") && me && !isAdmin) {
    return (
      <div className="container-hb flex flex-col items-center gap-6 py-32 text-center">
        <span className="text-sm font-semibold text-ink-4">403</span>
        <h1 className="text-5xl font-extrabold tracking-[-0.035em]">관리자 권한이 필요합니다</h1>
        <p className="text-md text-ink-4">이 화면은 관리자만 볼 수 있습니다.<MBr />권한이 필요하면 운영자에게 문의하세요.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="md"><Link to="/">홈으로</Link></Button>
          <Button asChild size="md" variant="outline"><Link to="/contact">문의하기</Link></Button>
        </div>
      </div>
    );
  }
  return (
    <div className="container-hb flex flex-col items-center gap-6 py-32 text-center">
      <span className="text-sm font-semibold text-ink-4">404</span>
      <h1 className="text-5xl font-extrabold tracking-[-0.035em]">페이지를 찾을 수 없습니다</h1>
      <p className="text-md text-ink-4">주소가 바뀌었거나 삭제된 페이지입니다.</p>
      <form
        role="search"
        className="flex w-full max-w-md items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
          nav(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
        }}
      >
        <label htmlFor="nf-q" className="sr-only">찾을 내용</label>
        <Input id="nf-q" name="q" placeholder="찾을 내용을 입력하세요" className="h-10 min-w-0 flex-1" />
        <Button type="submit" size="md" variant="outline" className="h-10 shrink-0"><Search aria-hidden />검색</Button>
      </form>
      <nav aria-label="모듈 바로가기" className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
        {MODULES.map((m) => (
          <Link key={m.id} to={m.to} className="flex flex-col items-center gap-1 rounded-panel border border-line px-3 py-4 transition-colors hover:bg-ground-3">
            <m.icon className="size-5" aria-hidden />
            <span className="text-sm font-bold">{m.name}</span>
            <span className="text-xs text-ink-4">{m.sub}</span>
          </Link>
        ))}
      </nav>
      <Button asChild size="md">
        <Link to="/">홈으로</Link>
      </Button>
    </div>
  );
}
