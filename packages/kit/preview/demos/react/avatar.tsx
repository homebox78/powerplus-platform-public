import { Avatar, AvatarFallback, AvatarImage } from "../../../react";

export const meta = { id: "avatar", title: "아바타", group: "action", source: "shadcn", note: "사진 · 사진을 못 불러오면 대체 글자 · 크기 4종 · 둥근 사각" };

// 가상 인물 그림(외부 파일 없이 열리게 SVG 를 그대로 넣는다)
const PERSON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#d6e4fb"/><circle cx="40" cy="31" r="15" fill="#5a7fc2"/><path d="M12 80c2-18 14-28 28-28s26 10 28 28z" fill="#5a7fc2"/></svg>',
  );

export default function Demo() {
  return (
    <div className="pv-row">
      <Avatar size="small"><AvatarImage src={PERSON} alt="민원 담당 주무관" /><AvatarFallback>민</AvatarFallback></Avatar>
      <Avatar><AvatarImage src={PERSON} alt="복지 담당 주무관" /><AvatarFallback>복</AvatarFallback></Avatar>
      <Avatar size="large"><AvatarImage src={PERSON} alt="한빛시장" /><AvatarFallback>한</AvatarFallback></Avatar>
      <Avatar size="xlarge" shape="rounded"><AvatarImage src={PERSON} alt="한빛시 부시장" /><AvatarFallback>부</AvatarFallback></Avatar>
      <Avatar size="large" aria-label="담당자 이수민"><AvatarImage src="no-photo.jpg" alt="" /><AvatarFallback>이수</AvatarFallback></Avatar>
      <Avatar size="large" aria-label="담당자 박정우"><AvatarFallback>박</AvatarFallback></Avatar>
    </div>
  );
}
