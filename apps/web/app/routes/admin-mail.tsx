// 관리자 · 메일 서식 — 서비스가 보내는 메일을 유형별로 한 페이지에서 미리 본다(샘플 값으로 그림).
// 서버: api/routes/admin3.php GET /admin/mail/templates (본문은 api/src/Core/MailTemplate.php 하나에서 나온다).
import { SegTabs } from "@/components/hb/seg-tabs";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { AdminTitle } from "@/components/admin/admin-ui";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import type { Route } from "./+types/admin-mail";

export const meta: Route.MetaFunction = () => [{ title: "메일 서식 — powerPlus 관리자" }];

interface MailItem { type: string; group: string; group_label: string; label: string; when: string; subject: string; text: string; html: string }
interface MailTemplates { groups: Record<string, string>; items: MailItem[] }

export default function AdminMail() {
  const q = useQuery({ queryKey: ["admin", "mail-templates"], queryFn: () => apiFetch<MailTemplates>("/admin/mail/templates") });
  const [group, setGroup] = useState("all");
  const [width, setWidth] = useState("pc");
  const [view, setView] = useState("html");
  const groups = q.data?.groups ?? {};
  const items = (q.data?.items ?? []).filter((it) => group === "all" || it.group === group);

  return (
    <div>
      <AdminTitle title="메일 서식" desc={`서비스가 보내는 메일 ${q.data?.items.length ?? 0}종입니다. 샘플 값으로 그렸습니다.`} />
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <SegTabs label="묶음" value={group} onChange={setGroup} items={[{ value: "all", label: "전체" }, ...Object.entries(groups).map(([k, label]) => ({ value: k, label }))]} />
        <div className="ml-auto flex gap-3">
          <SegTabs label="보기" value={view} onChange={setView} items={[{ value: "html", label: "디자인" }, { value: "text", label: "텍스트" }]} />
          <SegTabs label="폭" value={width} onChange={setWidth} items={[{ value: "pc", label: "PC" }, { value: "mobile", label: "모바일" }]} />
        </div>
      </div>

      {q.isLoading && <p className="py-16 text-center text-ink-4">불러오는 중</p>}

      {Object.entries(groups).filter(([k]) => group === "all" || k === group).map(([k, label], gi) => {
        const list = items.filter((it) => it.group === k);
        if (list.length === 0) return null;
        // 묶음마다 접고 펼치기(종합평가 3-1-4) — 첫 묶음만 기본으로 펼친다. 하나만 고르면 그 묶음은 펼친 채로.
        return (
          <Collapsible key={`${group}-${k}`} defaultOpen={gi === 0 || group !== "all"} className="group/mail mt-7">
            <CollapsibleTrigger className="flex min-h-10 w-full items-center gap-2 text-left">
              <h2 className="text-lg font-bold">{label} <span className="ml-1 text-sm font-medium text-ink-4">{list.length}</span></h2>
              <ChevronDown className="ml-auto size-5 shrink-0 text-ink-4 transition-transform group-data-[state=open]/mail:rotate-180" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {/* 모바일은 서식 카드를 한 장씩 넘긴다(세로로 7장이 쌓이면 너무 길다) */}
              <MobileCarousel label={label} className="mt-4 grid gap-6 max-sm:items-start xl:grid-cols-2">
                {list.map((it) => <MailCard key={it.type} it={it} mobile={width === "mobile"} text={view === "text"} />)}
              </MobileCarousel>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

function MailCard({ it, mobile, text, className }: { it: MailItem; mobile: boolean; text: boolean; className?: string }) {
  const [h, setH] = useState(640);
  return (
    <article className={cn("min-w-0 overflow-hidden rounded-xl border border-line", className)}>
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold">{it.label}</h3>
          <span className="text-xs text-ink-4">{it.type}</span>
        </div>
        <p className="mt-1 text-sm text-ink-4">{it.when}</p>
        <p className="mt-2 truncate text-sm"><span className="text-ink-4">제목 </span>{it.subject}</p>
      </div>
      <div className="flex justify-center bg-ground-3 p-4">
        {text ? (
          <pre className="w-full whitespace-pre-wrap break-words rounded-lg bg-ground p-4 font-sans text-sm leading-6" style={{ maxWidth: mobile ? 375 : 600 }}>{it.text}</pre>
        ) : (
          <iframe
            title={`${it.label} 미리보기`}
            srcDoc={it.html}
            sandbox="allow-same-origin"
            className="block rounded-lg bg-white"
            style={{ width: "100%", maxWidth: mobile ? 375 : 600, height: h, border: 0 }}
            onLoad={(e) => {
              const d = e.currentTarget.contentDocument;
              if (d) setH(Math.min(1400, d.documentElement.scrollHeight + 4));
            }}
          />
        )}
      </div>
    </article>
  );
}
