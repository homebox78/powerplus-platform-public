// 출처: homebox-handoff apps/web/vite.config.ts — base 는 항상 /(서브 도메인 한 개 + 경로 분기, 기획 §0)
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "node:path";

// PHP API: php -S 127.0.0.1:8090 -t api/public
const apiProxy = process.env.VITE_API_PROXY ?? "http://127.0.0.1:8090";

export default defineConfig({
  base: "/",
  // 산출물 폴더는 _app — "assets" 면 /assets 라우트(powerAssets)를 Apache 가 폴더로 받아 403
  build: { assetsDir: "_app" },
  plugins: [tailwindcss(), reactRouter()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "app") } },
  server: {
    port: 5180,
    // X-Forwarded-Host: OAuth 콜백 URL 이 PHP 호스트가 아니라 브라우저 주소로 만들어지게
    proxy: { "/api": { target: apiProxy, changeOrigin: true, headers: { "X-Forwarded-Host": "localhost:5180" } } },
  },
});
