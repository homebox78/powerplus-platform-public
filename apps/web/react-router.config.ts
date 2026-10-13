import type { Config } from "@react-router/dev/config";

// SPA 모드: Node SSR 서버를 두지 않는다. 공개 페이지 meta 는 PHP 가 index.html <head> 에 주입(홈박스 방식 승계)
export default {
  ssr: false,
  basename: "/",
} satisfies Config;
