// 임시 테스트 계정 로그인(아이디·비밀번호) — 서버 /auth/test-login 이 기간 안일 때만 이 칸이 보인다(api/src/Core/TestLogin.php).
// 기간이 끝나면 서버가 404 를 주므로 칸이 저절로 사라진다. 일반 회원 로그인은 이메일·소셜 그대로.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch, postJson } from "@/lib/api";

const field = "h-11 rounded-field border-0 bg-ground-3 px-4 text-md shadow-none";

export function TestLogin({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["test-login"], queryFn: () => apiFetch<{ active: boolean; until: string }>("/auth/test-login"), retry: false, staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!st.data?.active) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await postJson("/auth/test-login", { user, password });
      await qc.invalidateQueries({ queryKey: ["me"] });
      onDone();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : "잠시 뒤에 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full rounded-card border border-line px-4 py-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-sm font-semibold text-ink-3" aria-expanded={open}>
        <span className="flex items-center gap-2"><FlaskConical className="size-4" aria-hidden />테스트 계정으로 로그인</span>
        <span className="text-xs font-normal text-ink-4">{st.data.until.slice(0, 10).replaceAll("-", ".")}까지</span>
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <Input className={field} placeholder="아이디" autoComplete="username" name="test-user" value={user} onChange={(e) => setUser(e.target.value)} />
          <Input className={field} type="password" placeholder="비밀번호" autoComplete="current-password" name="test-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {err && <p className="text-sm text-warn" role="alert">{err}</p>}
          <Button type="submit" size="lg" disabled={busy || !user || !password}>테스트 계정 로그인</Button>
        </form>
      )}
    </div>
  );
}
