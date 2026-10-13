// 출처: homebox-handoff apps/web/app/routes/legal.tsx — 문서를 이용약관·개인정보처리방침·저작권 정책·이메일 무단수집 거부·수집 로봇 안내 5종으로, 운영 주체 ㈜솔리데오
// 2026-10-07: 문서를 판(버전)별로 관리 — 상단 셀렉터로 지난 판·시행 예정 판을 골라 본다(core_policy_versions, 첫 판은 docs-content.ts).
import { Link, useParams } from "react-router";
import { DocPage } from "@/components/hb/doc-page";
import { PolicyVersionBar, usePolicyDoc } from "@/components/hb/policy-version";
import { Button } from "@/components/ui/button";
import { POLICY_DOCS, type PolicyDocId } from "@/lib/policy";
import type { Route } from "./+types/legal";

const docId = (param: string | undefined): PolicyDocId => (POLICY_DOCS.find((d) => d.id === param)?.id ?? "terms");

export const meta: Route.MetaFunction = ({ params }) => [{ title: `${POLICY_DOCS.find((d) => d.id === docId(params.doc))!.label} — powerPlus` }];

export default function LegalPage() {
  const { doc } = useParams();
  const id = docId(doc);
  const p = usePolicyDoc(id);
  return (
    <DocPage doc={p.spec} meta={<PolicyVersionBar p={p} />}>
      {(id === "copyright" || id === "privacy" || id === "bot") && (
        <div className="mb-12 flex flex-wrap items-center gap-3 rounded-panel bg-ground-3 px-6 py-5">
          <span className="min-w-0 flex-1 text-md">내려야 할 콘텐츠나 개인정보가 보이나요?</span>
          <Button asChild size="sm"><Link to="/contact?topic=removal">삭제요청</Link></Button>
        </div>
      )}
    </DocPage>
  );
}
