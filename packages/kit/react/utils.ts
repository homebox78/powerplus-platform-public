import * as React from "react";

// 클래스 이어 붙이기 (falsy 는 버린다)
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// 접근성 id 짝(버튼 ↔ 패널)을 만들 때 쓰는 고유 접두어
let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

// 렌더 중 id — SSR(Next.js)에서 서버·브라우저 id 가 같아야 하이드레이션이 맞는다 → React.useId
export function useUid(prefix: string): string {
  return `${prefix}-${React.useId().split(":").join("")}`;
}

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
