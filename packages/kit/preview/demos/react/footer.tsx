import { Footer } from "../../../react";

export const meta = {
  id: "footer",
  title: "푸터",
  group: "gov",
  source: "krds",
  note: "관련 사이트 버튼을 누르면 목록이 펼쳐진다(Esc 로 닫기). 로고는 logoSrc 이미지, 없으면 기관명 글자.",
};

const FOOTER_DEMO = {
  address: "(00000) 한빛시 한빛로 100 (새솔동) 한빛시청",
  contacts: [
    { label: "대표전화 000-000-0000", note: "평일 09시~18시" },
    { label: "당직실 000-000-0001", note: "야간·휴일" },
  ],
  links: [
    { label: "찾아오시는 길", href: "#map" },
    { label: "누리집 이용안내", href: "#guide" },
    { label: "직원 찾기", href: "#staff" },
  ],
  sns: [
    { type: "youtube" as const, href: "#youtube" },
    { type: "instagram" as const, href: "#instagram" },
    { type: "blog" as const, href: "#blog" },
  ],
  policyLinks: [
    { label: "개인정보처리방침", href: "#privacy", point: true },
    { label: "저작권 정책", href: "#copyright" },
    { label: "웹 접근성 품질인증 마크 획득", href: "#wa" },
  ],
  relatedSites: [
    { title: "관련 기관", links: [{ label: "한빛시의회", href: "#r1" }, { label: "한빛시 교육지원청", href: "#r2" }, { label: "한빛시 시설관리공단", href: "#r3" }] },
    { title: "읍·면·동 누리집", links: [{ label: "새솔동 행정복지센터", href: "#d1" }, { label: "푸른면 행정복지센터", href: "#d2" }] },
    { title: "산하 누리집", links: [{ label: "한빛시립도서관", href: "#s1" }, { label: "한빛문화재단", href: "#s2" }] },
  ],
};

export default function Demo() {
  return (
    <Footer
      orgName="한빛시"
      {...FOOTER_DEMO}
      copyright="© 한빛시. All rights reserved."
      identifier={{ orgName: "한빛시" }}
    />
  );
}
