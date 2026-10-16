// 옛 powerDeck 해시 주소(#/ · #/list · #/settings · #/admin · #/job/<id>) → 플랫폼 경로.
// 옛 화면 코드가 location.hash 로 이동하던 곳(ui.tsx GlobalContextMenu·Running 오른쪽 메뉴)은 pdGo 를 부르고,
// 모듈 루트(screens.tsx DeckRoot)가 pd:nav 이벤트를 받아 react-router navigate 로 옮긴다.
const pdPath = (h: string): string => {
  const p = h.replace(/^#?\/?/, "");
  if (p.startsWith("job/")) return `/deck/jobs?id=${encodeURIComponent(p.slice(4))}`;
  if (p === "list") return "/deck/jobs";
  if (p === "settings") return "/account/settings/deck";
  if (p === "admin") return "/admin/deck-settings/bill";
  return "/deck/convert";
};
export const pdGo = (h: string) => { window.dispatchEvent(new CustomEvent("pd:nav", { detail: pdPath(h) })); };
