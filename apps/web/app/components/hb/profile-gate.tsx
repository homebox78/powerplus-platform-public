// 첫 화면 정보 입력(팀장 2026-10-28): "회원가입 시 이름을 필수로 — 이메일만 있어 누군지 구분이 안 된다.
// 약관 동의 창은 임직원만 쓰는 서비스라 필요 없다. 그 자리에서 이름·닉네임 등 간단한 정보를 입력하고 바로 사용."
// - 예전 가입 동의 창(consent-gate.tsx)이 뜨던 자리(root.tsx)에서 대신 뜬다. 닫을 수 없고, 저장하거나 로그아웃만 할 수 있다.
// - 뜨는 조건은 서버가 정한다(/me 의 profile.required — Profile::status: 이름이 비었거나 '사용자'·이메일 앞부분이고 아직 저장 전).
//   소셜 로그인으로 이름이 이미 들어온 사람에게는 뜨지 않는다. 서버도 저장 전에는 로그인 기능을 428 PROFILE_REQUIRED 로 막는다.
// - 처리 방침 문서(/legal/*)를 읽는 동안에는 띄우지 않는다(링크는 새 창).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toastError } from "@/components/hb/confirm";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJson } from "@/lib/api";
import { useLogout, useMe } from "@/lib/auth";

// 서버 Profile 상수와 같은 값
const NAME_MIN = 2;
const NAME_MAX = 20;
const NICK_MAX = 20;
const DEPT_MAX = 40;

export function ProfileGate() {
  const { me } = useMe();
  const { pathname } = useLocation();
  if (!me || me.via !== "session" || pathname.startsWith("/legal")) return null;
  // 순서: 이름 입력 → (이용 대상이 아니면) 임직원 전용 안내
  if (me.profile?.required) return <ProfileDialog email={me.user?.email ?? ""} nickname={me.profile?.nickname ?? ""} dept={me.profile?.dept ?? ""} />;
  // 문의하기 화면에서는 안내 창을 띄우지 않는다(문의를 보낼 수 있게)
  if (me.access?.staff_only && !pathname.startsWith("/contact")) return <StaffOnlyDialog expired={me.access.reason === "STAFF_EXPIRED"} />;
  return null;
}

// 임직원 전용 안내(팀장 2026-10-28): 외부·Free 회원은 로그인은 되지만 쓸 수 없다. 닫을 수 없고 로그아웃·문의만.
// 서버도 같은 사람을 403 STAFF_ONLY 로 막는다(Access::staffOnlyBlocks).
function StaffOnlyDialog({ expired }: { expired: boolean }) {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-[440px] rounded-panel p-7 sm:max-w-[440px]" onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="text-2xl font-extrabold tracking-[-0.02em]">임직원 전용 서비스입니다</AlertDialogTitle>
          <AlertDialogDescription className="text-md leading-[1.6] text-ink-3">
            현재 powerPlus 는 임직원만 이용할 수 있습니다.<br />(Pro 이상 이용권이 있으면 이용 가능)
          </AlertDialogDescription>
        </AlertDialogHeader>
        {expired && <p className="text-sm leading-[1.6] text-ink-4">임직원 이용 기간이 끝났습니다. 관리자에게 연장을 요청해 주세요.</p>}
        <AlertDialogFooter className="mt-2 gap-2 sm:justify-between">
          <Button variant="ghost" size="md" disabled={logout.isPending} onClick={() => logout.mutate()}>로그아웃</Button>
          <Button size="md" onClick={() => void navigate("/contact")}>문의하기</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProfileDialog({ email, nickname, dept }: { email: string; nickname: string; dept: string }) {
  const qc = useQueryClient();
  const logout = useLogout();
  const [v, setV] = useState({ name: "", nickname, dept });
  const name = v.name.trim();
  const nameOk = name.length >= NAME_MIN && name.length <= NAME_MAX;
  const [touched, setTouched] = useState(false);
  const save = useMutation({
    mutationFn: () => postJson("/me/profile", { name, nickname: v.nickname.trim(), dept: v.dept.trim() }),
    onSuccess: () => { void qc.invalidateQueries(); },
    onError: (e) => toastError(e),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameOk && !save.isPending) save.mutate();
  };

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-[440px] rounded-panel p-7 sm:max-w-[440px]" onEscapeKeyDown={(e) => e.preventDefault()}>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-2xl font-extrabold tracking-[-0.02em]">처음 오셨네요</AlertDialogTitle>
            <AlertDialogDescription className="text-md leading-[1.6] text-ink-3">
              누가 쓰는지 알 수 있게 이름을 알려 주세요.<br />저장하면 바로 쓸 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {email && <p className="-mt-2 truncate text-sm text-ink-4">{email}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-name"><span className="font-semibold text-point-ink">[필수]</span> 이름</Label>
            <Input id="pf-name" value={v.name} autoFocus autoComplete="name" maxLength={NAME_MAX} placeholder="홍길동"
              aria-invalid={touched && !nameOk} aria-describedby="pf-name-help"
              onChange={(e) => setV((o) => ({ ...o, name: e.target.value }))} onBlur={() => setTouched(true)} />
            <p id="pf-name-help" className={touched && !nameOk ? "text-sm text-destructive" : "text-sm text-ink-4"}>
              {NAME_MIN}~{NAME_MAX}자. 실제 이름을 적어 주세요.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-nick"><span className="font-semibold text-ink-4">[선택]</span> 닉네임</Label>
            <Input id="pf-nick" value={v.nickname} maxLength={NICK_MAX} autoComplete="nickname" onChange={(e) => setV((o) => ({ ...o, nickname: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-dept"><span className="font-semibold text-ink-4">[선택]</span> 소속·부서</Label>
            <Input id="pf-dept" value={v.dept} maxLength={DEPT_MAX} autoComplete="organization-title" placeholder="예: 디자인팀" onChange={(e) => setV((o) => ({ ...o, dept: e.target.value }))} />
          </div>

          <AlertDialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" size="md" disabled={logout.isPending} onClick={() => logout.mutate()}>로그아웃</Button>
            <Button type="submit" size="md" disabled={save.isPending}>{save.isPending ? "저장하는 중…" : "저장하고 시작하기"}</Button>
          </AlertDialogFooter>

          <p className="text-xs leading-[1.6] text-ink-4">
            적은 정보는 서비스 안에서 사용자를 알아보는 데만 씁니다.{" "}
            <Link to="/legal/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">개인정보 처리방침</Link>
            {" · "}
            <Link to="/legal/terms" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">이용약관</Link>
          </p>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
