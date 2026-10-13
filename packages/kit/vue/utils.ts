import { useId } from "vue";
let seq = 0;
export const uid = (p: string) => `${p}-${++seq}`;

// setup 안에서 부른다 — SSR(Nuxt)에서 서버·브라우저 id 가 같게 Vue 3.5 useId 를 쓴다
export const useUid = (p: string) => `${p}-${useId()}`;

// 받침 따라 조사 고르기 (예: 복지를 / 청년을)
export function josa(word: string, withBatchim: string, without: string): string {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return `${without}`;
  return (c - 0xac00) % 28 ? withBatchim : without;
}

// 태그 삭제 뒤 포커스·알림 (KRDS 태그 지침) — React·Vue 가 같은 규칙을 쓴다.
//   눌린 삭제 버튼이 실제로 사라지면: 다음 태그 삭제 버튼 → 없으면 이전 → 둘 다 없으면 묶음으로 포커스,
//   묶음 안 알림 칸(.hb-tag-live)에 "○○을 삭제했습니다" 를 넣는다.
export function afterTagRemove(btn: HTMLElement, name: string) {
  const group = btn.closest(".krds-tag-wrap") as HTMLElement | null;
  const all = group ? Array.from(group.querySelectorAll<HTMLElement>(".btn-delete")) : [];
  const i = all.indexOf(btn);
  const next = i >= 0 ? all[i + 1] : undefined;
  const prev = i > 0 ? all[i - 1] : undefined;
  setTimeout(() => {
    if (btn.isConnected) return; // 지우지 않았으면 그대로 둔다
    const target = (next?.isConnected && next) || (prev?.isConnected && prev) || null;
    if (target) target.focus();
    else if (group?.isConnected) {
      if (!group.hasAttribute("tabindex")) group.setAttribute("tabindex", "-1");
      group.focus();
    }
    const live = group?.querySelector<HTMLElement>(".hb-tag-live");
    if (live && name) {
      live.textContent = "";
      setTimeout(() => (live.textContent = `${name}${josa(name, "을", "를")} 삭제했습니다`), 50);
    }
  }, 0);
}
