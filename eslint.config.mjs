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
  {
    // 🔴🔴 `notifySlack()` を投げっぱなしにさせない。
    //
    // **AWS Lambda はハンドラが返ると実行環境をフリーズする**ので、未完了の fetch は
    // そこで止まり、次の呼び出しが来るまで再開しない（＝通知が遅延し、次が来なければ失われる）。
    // 2026-08-08 に本番のテスト通知が**数分遅れて届いた**ことで実際に観測された。
    // Vercel（fluid compute）では顕在化しなかった＝ **AWS 移行で生まれたリスク**。
    //
    // 🔑 **型情報の要る `no-floating-promises` は使わない。** 有効にすると repo 全体に
    // 波及し、soak 中に無関係な変更が大量に出る。ここは**再発した1点だけ**を塞ぐ。
    // 📌 `await notifySlack(...)` は AST 上 `AwaitExpression` を挟むので、この選択子には当たらない。
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ExpressionStatement > CallExpression[callee.name='notifySlack']",
          message:
            "notifySlack() は await すること。Lambda はハンドラが返ると凍るため、投げっぱなしだと通知が飛びません（src/lib/slackNotify.ts 参照）。",
        },
        {
          selector:
            "ExpressionStatement > UnaryExpression[operator='void'] > CallExpression[callee.name='notifySlack']",
          message:
            "void notifySlack() は不可。await すること（Lambda のフリーズで通知が失われます）。",
        },
      ],
    },
  },
]);

export default eslintConfig;
