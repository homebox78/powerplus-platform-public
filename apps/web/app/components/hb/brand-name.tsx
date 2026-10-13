// 서비스 이름 표기 — "power" 는 글자색 그대로, 뒤 영문(Plus·Assets·Deck·Mock·Guide·MCP)만 강조 주황(사용자 2026-10-06). 주황은 챗봇 아이콘과 같은 #E46B37 하나로 통일(사용자 2026-10-13).
// 제목·강조 자리의 솔루션 이름은 어디서든 타이틀 글꼴(Momo Trust Display)로 쓴다(사용자 2026-10-07) — 그래서 글꼴을 이 부품이 직접 건다.
// 본문 글줄·메뉴 링크에는 쓰지 않는다(강조색은 중요한 곳에만).
export function BrandName({ name }: { name: string }) {
  if (!name.startsWith("power")) return <>{name}</>;
  return <span className="pp-module-title">power<span className="text-point-ink">{name.slice(5)}</span></span>;
}
