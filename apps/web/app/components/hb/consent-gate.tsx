// 가입 동의 화면(기획 §17.1·§17.3 사내 출시 전 필수): 만 14세 이상 확인 + 동의 4분리.
// 이용약관·개인정보 수집·이용·국외 이전(OpenRouter AI 처리)은 필수, 마케팅 수신은 선택(기본 해제).
// 처음 가입한 사람과 아직 동의하지 않은 기존 사용자에게 로그인 직후 한 번 뜬다. 닫을 수 없고, 동의하거나 로그아웃만 할 수 있다.
// 약관·방침 문서(/legal/*)를 읽는 동안에는 띄우지 않는다(링크는 새 창).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { toastError } from "@/components/hb/confirm";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { postJson } from "@/lib/api";
import { useLogout, useMe } from "@/lib/auth";

type Key = "age14" | "terms" | "privacy" | "overseas" | "marketing";
const ITEMS: Array<{ key: Key; label: string; required: boolean; doc?: string; note?: string }> = [
  { key: "age14", label: "만 14세 이상입니다", required: true },
  { key: "terms", label: "이용약관에 동의합니다", required: true, doc: "/legal/terms" },
  { key: "privacy", label: "개인정보 수집·이용에 동의합니다", required: true, doc: "/legal/privacy" },
  { key: "overseas", label: "개인정보 국외 이전에 동의합니다", required: true, doc: "/legal/privacy#entrust", note: "AI 처리를 위해 요청 글과 올린 파일 내용이 OpenRouter(미국)로 전달됩니다." },
  { key: "marketing", label: "새 기능·에셋 소식 메일을 받습니다", required: false, note: "로그인 코드·영수증 같은 거래 메일은 이 선택과 상관없이 보냅니다." },
];
const REQUIRED = ITEMS.filter((i) => i.required).map((i) => i.key);

export function ConsentGate() {
  const { me } = useMe();
  const { pathname } = useLocation();
  const [now] = useState(() => Date.now());
  const open = !!me?.consent?.required && me.via === "session" && !pathname.startsWith("/legal");
  if (!open) return null;
  // 가입한 지 하루 넘은 사람 = 기존 사용자(약관 판이 바뀌었거나 이 기능 이전 가입) — 제목만 다르게
  return <ConsentDialog key={me.consent?.version} returning={!!me.user?.created_at && Date.parse(me.user.created_at) < now - 86400e3} />;
}

function ConsentDialog({ returning }: { returning: boolean }) {
  const qc = useQueryClient();
  const logout = useLogout();
  const [v, setV] = useState<Record<Key, boolean>>({ age14: false, terms: false, privacy: false, overseas: false, marketing: false });
  const all = ITEMS.every((i) => v[i.key]);
  const ready = REQUIRED.every((k) => v[k]);
  const save = useMutation({
    mutationFn: () => postJson("/me/consents", v),
    onSuccess: () => { void qc.invalidateQueries(); },
    onError: (e) => toastError(e),
  });

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-[480px] rounded-panel p-7 sm:max-w-[480px]" onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="text-2xl font-extrabold tracking-[-0.02em]">{returning ? "약관 동의가 필요합니다" : "powerPlus 시작하기"}</AlertDialogTitle>
          <AlertDialogDescription className="text-md leading-[1.6] text-ink-3">
            필수 항목에 동의하면 바로 이용할 수 있습니다.<br />선택 항목은 마이페이지에서 언제든 바꿀 수 있습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-card bg-ground-3 px-5 py-4 text-md font-bold">
          <Checkbox checked={all} onCheckedChange={(c) => setV(Object.fromEntries(ITEMS.map((i) => [i.key, !!c])) as Record<Key, boolean>)} aria-label="전체 동의" />
          전체 동의(선택 포함)
        </label>
        <ul className="flex flex-col divide-y divide-line">
          {ITEMS.map((i) => (
            <li key={i.key} className="flex items-start gap-3 py-3.5">
              <Checkbox id={`consent-${i.key}`} className="mt-0.5" checked={v[i.key]} onCheckedChange={(c) => setV((o) => ({ ...o, [i.key]: !!c }))} />
              <div className="min-w-0 flex-1">
                <label htmlFor={`consent-${i.key}`} className="cursor-pointer text-md">
                  <span className={i.required ? "font-semibold text-point-ink" : "font-semibold text-ink-4"}>[{i.required ? "필수" : "선택"}]</span> {i.label}
                </label>
                {i.note && <p className="mt-0.5 text-sm leading-[1.6] text-ink-4">{i.note}</p>}
              </div>
              {i.doc && <Link to={i.doc} target="_blank" rel="noreferrer" className="shrink-0 text-sm text-ink-3 underline underline-offset-4 hover:text-ink">보기</Link>}
            </li>
          ))}
        </ul>

        <AlertDialogFooter className="mt-2 gap-2 sm:justify-between">
          <Button variant="ghost" size="md" disabled={logout.isPending} onClick={() => logout.mutate()}>로그아웃</Button>
          <Button size="md" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "저장하는 중…" : "동의하고 시작하기"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
