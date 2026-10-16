// 관리자 · 포인트 규칙 — core_point_rules 를 표로 보고 값(지급량·일/연 상한·사용)을 그 자리에서 고친다.
// 서버: api/routes/admin3.php GET/PATCH /admin/point-rules. 부호(적립↔사용)는 바꿀 수 없다. 변경은 감사 기록에 남는다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MBr } from "@/components/hb/copy";
import { AdminTitle, SortHead, useSort } from "@/components/admin/admin-ui";
import { toastError } from "@/components/hb/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchPointRules, patchPointRule, POINT_REASON_KO, type PointRule } from "@/lib/admin";
import type { Route } from "./+types/admin-point-rules";

export const meta: Route.MetaFunction = () => [{ title: "포인트 규칙 — powerPlus 관리자" }];

export default function AdminPointRules() {
  const q = useQuery({ queryKey: ["admin", "point-rules"], queryFn: fetchPointRules });
  const rows = q.data ?? [];
  const st = useSort(rows, { reason: (r) => POINT_REASON_KO[r.reason] ?? r.reason, delta: (r) => r.delta, daily: (r) => r.daily_cap, yearly: (r) => r.yearly_cap, used: (r) => r.used_30, enabled: (r) => r.enabled });
  return (
    <div>
      <AdminTitle title="포인트 규칙" desc="적립·사용 값과 하루·한 해 상한입니다. 바꾼 값은 다음 적립부터 적용됩니다." />
      <div className="mt-7 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SortHead s={st} k="reason">규칙</SortHead>
              <SortHead s={st} k="delta" className="w-[104px] max-sm:w-[84px]">지급량</SortHead>
              <SortHead s={st} k="daily" className="w-[104px] max-sm:hidden">하루 상한</SortHead>
              <SortHead s={st} k="yearly" className="hidden w-[104px] md:table-cell">한 해 상한</SortHead>
              <SortHead s={st} k="used" className="hidden w-[96px] lg:table-cell">30일 건수</SortHead>
              <SortHead s={st} k="enabled" className="w-[72px] max-sm:w-[56px]">사용</SortHead>
              <TableHead className="w-[84px] max-sm:w-[68px]">저장</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((r) => <RuleRow key={r.reason} r={r} />)}
            {q.isLoading && <TableRow><TableCell colSpan={7} className="py-12 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
            {q.data && rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-12 text-center text-ink-4">규칙이 없습니다.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-sm text-ink-4">상한을 비우면 제한이 없습니다.<MBr />음수 지급량은 사용(차감) 규칙입니다.</p>
    </div>
  );
}

function num(v: string): number | null { return v.trim() === "" ? null : Number(v); }

function RuleRow({ r }: { r: PointRule }) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState(String(r.delta));
  const [daily, setDaily] = useState(r.daily_cap == null ? "" : String(r.daily_cap));
  const [yearly, setYearly] = useState(r.yearly_cap == null ? "" : String(r.yearly_cap));
  const dirty = delta !== String(r.delta) || daily !== (r.daily_cap == null ? "" : String(r.daily_cap)) || yearly !== (r.yearly_cap == null ? "" : String(r.yearly_cap));
  const okNum = (s: string, allowEmpty: boolean) => (allowEmpty && s.trim() === "") || /^-?\d+$/.test(s.trim());
  const valid = okNum(delta, false) && okNum(daily, true) && okNum(yearly, true);
  const save = useMutation({
    mutationFn: (b: Parameters<typeof patchPointRule>[1]) => patchPointRule(r.reason, b),
    onSuccess: () => { toast.success(`'${POINT_REASON_KO[r.reason] ?? r.reason}' 규칙을 저장했습니다.`); void qc.invalidateQueries({ queryKey: ["admin", "point-rules"] }); },
    onError: (e) => toastError(e),
  });
  return (
    <TableRow>
      <TableCell className="text-left">
        <span className="block truncate font-semibold">{POINT_REASON_KO[r.reason] ?? r.reason}</span>
        <span className="block truncate text-xs text-ink-4">{r.note ?? r.reason}</span>
      </TableCell>
      <TableCell><Input className="h-9 text-right tabular-nums max-sm:px-2" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} aria-label="지급량" /></TableCell>
      <TableCell className="max-sm:hidden"><Input className="h-9 text-right tabular-nums" inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="없음" aria-label="하루 상한" /></TableCell>
      <TableCell className="hidden md:table-cell"><Input className="h-9 text-right tabular-nums" inputMode="numeric" value={yearly} onChange={(e) => setYearly(e.target.value)} placeholder="없음" aria-label="한 해 상한" /></TableCell>
      <TableCell className="hidden text-right tabular-nums lg:table-cell">{r.used_30.toLocaleString()}</TableCell>
      <TableCell className="text-center"><Switch checked={r.enabled} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ enabled: v })} aria-label="사용" /></TableCell>
      <TableCell className="text-center">
        <Button size="sm" variant="outline" disabled={!dirty || !valid || save.isPending}
          onClick={() => save.mutate({ delta: Number(delta), daily_cap: num(daily), yearly_cap: num(yearly) })}>저장</Button>
      </TableCell>
    </TableRow>
  );
}
