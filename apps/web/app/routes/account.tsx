// 출처: homebox-handoff apps/web/app/routes/account.tsx — Actor 응답(user·kind·plan·logins)으로. 기획 §8.1 프로필: 사진·이름(14일 제한)·생일(포인트)·마케팅 동의·연결된 로그인.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Tag } from "@/components/hb/tag";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { PLAN_KO, PROVIDER_KO, useAvatar, useMe, useUpdateMe } from "@/lib/auth";
import { PLANS_UI } from "@/lib/plans-ui";
import type { Route } from "./+types/account";

export const meta: Route.MetaFunction = () => [{ title: "프로필 — powerPlus" }];
const fmt = (s: string | null | undefined) => (s ? s.slice(0, 10).replace(/-/g, ".") : "—");

export default function AccountPage() {
  const { me } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const update = useUpdateMe();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState("");
  const [editBirth, setEditBirth] = useState(false);
  const [birth, setBirth] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [now] = useState(() => Date.now());
  const avatar = useAvatar();
  const logoutAll = useMutation({ mutationFn: () => apiFetch<null>("/auth/logout-all", { method: "POST" }), onSuccess: () => { qc.setQueryData(["me"], undefined); navigate("/"); toast.success("모든 기기에서 로그아웃했습니다."); }, onError: (e) => toastError(e) });
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawText, setWithdrawText] = useState("");
  const del = useMutation({ mutationFn: () => apiFetch<null>("/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: withdrawText.trim() }) }), onSuccess: () => { setWithdrawOpen(false); qc.setQueryData(["me"], undefined); qc.clear(); navigate("/", { replace: true }); toast.success("탈퇴했습니다. 그동안 이용해 주셔서 감사합니다."); }, onError: (e) => toastError(e) });
  if (!me?.user) return null;
  const u = me.user;
  const initial = (u.name ?? u.email ?? "?").trim().charAt(0).toUpperCase();
  const nameLockedUntil = (() => { const t = u.name_changed_at ? new Date(u.name_changed_at).getTime() + 14 * 86400e3 : 0; return t > now ? new Date(t) : null; })();
  const saveBirth = () => update.mutate({ birthday: birth || null }, { onSuccess: () => { setEditBirth(false); toast.success(birth ? "생일을 저장했습니다." : "생일을 지웠습니다."); }, onError: (e) => toastError(e) });
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (f.size > 5 * 1024 * 1024) { toast.error("5MB 이하만 올릴 수 있습니다."); return; } avatar.upload.mutate(f, { onSuccess: () => toast.success("프로필 사진을 바꿨습니다."), onError: (ex) => toastError(ex) }); };
  const saveName = () => update.mutate({ name: name.trim() }, { onSuccess: () => { setEditName(false); toast.success("이름을 바꿨습니다."); }, onError: (e) => toastError(e) });

  return (
    <div>
      <div className="flex items-end gap-4">
        <span className={`flex size-32 items-center justify-center rounded-full text-5xl font-bold text-white ${u.avatar_url ? "" : "overflow-hidden bg-ink"}`}>{u.avatar_url ? <img src={u.avatar_url} alt="" className="size-full rounded-full object-cover" referrerPolicy="no-referrer" /> : initial}</span>
        <div className="flex flex-col gap-3 pb-2">
          {/* 플랜 배지는 PLANS_UI 뒤(2026-10-20 사내 전용 운영 동안 끔) — 임직원·외부 구분은 남긴다 */}
          <div className="flex gap-1.5">{PLANS_UI && <Tag tone="soft">{PLAN_KO[me.plan]}</Tag>}<Tag tone="line">{me.kind === "staff" ? "임직원" : "외부"}</Tag>{me.roles.map((r) => <Tag key={r} tone="line">{r}</Tag>)}</div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" aria-label="프로필 사진 올리기" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={pickFile} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={avatar.upload.isPending}>{avatar.upload.isPending ? "올리는 중…" : "사진 바꾸기"}</Button>
            {u.avatar_url && <Button size="sm" variant="ghost" onClick={() => avatar.remove.mutate(undefined, { onSuccess: () => toast.success("프로필 사진을 지웠습니다."), onError: (e) => toastError(e) })} disabled={avatar.remove.isPending}>지우기</Button>}
          </div>
        </div>
      </div>
      <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.03em]">{u.name ?? "이름 없음"}</h1>
      {u.email && <p className="mt-1 text-md text-ink-3">{u.email}</p>}

      <Section title="개인 정보">
        {editName ? (
          <div className="py-5">
            <div className="flex items-start justify-between gap-4"><div className="text-md font-semibold">이름 수정</div><button type="button" className="text-sm font-semibold hover:underline" onClick={() => setEditName(false)}>취소</button></div>
            <Label htmlFor="acc-name" className="mt-5 block text-sm font-semibold">이름</Label>
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus onKeyDown={(e) => e.key === "Enter" && saveName()} className="mt-2 rounded-chip border-0 bg-ground-3 px-5" />
            <Button size="md" className="mt-5" onClick={saveName} disabled={update.isPending || !name.trim()}>저장</Button>
          </div>
        ) : (
          <Row label="이름" value={u.name ?? "이름 없음"} note={nameLockedUntil ? `${fmt(nameLockedUntil.toISOString())} 부터 다시 바꿀 수 있습니다(14일 제한).` : "바꾼 뒤 14일 동안은 다시 바꿀 수 없습니다."} action={nameLockedUntil ? undefined : <RowAction onClick={() => { setName(u.name ?? ""); setEditName(true); }}>수정</RowAction>} />
        )}
        <Row label="이메일" value={u.email ?? "받지 않음"} note={me.kind === "staff" ? "회사 도메인 이메일이라 임직원으로 분류됩니다." : undefined} />
        <Row label="로그인 수단" value={(me.logins ?? []).map((l) => `${PROVIDER_KO[l.provider] ?? l.provider}${l.email_verified ? "" : " (미검증)"}`).join(" · ") || "—"} />
        {editBirth ? (
          <div className="py-5">
            <div className="flex items-start justify-between gap-4"><div className="text-md font-semibold">생일</div><button type="button" className="text-sm font-semibold hover:underline" onClick={() => setEditBirth(false)}>취소</button></div>
            <Label htmlFor="acc-birth" className="mt-5 block text-sm font-semibold">YYYY-MM-DD</Label>
            <Input id="acc-birth" type="date" value={birth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirth(e.target.value)} className="mt-2 w-[220px] rounded-chip border-0 bg-ground-3 px-5" />
            <div className="mt-5 flex gap-2"><Button size="md" onClick={saveBirth} disabled={update.isPending}>저장</Button>{u.birthday && <Button size="md" variant="ghost" onClick={() => { setBirth(""); saveBirth(); }}>지우기</Button>}</div>
          </div>
        ) : (
          <Row label="생일" value={u.birthday ? fmt(u.birthday) : "입력 안 함"} note="입력해 두면 생일에 포인트가 적립됩니다." action={<RowAction onClick={() => { setBirth(u.birthday ?? ""); setEditBirth(true); }}>{u.birthday ? "수정" : "입력"}</RowAction>} />
        )}
        <Row label="가입일" value={fmt(u.created_at)} />
        <Row label="마지막 로그인" value={fmt((me.logins ?? []).map((l) => l.last_login_at).filter(Boolean).sort().at(-1))} />
        <Row label="API 일 한도" value={me.limits ? (me.limits.api_daily < 0 ? "무제한" : `${me.limits.api_daily.toLocaleString()}회`) : "—"} />
      </Section>

      <Section title="알림·수신">
        <Row label="마케팅 메일 수신" value="새 기능·에셋 소식을 메일로 받습니다. 거래 메일(로그인 코드·영수증)은 이 설정과 무관합니다." action={<Switch checked={u.marketing_opt_in} onCheckedChange={(v) => update.mutate({ marketing_opt_in: v }, { onSuccess: () => toast.success(v ? "수신에 동의했습니다." : "수신을 거부했습니다."), onError: (e) => toastError(e) })} aria-label="마케팅 메일 수신" />} />
      </Section>

      <Section title="계정 관리">
        <Row label="모든 기기에서 로그아웃" value="이 계정으로 로그인된 모든 기기에서 로그아웃합니다." action={<RowAction onClick={() => confirmToast("모든 기기에서 로그아웃할까요?", () => logoutAll.mutate(), { action: "로그아웃" })}>로그아웃</RowAction>} />
        <Row label="회원 탈퇴" value="개인정보는 바로 지워지고, 올린 글·시안은 ‘탈퇴한 사용자’로 남습니다." action={<RowAction danger onClick={() => { setWithdrawText(""); setWithdrawOpen(true); }}>탈퇴</RowAction>} />
      </Section>

      <AlertDialog open={withdrawOpen} onOpenChange={(o) => !del.isPending && setWithdrawOpen(o)}>
        <AlertDialogContent className="max-w-[440px] rounded-panel p-7 sm:max-w-[440px]">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-2xl font-extrabold tracking-[-0.02em]">정말 탈퇴할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-md leading-[1.6] text-ink-3">
                <li>이메일·이름·사진·로그인 연결이 바로 지워집니다.</li>
                <li>{PLANS_UI ? "API·MCP 키가 전부 폐기되고, 포인트·크레딧은 사라집니다." : "API·MCP 키가 전부 폐기되고, 포인트는 사라집니다."}</li>
                <li>올린 글·댓글·시안은 지워지지 않고 ‘탈퇴한 사용자’로 보입니다.</li>
                {PLANS_UI && <li>결제 기록은 전자상거래법에 따라 5년 보관합니다.</li>}
                <li>되돌릴 수 없습니다.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Label htmlFor="acc-withdraw" className="mt-2 block text-sm font-semibold">확인을 위해 ‘탈퇴’를 입력하세요</Label>
          <Input id="acc-withdraw" value={withdrawText} onChange={(e) => setWithdrawText(e.target.value)} autoComplete="off" placeholder="탈퇴" className="rounded-chip border-0 bg-ground-3 px-5" onKeyDown={(e) => e.key === "Enter" && withdrawText.trim() === "탈퇴" && del.mutate()} />
          <AlertDialogFooter className="mt-2 gap-2">
            <AlertDialogCancel disabled={del.isPending}>취소</AlertDialogCancel>
            <Button variant="destructive" disabled={withdrawText.trim() !== "탈퇴" || del.isPending} onClick={() => del.mutate()}>{del.isPending ? "처리하는 중…" : "탈퇴하기"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-9"><h2 className="text-2xl font-bold tracking-[-0.02em]">{title}</h2><div className="mt-4 flex flex-col divide-y divide-line">{children}</div></section>;
}
function Row({ label, value, note, action }: { label: string; value: React.ReactNode; note?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-5">
      <div className="min-w-0"><div className="text-md font-semibold">{label}</div><div className="mt-0.5 truncate text-sm text-ink-3">{value}</div>{note && <div className="mt-0.5 text-xs text-ink-4">{note}</div>}</div>
      {action}
    </div>
  );
}
function RowAction({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`shrink-0 -my-1.5 inline-flex min-h-8 min-w-8 justify-center items-center px-1 text-sm font-semibold hover:underline ${danger ? "text-warn" : "text-ink"}`}>{children}</button>;
}
