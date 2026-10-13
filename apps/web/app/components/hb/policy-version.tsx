// 정책 문서 버전 고르기 — 이용약관·개인정보처리방침 등 상단 "최종 수정일" 자리.
// 주소 ?v=1.1 로 판을 고정해 링크로 나눌 수 있다. 지난 판을 보면 "현재 판 보기" 안내가 뜬다.
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { DocSpec } from "@/components/hb/doc-page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { baseVersion, fetchPolicy, fmtDate, mergeVersions, type PolicyDocId, type ShownVersion } from "@/lib/policy";

const STATUS: Record<ShownVersion["status"], string> = { current: "현재", past: "", upcoming: "시행 예정" };

export function usePolicyDoc(doc: PolicyDocId) {
  const [sp, setSp] = useSearchParams();
  const q = useQuery({ queryKey: ["policy", doc], queryFn: () => fetchPolicy(doc), staleTime: 60_000 });
  const [localToday] = useState(() => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
  const today = q.data?.today ?? localToday;
  const versions = mergeVersions(doc, q.data?.versions ?? [], today);
  const want = sp.get("v");
  const shown = versions.find((v) => v.version === want) ?? versions.find((v) => v.status === "current") ?? versions[0] ?? { ...baseVersion(doc), status: "current" as const };
  const current = versions.find((v) => v.status === "current");
  const choose = (version: string) => {
    const next = new URLSearchParams(sp);
    if (version === current?.version) next.delete("v"); else next.set("v", version);
    setSp(next, { replace: true, preventScrollReset: true });
  };
  const spec: DocSpec = useMemo(() => ({ ...shown.spec, updated: fmtDate(shown.effective_on) }), [shown.spec, shown.effective_on]);
  return { versions, shown, current, choose, spec, loading: q.isLoading };
}

export function PolicyVersionBar({ p }: { p: ReturnType<typeof usePolicyDoc> }) {
  const { versions, shown, current, choose } = p;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="text-sm text-ink-4">시행일 {fmtDate(shown.effective_on)}</span>
      <Select value={shown.version} onValueChange={choose}>
        <SelectTrigger size="sm" className="h-9 min-w-[220px]" aria-label="문서 버전">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.version} value={v.version}>
              버전 {v.version} · {fmtDate(v.effective_on)}{STATUS[v.status] ? ` (${STATUS[v.status]})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {shown.status !== "current" && current && (
        <span className="text-sm text-ink-3">
          {shown.status === "past" ? "지난 판입니다." : "아직 시행 전인 판입니다."}{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => choose(current.version)}>현재 판 보기</button>
        </span>
      )}
      {shown.summary && shown.id !== "base" && <p className="w-full text-sm text-ink-3">바뀐 점: {shown.summary}</p>}
    </div>
  );
}
