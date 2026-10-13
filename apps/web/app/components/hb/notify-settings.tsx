// 마이페이지 설정 › 알림 — 메일로 받을 종류를 고른다(사용자 2026-10-07 "기다리지 않아도 알 수 있게").
// 사이트 알림(우측 상단 종·토스트)은 항상 오고, 메일만 종류별로 끄고 켠다. 서버: /notifications/prefs.
import { Switch } from "@/components/ui/switch";
import { Copy } from "@/components/hb/copy";
import { useNotifyPrefs } from "@/lib/community";
import { toastError } from "@/components/hb/confirm";

export function NotifySettingsScreen() {
  const { q, save } = useNotifyPrefs();
  const items = q.data?.items ?? [];
  const set = (id: string, on: boolean) => {
    const mail = Object.fromEntries(items.map((i) => [i.id, i.id === id ? on : i.mail]));
    save.mutate(mail, { onError: (e) => toastError(e) });
  };
  return (
    <div className="max-w-[720px]">
      <div className="rounded-2xl border border-line p-5">
        <p className="text-sm font-bold">사이트 알림은 항상 옵니다</p>
        <Copy className="mt-1 text-sm text-ink-3" text="사이트에 들어와 있으면 우측 상단 종과 알림 창으로 바로 알려 드립니다. 아래는 메일로도 받을 종류입니다." />
        {q.data?.email && <p className="mt-2 text-sm text-ink-4">받는 메일 · {q.data.email}</p>}
      </div>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-md font-bold">{i.label}</p>
              <p className="mt-0.5 text-sm text-ink-3">{i.desc}</p>
            </div>
            <Switch checked={i.mail} disabled={save.isPending} onCheckedChange={(v) => set(i.id, v)} aria-label={`${i.label} 메일 받기`} />
          </li>
        ))}
        {q.isLoading && <li className="px-5 py-4 text-sm text-ink-4">불러오는 중…</li>}
      </ul>
    </div>
  );
}
