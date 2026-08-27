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
 * Severity policy: 'error' only for violations that are unambiguous and
 * genuinely risky (empty catch, stray default exports). Everything more
 * stylistic/subjective is 'warn' so first-time adoption on an existing
 * codebase doesn't hard-block on day one. The Stop hook only blocks on
 * 'error'-level findings (ESLint's own exit-code behavior), so this
 * severity split IS the enforcement policy, not just cosmetics.
 */

// Base rules: core ESLint only, safe for any JS or TS project.
export const cleanCodeBaseRules = {
  rules: {
    // Rule 6: functions under 20 lines.
    'max-lines-per-function': [
      'warn',
      { max: 20, skipBlankLines: true, skipComments: true, IIFEs: true },
    ],

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
