import { Link, Separator } from "../../../react";

export const meta = { id: "separator", title: "구분선", group: "action", source: "shadcn", note: "가로·세로 · 꾸밈(기본, 스크린리더 무시) · 뜻이 있는 구분" };

export default function Demo() {
  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ fontWeight: 700 }}>한빛시 민원 안내</p>
      <p>평일 09:00 ~ 18:00 (점심시간 12:00 ~ 13:00)</p>
      <Separator style={{ margin: "16px 0" }} decorative={false} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, height: 24 }}>
        <Link href="#separator" tone="basic" underline="none" size="small">이용약관</Link>
        <Separator orientation="vertical" />
        <Link href="#separator" tone="basic" underline="none" size="small">개인정보처리방침</Link>
        <Separator orientation="vertical" />
        <Link href="#separator" tone="basic" underline="none" size="small">찾아오시는 길</Link>
      </div>
    </div>
  );
}
