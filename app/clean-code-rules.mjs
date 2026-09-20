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

/**
 * Rule 21 (user control and freedom): a mode you can enter but not leave.
 *
 * Catches the shape where a component flips an edit/open flag on but never
 * off, so the only way out of the state is the committing action — clicking
 * "Edit" out of curiosity traps the user into a redundant save. Found in the
 * wild 2026-09-20: an inline row editor shipped with a Save button and no
 * Cancel.
 *
 * Heuristic, deliberately narrow to stay at 'error' severity:
 *  - only useState whose state or setter name contains edit/open/expand —
 *    a one-way `setHasConsented(true)` or `setSubmitted(true)` is a
 *    legitimate latch, a one-way `setIsEditing(true)` is not;
 *  - a reset is any call passing false/null/undefined/'' or an updater
 *    function (a toggle is an exit), so only a genuinely one-way setter fires;
 *  - passing the setter somewhere as a bare reference bails out entirely —
 *    the exit may live in the child.
 */
const RESET_LITERALS = new Set([false, null, ''])
const EXITABLE_STATE_NAME = /edit|open|expand/i

const isResetArgument = (node) => {
  if (!node) return true // setX() with no args clears it
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return true
  if (node.type === 'Identifier' && node.name === 'undefined') return true
  if (node.type === 'Literal') return RESET_LITERALS.has(node.value)
  return false
}

const isUseStateCall = (node) => {
  if (node?.type !== 'CallExpression') return false
  const callee = node.callee
  return (callee.type === 'MemberExpression' ? callee.property.name : callee.name) === 'useState'
}

const namesAnExitableMode = (identifiers) =>
  identifiers.some((identifier) => EXITABLE_STATE_NAME.test(identifier.name))

/** The [state, setter] pair of a useState whose name says it is an enterable mode. */
const readExitableStatePair = (node) => {
  if (!isUseStateCall(node.init) || node.id.type !== 'ArrayPattern') return null
  const [state, setter] = node.id.elements
  if (state?.type !== 'Identifier' || setter?.type !== 'Identifier') return null
  return namesAnExitableMode([state, setter]) ? { state, setter } : null
}

const noOneWayEditState = {
  meta: {
    type: 'problem',
    docs: { description: 'An edit/open mode must have a non-committal exit (CLAUDE.md Rule 21).' },
    schema: [],
    messages: {
      oneWay: [
        "'{{setter}}' is only ever turned on — nothing in this file turns '{{state}}' back off.",
        'A user who enters this mode by accident can only leave it through the committing',
        'action (CLAUDE.md Rule 21). Add a Cancel control that restores the pre-edit value,',
        'and dismiss on Escape / backdrop where the mode is an overlay.',
      ].join(' '),
    },
  },
  create(context) {
    const setters = new Map() // setter name -> { state, node, enters, resets, escaped }

    const track = (name, patch) => {
      const entry = setters.get(name)
      if (entry) Object.assign(entry, patch)
    }

    return {
      VariableDeclarator(node) {
        const pair = readExitableStatePair(node)
        if (!pair) return
        setters.set(pair.setter.name, {
          state: pair.state.name,
          node: pair.setter,
          enters: false,
          resets: false,
          escaped: false,
        })
      },

      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return
        if (!setters.has(node.callee.name)) return
        const reset = isResetArgument(node.arguments[0])
        track(node.callee.name, reset ? { resets: true } : { enters: true })
      },

      // A bare reference (passed as a prop, stored, aliased) means the exit
      // can live in another file — unknowable here, so stop judging it.
      'Identifier:exit'(node) {
        if (!setters.has(node.name)) return
        if (node.parent.type === 'CallExpression' && node.parent.callee === node) return
        if (node.parent.type === 'VariableDeclarator' && node.parent.id === node) return
        if (node.parent.type === 'ArrayPattern') return
        if (node.parent.type === 'MemberExpression' && node.parent.property === node) return
        track(node.name, { escaped: true })
      },

      'Program:exit'() {
        for (const [setter, entry] of setters) {
          if (entry.escaped || entry.resets || !entry.enters) continue
          context.report({
            node: entry.node,
            messageId: 'oneWay',
            data: { setter, state: entry.state },
          })
        }
      },
    }
  },
}

// Plugin object holding the rules CLAUDE.md needs that core ESLint cannot
// express. Flat config only — a legacy .eslintrc project has to register it
// through its own `plugins` array instead.
export const cleanCodePlugin = {
  rules: { 'no-one-way-edit-state': noOneWayEditState },
}

// Rule 21 wiring. Kept a separate export rather than folded into
// cleanCodeBaseRules because it only means anything in component code — the
// skill scopes it to the project's UI directories, same as the server/client
// block. 'error': the heuristic above is narrow enough that a hit is a real
// trapped mode, and the whole point is that the Stop hook blocks on it.
export const cleanCodeInteractionRules = {
  plugins: { 'clean-code': cleanCodePlugin },
  rules: { 'clean-code/no-one-way-edit-state': 'error' },
}
