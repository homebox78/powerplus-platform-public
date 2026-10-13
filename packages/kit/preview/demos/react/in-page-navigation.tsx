import { InPageNavigation } from "../../../react";

export const meta = {
  id: "in-page-navigation",
  title: "콘텐츠 내 탐색",
  group: "nav",
  source: "krds",
  note: "KRDS 기본은 화면 오른쪽 고정(position=\"fixed\"). 여기서는 문서 안(static)에 두었다. 본문을 스크롤하면 선택이 따라온다.",
};

const SECTIONS = [
  { id: "ipn-overview", label: "서비스 개요", body: "만 18세 미만 등록 장애인 아동의 보호자에게 매월 수당을 지급합니다." },
  { id: "ipn-target", label: "지원 대상", body: "한빛시에 주민등록을 둔 기초생활수급자·차상위계층 가구의 장애 아동이 대상입니다." },
  { id: "ipn-how", label: "신청 방법 및 절차", body: "주소지 행정복지센터를 방문하거나 누리집 「온라인 신청」에서 신청합니다." },
  { id: "ipn-docs", label: "제출 서류", body: "사회보장급여 신청서, 금융정보 제공 동의서, 통장 사본을 준비합니다." },
];

export default function Demo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 200px", gap: 32, alignItems: "start" }}>
      <div>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} style={{ minHeight: 180, paddingBottom: 24 }}>
            <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>{s.label}</h3>
            <p>{s.body}</p>
          </section>
        ))}
      </div>
      <InPageNavigation
        position="static"
        title="장애아동수당"
        items={SECTIONS}
        action={
          <a href="#" className="krds-btn medium primary">
            온라인 신청하기
          </a>
        }
        info={
          <>
            장애아동수당 외 <strong>1건</strong>
          </>
        }
      />
    </div>
  );
}
