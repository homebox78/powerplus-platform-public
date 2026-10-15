import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // public/ 은 빌드된 키트 미리보기·배포 파일(압축 번들) — 소스가 아니라 검사하지 않는다(7천여 건이 lint 를 실패시켰다)
  { ignores: ["build/", ".react-router/", "node_modules/", "app/components/ui/", "public/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // powerDeck 이식 화면(옛 코드 그대로 — UI/UX 불변 원칙). React Compiler 계열 규칙(setState-in-effect·refs·purity)은
    // 옛 패턴(ref 미러·effect 리셋·Date.now 표시)을 그대로 쓰므로 여기서만 경고로 둔다. 새 코드(screens.tsx)는 기본 규칙 그대로.
    files: ["app/modules/deck/legacy/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
);
