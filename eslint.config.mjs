import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // AWS 移行（OpenNext / SST）のビルド成果物とベンダーコード。
    // 自分たちが書いたコードではないうえ巨大で、lint するとノイズと時間だけが増える。
    ".open-next/**",
    ".sst/**",
    // SST がデプロイのたびに再生成する型定義（gitignore 済み・ローカルにだけ存在する）
    "sst-env.d.ts",
  ]),
]);

export default eslintConfig;
