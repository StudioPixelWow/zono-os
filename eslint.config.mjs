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
  ]),
  // ── Batch 6.6A boundary (C2/C9): the Personal transport ADAPTER internals
  //    (adapter + Evolution compat layer) may be imported ONLY from within
  //    src/lib/whatsapp/provider/. Everything else must consume the neutral
  //    action/health/transport surface — never the Evolution-aware internals.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/whatsapp/provider/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: [
              "@/lib/whatsapp/provider/personal/adapter",
              "@/lib/whatsapp/provider/personal/compat",
              "@/lib/whatsapp/provider/personal/compat/*",
              "**/provider/personal/adapter",
              "**/provider/personal/compat",
              "**/provider/personal/compat/*",
            ],
            message: "Evolution-aware internals are off-limits here. Use the neutral personal actions/health/transport surface; only src/lib/whatsapp/provider/ may reach the adapter/compat.",
          },
        ],
      }],
    },
  },
]);

export default eslintConfig;
