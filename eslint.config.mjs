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
    // Agent worktrees are whole checkouts of this repo, node_modules and all,
    // that happen to live inside it. Without this, one running agent turns
    // `npm run lint` into twenty thousand findings from its dependencies.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
