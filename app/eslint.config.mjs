import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import {
  cleanCodeBaseRules,
  cleanCodeTypeScriptRules,
  cleanCodeTypeAwareRules,
  cleanCodeServerClientRules,
  cleanCodeUiPrimitiveRules,
  cleanCodeInfraRules,
  cleanCodeTailwindRules,
} from "./clean-code-rules.mjs";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
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
    // Type-aware linting, scoped to app source (excludes config/script files
    // outside the tsconfig `include`). Enables cleanCodeTypeAwareRules:
    // no-floating-promises, and no-deprecated (e.g. @phosphor-icons/react's
    // bare `Camera` export).
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: cleanCodeTypeAwareRules.rules,
  },
  {
    // Tailwind canonical-class check — see clean-code-lint skill.
    files: ["src/**/*.tsx"],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: {
      "better-tailwindcss": { entryPoint: "src/app/globals.css" },
    },
    rules: cleanCodeTailwindRules.rules,
  },
  {
    // A leading underscore is TypeScript's own convention for a binding that
    // is deliberately unused — most often a parameter an interface requires
    // but a given implementation ignores (MockQuantityProvider.estimateGrams,
    // MockOcrProvider). The parameter cannot be deleted without breaking the
    // interface, so the convention is the fix and the linter should honour it.
    // Configured here rather than in the vendored file, which stays a verbatim
    // copy of the canonical rules so it can be re-copied when those change.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Test-file carve-out for no-magic-numbers: in an assertion the literal
    // IS the meaning. `expect(grams).toBe(184)` says exactly what it checks;
    // hoisting 184 to EXPECTED_GRAMS adds a hop and hides the value the test
    // exists to pin.
    //
    // Deliberately narrow: every other Clean Code rule still applies to tests,
    // including no-empty (never swallow an error) and the default-export ban.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
    },
  },
  {
    // Rule 17 (server/client boundary isolation) only makes sense for UI
    // code — scoped to src/app, never bare-spread, so it doesn't flag
    // legitimate server-side imports in scripts/config files outside the UI tree.
    files: ["src/app/**"],
    rules: cleanCodeServerClientRules.rules,
  },
  {
    // Rule 20: components/ui/ is dumb presentational primitives — no
    // business logic, no imports from features/. Scoped to ui/ specifically
    // (not all of src/components), since components/layout/ (global chrome)
    // is allowed to compose feature components, e.g. AppHeader -> AccountMenu.
    files: ["src/components/ui/**"],
    rules: cleanCodeUiPrimitiveRules.rules,
  },
  {
    // Rule 20: lib/ is shared infra — must not import from features/ or app/.
    // Dependencies point one direction: features/app depend on lib, never
    // the reverse.
    files: ["src/lib/**"],
    rules: cleanCodeInfraRules.rules,
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
