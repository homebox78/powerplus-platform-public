// 삭제요청은 문의 폼의 한 종류가 됐다(사용자 지시 2026-10-06) — 옛 주소·정책 링크는 /contact?topic=removal 로 보낸다. ?url= 은 그대로 넘긴다.
import { Navigate, useSearchParams } from "react-router";

export default function RemovalRedirect() {
  const [sp] = useSearchParams();
  const url = sp.get("url");
  return <Navigate to={`/contact?topic=removal${url ? `&url=${encodeURIComponent(url)}` : ""}`} replace />;
}
