// 채팅 '기본 정보' 카드의 로고 찾기 창 — powerDeck 작업 설정의 LogoSearch 를 그대로 쓴다(같은 로고 목록·같은 창).
// 옛 화면 클래스(field·btn-icon)는 legacy.css 에 있어 이 파일에서만 불러오고, 홈에서는 버튼을 누를 때 늦게 읽는다(lazy).
import "@/styles/material-symbols.css";
import "@/modules/deck/legacy/legacy.css";
import { LogoSearch } from "@/modules/deck/legacy/LogoSearch";

export default function LogoPick({ title, onPick, onClose }: { title: string; onPick: (f: File) => void; onClose: () => void }) {
  return <div className="pd"><LogoSearch title={title} onPick={onPick} onClose={onClose} /></div>;
}
