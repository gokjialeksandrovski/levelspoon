/**
 * Canonical ESLint rules for the Clean Code Principles in ~/.claude/CLAUDE.md.
 *
 * Source of truth — edit here. Each project keeps a VENDORED COPY of this
 * file committed to its own repo (not a cross-machine import — that breaks
 * `pnpm lint`/CI for anyone without this exact ~/.claude path, confirmed via
 * /code-review on westprint-app). When this file changes, re-copy it into
 * every project that has wired it in — see the clean-code-lint skill.
 *
 * Only the mechanically-checkable rules from CLAUDE.md are encoded here.
 * Judgment-based rules (SRP, SLA, Law of Demeter, Boy Scout, YAGNI, naming
 * quality, colocation) aren't lintable and stay enforced via self-review /
 * `/code-review` against CLAUDE.md instead — see the clean-code-lint skill.
 *
 * Severity policy: 'error' for violations that are unambiguous and
 * genuinely risky (empty catch, stray default exports, deprecated-API
 * usage). Everything else more stylistic/subjective (magic numbers,
 * func-style, complexity/nesting) stays 'warn' so first-time adoption on an
 * existing codebase doesn't hard-block on day one. The Stop hook only
 * blocks on 'error'-level findings (ESLint's own exit-code behavior), so
 * this severity split IS the enforcement policy, not just cosmetics.
 *
 * Rule 6 was previously enforced via max-lines-per-function (raw line
 * count, 'error'). Replaced 2026-09-17: cyclomatic complexity and nesting
 * depth predict how hard a function is to read far better than line count
 * — a long flat function beats a short deeply-nested one — and both stay
 * 'warn' (soft) rather than a hard error, so a function doesn't need an
 * artificial split just to clear a line-count cutoff.
 */

// Base rules: core ESLint only, safe for any JS or TS project.
export const cleanCodeBaseRules = {
  rules: {
    // Rule 6: cyclomatic complexity and nesting depth, not raw line count.
    complexity: ['warn', 10],
    'max-depth': ['warn', 4],
    'max-nested-callbacks': ['warn', 3],

    // Rule 14: arrow functions only, no `function` keyword.
    'func-style': ['warn', 'expression', { allowArrowFunctions: true }],

    // Rule 5: named exports only. Exceptions (page.tsx, layout.tsx,
    // route.ts, etc.) are carved out per-project via file-glob overrides —
    // see clean-code-lint skill.
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ExportDefaultDeclaration',
        message:
          'Named exports only (CLAUDE.md Rule 5). If this is a framework entry point ' +
          '(page.tsx, layout.tsx, route.ts, etc.), add a file-glob override instead of ' +
          'disabling this rule inline.',
      },
    ],

    // Rule 18: never swallow an error silently.
    'no-empty': ['error', { allowEmptyCatch: false }],
  },
}

// TypeScript-only additions. Only include these where @typescript-eslint is
// already registered in the project (Next.js's next/typescript config, or
// typescript-eslint's recommended config, both provide it).
export const cleanCodeTypeScriptRules = {
  rules: {
    // Rule 12: no magic numbers. 0/1/-1/2 and array indexes are exempt —
    // they're rarely the "meaningful constant" this rule is trying to catch.
    '@typescript-eslint/no-magic-numbers': [
      'warn',
      {
        ignore: [-1, 0, 1, 2],
        ignoreArrayIndexes: true,
        ignoreEnums: true,
        ignoreNumericLiteralTypes: true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes: true,
      },
    ],
  },
}

// Type-aware TypeScript rules. Only include where parserOptions.project is
// configured (these require the type checker, not just the AST) — the skill
// checks for this before wiring them in, since enabling them without a typed
// parser makes ESLint throw, not warn.
export const cleanCodeTypeAwareRules = {
  rules: {
    // Rule 18: no fire-and-forget promises that swallow rejections.
    '@typescript-eslint/no-floating-promises': 'warn',

    // No deprecated-API usage. Catches things like @phosphor-icons/react's
    // bare `Camera` export (superseded by `CameraIcon`) at lint time instead
    // of relying on an editor-only TS hint, which a headless agent run never
    // sees. 'error': agents must not ship deprecated calls (found 2026-09-15).
    '@typescript-eslint/no-deprecated': 'error',
  },
}

// Next.js App Router server/client boundary isolation (Rule 17). Only wired
// in by the skill when `next` is detected in package.json. Heuristic, not
// exhaustive: flags the most common accidental leaks (DB clients, node
// built-ins for fs/process access) inside component files. Pair this with
// the `server-only` npm package for a real runtime guarantee — ESLint can't
// see the `'use client'` directive, so this is best-effort static coverage,
// not a substitute for `import 'server-only'` at the top of server-exclusive
// modules.
export const cleanCodeServerClientRules = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          'fs',
          'node:fs',
          'fs/promises',
          'node:fs/promises',
          'child_process',
          'node:child_process',
          'net',
          'node:net',
          'tls',
          'node:tls',
          'pg',
          'mysql2',
          'mongodb',
        ].map((name) => ({
          name,
          message:
            'Server-only module imported from a component file (CLAUDE.md Rule 17). ' +
            'Move this data access into a Server Component or server action and pass ' +
            'serialized props down instead.',
        })),
      },
    ],
  },
}

// Rule 20 directory-boundary checks (Next.js/TS feature architecture). Only
// wired in for projects that actually use the features/<domain> layout —
// forcing these onto a project with a different pre-existing structure
// (flat app/src/{actions,components,lib}, say) would false-positive on
// every import. The skill checks for a features/ directory before wiring
// either of these in; existing projects predating Rule 20 are never
// retrofitted automatically.
export const cleanCodeUiPrimitiveRules = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['*/features/*', '@/features/*'],
            message:
              'components/ui and components/layout are dumb presentational primitives ' +
              '(CLAUDE.md Rule 20) — no business logic, no domain imports. Pass data in ' +
              'via props instead of importing from features/.',
          },
        ],
      },
    ],
  },
}

export const cleanCodeInfraRules = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['*/features/*', '@/features/*', '*/app/*', '@/app/*'],
            message:
              'lib/ is shared infra (CLAUDE.md Rule 20) — it must not import from ' +
              'features/ or app/. Dependencies point one direction: features/app depend ' +
              'on lib, never the reverse.',
          },
        ],
      },
    ],
  },
}

// Tailwind canonical-class check. Only wired in by the skill when
// `tailwindcss` is detected in package.json — requires the
// `eslint-plugin-better-tailwindcss` dependency and a `settings['better-tailwindcss']`
// block (entryPoint for Tailwind v4's CSS-based config, or tailwindConfig for
// v3) registered alongside it; see the clean-code-lint skill for the wiring.
// Deliberately just this one rule, not the plugin's full `recommended`
// bundle — the bundle's no-unknown-classes / consistent-order rules
// false-positive against a project's custom `@theme` design tokens.
// 'error': matches the Tailwind CSS IntelliSense "suggestCanonicalClasses"
// hint (e.g. `min-h-[100dvh]` -> `min-h-dvh`), which a headless agent run
// never sees since it's IDE-only (found 2026-09-15).
export const cleanCodeTailwindRules = {
  rules: {
    'better-tailwindcss/enforce-canonical-classes': 'error',
  },
}
