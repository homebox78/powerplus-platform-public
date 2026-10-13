// 공지사항은 커뮤니티 공지 게시판 하나로 통일(사용자 2026-10-07). 옛 주소 /notice·/changelog 는 그쪽으로 보낸다.
import { Navigate } from "react-router";

export default function NoticeRedirect() {
  return <Navigate to="/community?c=notice" replace />;
}
