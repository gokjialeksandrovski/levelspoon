import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import {
  cleanCodeBaseRules,
  cleanCodeTypeScriptRules,
  cleanCodeServerClientRules,
} from "./clean-code-rules.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  // Clean Code Principles (~/.claude/CLAUDE.md), mechanically enforced.
  // Vendored copy: ./clean-code-rules.mjs — see clean-code-lint skill.
  cleanCodeBaseRules,
  cleanCodeTypeScriptRules,
  {
    // Rule 17 (server/client boundary isolation) only makes sense for UI
    // code — scoped to src/app, never bare-spread, so it doesn't flag
    // legitimate server-side imports in scripts/config files outside the UI tree.
    files: ["src/app/**"],
    rules: cleanCodeServerClientRules.rules,
  },
  {
    // Default-export carve-out: Next.js framework entry points require a
    // default export. Files here could be either a Server or Client
    // Component (ESLint can't see the 'use client' directive), so they
    // still get the import-ban check above — only the export rule is lifted.
    files: [
      "**/page.tsx",
      "**/layout.tsx",
      "**/template.tsx",
      "**/loading.tsx",
      "**/error.tsx",
      "**/not-found.tsx",
      "**/global-error.tsx",
      "**/default.tsx",
      "**/global-not-found.tsx",
      "**/route.ts",
      "**/middleware.ts",
      "**/instrumentation.ts",
      "**/sitemap.ts",
      "**/robots.ts",
      "**/opengraph-image.tsx",
      "**/twitter-image.tsx",
      "**/icon.tsx",
      "**/apple-icon.tsx",
      "next.config.*",
      "tailwind.config.*",
      "postcss.config.*",
      "eslint.config.*",
      "playwright.config.*",
      "vitest.config.*",
      "jest.config.*",
      "drizzle.config.*",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Import-ban carve-out: the subset of the above that's unambiguously
    // server-only (never a client component) — route handlers, middleware,
    // config files. page.tsx/layout.tsx/etc. deliberately stay OUT of this
    // block since they could still be Client Components.
    files: [
      "**/route.ts",
      "**/middleware.ts",
      "**/instrumentation.ts",
      "**/sitemap.ts",
      "**/robots.ts",
      "**/opengraph-image.tsx",
      "**/twitter-image.tsx",
      "**/icon.tsx",
      "**/apple-icon.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
