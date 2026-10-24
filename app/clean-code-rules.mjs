/**
 * Canonical ESLint rules for the Clean Code Principles in ~/.claude/CLAUDE.md.
 *
 * Source of truth — edit here. Each project keeps a VENDORED COPY of this
 * file committed to its own repo (not a cross-machine import — that breaks
 * `pnpm lint`/CI for anyone without this exact ~/.claude path). When this
 * file changes, re-copy it into
 * every project that has wired it in — see the clean-code-lint skill.
 *
 * Only the mechanically-checkable rules from CLAUDE.md are encoded here.
 * Judgment-based rules (SRP, SLA, Law of Demeter, Boy Scout, YAGNI, naming
 * quality, colocation) aren't lintable and stay enforced via self-review /
 * `/code-review` against CLAUDE.md instead — see the clean-code-lint skill.
 *
 * Severity policy: 'error' for violations that are unambiguous and
 * genuinely risky (empty catch, stray default exports, deprecated-API
 * usage, heavy client imports, unselected heavy queries). Everything else more stylistic/subjective (magic numbers,
 * func-style, complexity/nesting) stays 'warn' so first-time adoption on an
 * existing codebase doesn't hard-block on day one. The Stop hook only
 * blocks on 'error'-level findings (ESLint's own exit-code behavior), so
 * this severity split IS the enforcement policy, not just cosmetics.
 *
 * Rule 6 uses cyclomatic complexity and nesting depth, not raw line count:
 * they predict how hard a function is to read far better — a long flat
 * function beats a short deeply-nested one — and both stay 'warn' so a
 * function never needs an artificial split to clear a cutoff.
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
    // sees. 'error': agents must not ship deprecated calls.
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
// never sees since it's IDE-only.
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
 * "Edit" out of curiosity traps the user into a redundant save, e.g. an inline
 * row editor with a Save button and no Cancel.
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

/**
 * Rule 22 (data access & client weight). Three checks, each costing bytes or
 * queries on every request when missed:
 *  - a heavy or server-renderable module statically imported into a
 *    'use client' file ships in the bundle, and its props go out as JSON;
 *  - a document query with no `select` loads full records, rich-text bodies
 *    and populated relations included, to read a few fields;
 *  - independent awaits run one after the other.
 */

// Server-renderable or interaction-only modules. A project extends this list
// with its own heavy local modules (a rich-text renderer, say), because the
// rule sees only direct imports, not what a local module pulls in.
export const HEAVY_CLIENT_MODULES = [
  'payload',
  '@payloadcms/richtext-lexical',
  'lexical',
  // Captcha widgets appear only after an interaction.
  '@hcaptcha/react-hcaptcha',
  'react-google-recaptcha',
  '@marsidev/react-turnstile',
  'react-markdown',
  'marked',
  'shiki',
  'highlight.js',
  'prismjs',
]

const isUseClientFile = (program) =>
  program.body.some((statement) => statement.type === 'ExpressionStatement' && statement.directive === 'use client')

// Type imports are erased at build time, so they cost nothing in the bundle.
const isTypeOnlyImport = (node) =>
  node.importKind === 'type' ||
  (node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier.importKind === 'type'))

const matchesModule = (source, modules) => modules.some((name) => source === name || source.startsWith(`${name}/`))

const noHeavyClientImport = {
  meta: {
    type: 'problem',
    docs: { description: 'No statically imported heavy module in a client component (CLAUDE.md Rule 22).' },
    schema: [
      {
        type: 'object',
        properties: { modules: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      heavy: [
        "'{{source}}' is statically imported into a 'use client' file, so it ships in the client bundle",
        'and whatever it renders serializes its props to the browser (CLAUDE.md Rule 22).',
        "Render it from a Server Component and move 'use client' down to the interactive leaf,",
        'or load it with next/dynamic when it only appears after an interaction.',
      ].join(' '),
    },
  },
  create(context) {
    if (!isUseClientFile(context.sourceCode.ast)) return {}
    const modules = context.options[0]?.modules ?? HEAVY_CLIENT_MODULES
    return {
      ImportDeclaration(node) {
        if (isTypeOnlyImport(node) || !matchesModule(node.source.value, modules)) return
        context.report({ node: node.source, messageId: 'heavy', data: { source: node.source.value } })
      },
    }
  },
}

// Payload Local API methods that return documents. `count` returns a number.
const DOCUMENT_QUERY_METHODS = new Set(['find', 'findByID', 'update'])

const readProperty = (objectNode, name) =>
  objectNode.properties.find(
    (property) => property.type === 'Property' && !property.computed && (property.key.name ?? property.key.value) === name,
  )

const unwrapAsConst = (node) => (node?.type === 'TSAsExpression' ? node.expression : node)

// Follows `collection: POSTS` to `const POSTS = 'posts'`; anything less certain reads as unknown.
const resolveStringConstant = (node, scope) => {
  const value = unwrapAsConst(node)
  if (value?.type === 'Literal') return value.value
  if (value?.type !== 'Identifier') return null
  for (let current = scope; current; current = current.upper) {
    const definition = current.set.get(value.name)?.defs[0]
    if (!definition) continue
    const init = unwrapAsConst(definition.node.init)
    return definition.parent?.kind === 'const' && init?.type === 'Literal' ? init.value : null
  }
  return null
}

const readQueriedCollection = (node, scope) => {
  const { callee } = node
  if (callee.type !== 'MemberExpression' || !DOCUMENT_QUERY_METHODS.has(callee.property.name)) return null
  const [options] = node.arguments
  if (options?.type !== 'ObjectExpression') return null
  // A spread may carry the select, so it can't be judged here.
  if (options.properties.some((property) => property.type === 'SpreadElement')) return null
  const name = resolveStringConstant(readProperty(options, 'collection')?.value, scope)
  return typeof name === 'string' ? { name, method: callee.property.name, options } : null
}

const requireQuerySelect = {
  meta: {
    type: 'problem',
    docs: { description: 'Document queries on heavy collections name their fields (CLAUDE.md Rule 22).' },
    schema: [
      {
        type: 'object',
        properties: { collections: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      noSelect: [
        "{{method}}('{{collection}}') has no `select`, so it loads every field, rich-text bodies",
        'and their populated uploads included (CLAUDE.md Rule 22). Select only the fields this caller',
        'uses; Payload narrows the result type to match, so a missing field is a type error, not a bug.',
      ].join(' '),
    },
  },
  create(context) {
    const collections = context.options[0]?.collections
    return {
      CallExpression(node) {
        const query = readQueriedCollection(node, context.sourceCode.getScope(node))
        if (!query || readProperty(query.options, 'select')) return
        if (collections && !collections.includes(query.name)) return
        context.report({ node, messageId: 'noSelect', data: { method: query.method, collection: query.name } })
      },
    }
  },
}

const readAwaitedDeclarator = (statement) => {
  if (statement?.type !== 'VariableDeclaration' || statement.declarations.length !== 1) return null
  const [declarator] = statement.declarations
  return declarator.init?.type === 'AwaitExpression' ? declarator : null
}

// Over-collects (property keys too), which only ever makes the rule report less.
const collectIdentifierNames = (node, visitorKeys, names = new Set()) => {
  if (!node || typeof node.type !== 'string') return names
  if (node.type === 'Identifier') names.add(node.name)
  for (const key of visitorKeys[node.type] ?? []) {
    const child = node[key]
    for (const item of Array.isArray(child) ? child : [child]) collectIdentifierNames(item, visitorKeys, names)
  }
  return names
}

// Only adjacent `const x = await …` pairs: a bare `await write()` statement may be an ordering
// dependency (read after own write), and that is invisible to a static check.
const noSequentialIndependentAwait = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Independent awaits start together (CLAUDE.md Rule 22).' },
    schema: [],
    messages: {
      sequential: [
        "'{{second}}' waits for '{{first}}' without using it. Start both with Promise.all",
        '(CLAUDE.md Rule 22). If the second read must see the first one\'s write, keep the order',
        'and give the reason in an eslint-disable-next-line comment.',
      ].join(' '),
    },
  },
  create(context) {
    const { sourceCode } = context
    const checkStatements = (statements) => {
      statements.forEach((statement, index) => {
        const first = readAwaitedDeclarator(statement)
        const second = readAwaitedDeclarator(statements[index + 1])
        if (!first || !second) return
        const bound = collectIdentifierNames(first.id, sourceCode.visitorKeys)
        const used = collectIdentifierNames(second.init, sourceCode.visitorKeys)
        if ([...bound].some((name) => used.has(name))) return
        context.report({
          node: second,
          messageId: 'sequential',
          data: { first: sourceCode.getText(first.id), second: sourceCode.getText(second.id) },
        })
      })
    }
    return {
      Program: (node) => checkStatements(node.body),
      BlockStatement: (node) => checkStatements(node.body),
    }
  },
}

// Next.js merges metadata shallowly: a page's `openGraph` replaces the layout's whole object,
// so siteName, locale and the default image silently vanish unless the page spreads a shared base.
const SHALLOW_MERGED_METADATA_KEYS = ['openGraph', 'twitter']

const requireBaseSpread = {
  meta: {
    type: 'problem',
    docs: { description: 'Shallow-merged metadata objects spread a shared base (CLAUDE.md Rule 20).' },
    schema: [
      {
        type: 'object',
        properties: { properties: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      noBase: [
        "`{{key}}` is merged shallowly, so this object replaces the parent's whole `{{key}}`",
        'and drops every field it does not repeat (CLAUDE.md Rule 20). Spread the shared base first:',
        '`{{key}}: { ...BASE_{{upper}}, title }`.',
      ].join(' '),
    },
  },
  create(context) {
    const keys = context.options[0]?.properties ?? SHALLOW_MERGED_METADATA_KEYS
    return {
      Property(node) {
        const name = node.computed ? null : (node.key.name ?? node.key.value)
        if (!keys.includes(name)) return
        const value = unwrapAsConst(node.value)
        if (value?.type !== 'ObjectExpression') return
        if (value.properties.some((property) => property.type === 'SpreadElement')) return
        context.report({ node, messageId: 'noBase', data: { key: name, upper: name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase() } })
      },
    }
  },
}

/**
 * Rules 12 and 21 as they appear in a CSS Module. ESLint reads no CSS on its
 * own: a project installs `@eslint/css` and wires its `css/css` language on
 * `*.module.css`, then spreads cleanCodeStylesheetRules there — the same
 * dependency-wired shape as the Tailwind block above.
 *
 * Three shapes that pass every test and only show up on a real screen:
 *  - an overlaid heading with no line-clamp shears off inside a clipped box,
 *    while the subtitle beside it, the line that matters less, is protected;
 *  - a hand-written white alpha, or the decoration-only step of a text ladder
 *    on text a reader needs, leaves the documented ladder;
 *  - a :hover rule outside @media (hover: hover) sticks after a tap.
 */

// A heading's own rule is the one that sets the type, so `.title em { font-style }` is not it.
const HEADING_CLASS_NAME = /title|heading|headline/i
const CLAMP_PROPERTIES = ['-webkit-line-clamp', 'line-clamp']

const listItems = (list) => (list ? [...list] : [])

const readClassNames = (selector) => [...selector.matchAll(/\.([\w-]+)/g)].map(([, name]) => name)

/**
 * Collects every rule in the sheet, the ones nested in at-rules included, and
 * hands them to `analyse` as a whole: the clamp or the override that decides a
 * finding may sit in a media query far from the rule it fixes.
 */
const collectRules = (context, analyse) => {
  const { sourceCode } = context
  const rules = []
  return {
    Rule(node) {
      rules.push({
        node,
        selector: sourceCode.getText(node.prelude),
        declarations: listItems(node.block?.children)
          .filter((child) => child.type === 'Declaration')
          .map((declaration) => ({
            node: declaration,
            property: declaration.property,
            value: sourceCode.getText(declaration.value).trim(),
          })),
      })
    },
    'StyleSheet:exit': () => analyse(rules),
  }
}

const declares = (rule, property, value) =>
  rule.declarations.some(
    (declaration) => declaration.property === property && (value === undefined || declaration.value === value),
  )

const isClamped = (rule) => rule.declarations.some((declaration) => CLAMP_PROPERTIES.includes(declaration.property))

// A gradient laid over the whole box exists for one reason: to make text on top of a photo
// readable. Together with a container that clips, that is the overlay shape — a card whose
// title sits under its photo has neither, so it is left alone.
const isScrim = (rule) =>
  declares(rule, 'position', 'absolute') && rule.declarations.some((declaration) => declaration.value.includes('gradient('))

const isOverlayStylesheet = (rules) =>
  rules.some(isScrim) && rules.some((rule) => declares(rule, 'overflow', 'hidden'))

const noUnclampedOverlayHeading = {
  meta: {
    type: 'problem',
    docs: { description: 'An overlaid heading is clamped wherever its sibling text is (CLAUDE.md Rule 21).' },
    schema: [],
    messages: {
      unclamped: [
        '`.{{heading}}` has no line-clamp while `.{{clamped}}` in the same file has one, and this',
        'component overlays text on an image inside a clipped box. The constraint is inverted: a long',
        'heading shears off against the top edge, or lands where the scrim has already faded, while the',
        'line that matters less is protected. Clamp the heading too, or let the box grow.',
      ].join(' '),
    },
  },
  create(context) {
    return collectRules(context, (rules) => {
      if (!isOverlayStylesheet(rules)) return
      const clampedClasses = rules.filter(isClamped).flatMap((rule) => readClassNames(rule.selector))
      if (clampedClasses.length === 0) return
      const reported = new Set()
      for (const rule of rules) {
        const heading = readClassNames(rule.selector).find((name) => HEADING_CLASS_NAME.test(name))
        if (!heading || reported.has(heading) || clampedClasses.includes(heading) || !declares(rule, 'font-size')) continue
        reported.add(heading)
        context.report({ node: rule.node, messageId: 'unclamped', data: { heading, clamped: clampedClasses[0] } })
      }
    })
  },
}

const COLOR_PROPERTIES = ['color', '-webkit-text-fill-color']
const WHITE_ALPHA = /rgba?\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/

// The project's own ladder is the default; another project passes `{ ladder: [...] }`
// with its token names. `decorationOnly` marks the step whose contrast is too low
// for text a reader has to read.
const TEXT_LADDER = [
  { token: '--color-text-primary', alpha: 0.92 },
  { token: '--color-text-secondary', alpha: 0.58 },
  { token: '--color-text-muted', alpha: 0.48 },
  { token: '--color-text-faint', alpha: 0.32, decorationOnly: true },
]

const DECORATIVE_CLASS_NAME = /dot|separator|divider|disabled|decoration|placeholder/i

const nearestLadderStep = (alpha, ladder) =>
  ladder.reduce((closest, step) => (Math.abs(step.alpha - alpha) < Math.abs(closest.alpha - alpha) ? step : closest))

const noOffLadderTextAlpha = {
  meta: {
    type: 'problem',
    docs: { description: 'Text colours come from the ladder tokens, at their documented step (CLAUDE.md Rule 12).' },
    schema: [
      {
        type: 'object',
        properties: {
          ladder: {
            type: 'array',
            items: {
              type: 'object',
              properties: { token: { type: 'string' }, alpha: { type: 'number' }, decorationOnly: { type: 'boolean' } },
              required: ['token', 'alpha'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawAlpha: [
        '`{{value}}` is a hand-written white alpha on text, and the ladder already has the step next to',
        'it: `var({{token}})` at {{alpha}} (CLAUDE.md Rule 12). A loose alpha is a magic value no one can',
        'check against the contrast measurements the ladder was built from.',
      ].join(' '),
      decorationOnly: [
        '`var({{token}})` is the decoration-only step of the text ladder ({{alpha}} white, under 3:1 on the',
        'page), and `{{selector}}` does not read as decoration (CLAUDE.md Rule 12). Text a reader needs',
        'takes the step its kind of element is assigned; keep this one for separators and disabled controls.',
      ].join(' '),
    },
  },
  create(context) {
    const ladder = context.options[0]?.ladder ?? TEXT_LADDER
    return collectRules(context, (rules) => {
      for (const rule of rules) {
        for (const declaration of rule.declarations.filter((entry) => COLOR_PROPERTIES.includes(entry.property))) {
          const [, rawAlpha] = WHITE_ALPHA.exec(declaration.value) ?? []
          if (rawAlpha !== undefined) {
            const step = nearestLadderStep(Number(rawAlpha), ladder)
            const data = { value: declaration.value, token: step.token, alpha: step.alpha }
            context.report({ node: declaration.node, messageId: 'rawAlpha', data })
            continue
          }
          const decoration = ladder.find((step) => step.decorationOnly && declaration.value.includes(step.token))
          if (!decoration || DECORATIVE_CLASS_NAME.test(rule.selector)) continue
          const data = { token: decoration.token, alpha: decoration.alpha, selector: rule.selector }
          context.report({ node: declaration.node, messageId: 'decorationOnly', data })
        }
      }
    })
  },
}

const HOVER_MEDIA_QUERY = /\(\s*(?:any-)?hover\s*:\s*hover\s*\)/

const requireHoverMediaQuery = {
  meta: {
    type: 'problem',
    docs: { description: ':hover styling sits inside @media (hover: hover) (CLAUDE.md Rule 21).' },
    schema: [],
    messages: {
      unguarded: [
        '`{{selector}}` styles :hover outside @media (hover: hover), so a tap leaves the hover state stuck',
        'on a touch screen: the element still looks pressed after the next page, or after a back',
        'navigation. Move the rule inside the query. :focus-visible needs none and stays as it is.',
      ].join(' '),
    },
  },
  create(context) {
    const { sourceCode } = context
    let hoverQueryDepth = 0
    const isHoverQuery = (node) =>
      node.name === 'media' && HOVER_MEDIA_QUERY.test(node.prelude ? sourceCode.getText(node.prelude) : '')
    return {
      Atrule: (node) => {
        if (isHoverQuery(node)) hoverQueryDepth += 1
      },
      'Atrule:exit': (node) => {
        if (isHoverQuery(node)) hoverQueryDepth -= 1
      },
      Rule(node) {
        const selector = sourceCode.getText(node.prelude)
        if (hoverQueryDepth > 0 || !selector.includes(':hover')) return
        context.report({ node, messageId: 'unguarded', data: { selector: selector.replace(/\s+/g, ' ') } })
      },
    }
  },
}

// Plugin object holding the rules CLAUDE.md needs that core ESLint cannot
// express. Flat config only — a legacy .eslintrc project has to register it
// through its own `plugins` array instead.
export const cleanCodePlugin = {
  rules: {
    'no-one-way-edit-state': noOneWayEditState,
    'no-heavy-client-import': noHeavyClientImport,
    'require-query-select': requireQuerySelect,
    'no-sequential-independent-await': noSequentialIndependentAwait,
    'require-base-spread': requireBaseSpread,
    'no-unclamped-overlay-heading': noUnclampedOverlayHeading,
    'no-off-ladder-text-alpha': noOffLadderTextAlpha,
    'require-hover-media-query': requireHoverMediaQuery,
  },
}

// Next.js only, scoped to route files (`src/app/**`). The base lives in a shared
// constants module, and the root layout assigns it as-is (`openGraph: BASE_OPEN_GRAPH`).
export const cleanCodeMetadataRules = {
  plugins: { 'clean-code': cleanCodePlugin },
  rules: { 'clean-code/require-base-spread': 'error' },
}

// Rule 22 wiring, scoped by the skill to code that runs per request or ships
// to the browser. The heavy-import check is 'error': a hit is a real bundle
// leak. The await check is 'warn': an ordering dependency through a side
// effect can't be seen statically. Core no-await-in-loop was tried and left
// out: its first hit was a bounded worker pool, the correct way to cap
// concurrency, and no waterfall found so far was a loop.
export const cleanCodePerformanceRules = {
  plugins: { 'clean-code': cleanCodePlugin },
  rules: {
    'clean-code/no-heavy-client-import': ['error', { modules: HEAVY_CLIENT_MODULES }],
    'clean-code/no-sequential-independent-await': 'warn',
  },
}

// The Vercel React best practices (vercel-react-best-practices skill) that an
// existing plugin already checks. No `plugins` key: eslint-config-next
// registers `react` and `react-hooks` itself; any other React project
// registers eslint-plugin-react and eslint-plugin-react-hooks 7+ first. Listed
// even where a preset already turns a rule on, so dropping the preset cannot
// silently drop the check. `react/jsx-no-leaked-render`
// (rendering-conditional-render) was tried and left out: 97 hits on its first
// project, every sampled one a boolean or string condition. The real defect,
// `count && <X />` rendering "0", stays self-review.
export const cleanCodeReactRules = {
  rules: {
    // rerender-no-inline-components: a component defined during render
    // remounts, losing its state, on every parent render. The react rule
    // sees inline definitions; the react-hooks one only sees components
    // returned by a call (`const Row = pick(kind)`).
    'react/no-unstable-nested-components': 'error',
    'react-hooks/static-components': 'error',
    // rerender-derived-state-no-effect: derive during render; an effect
    // that sets state from props renders twice and shows a stale frame.
    'react-hooks/set-state-in-effect': 'error',
    'react-hooks/no-deriving-state-in-effects': 'error',
    // rerender-memo-with-default-value: an `= {}` or `= []` default is a new
    // reference every render, so memo and effect dependencies never settle.
    'react/no-object-type-as-default-prop': 'error',
  },
}

// Payload CMS projects only. With no options it checks every collection; a
// project passes `{ collections: [...] }` to name the ones with heavy fields
// (rich text, upload arrays), plus any collection whose relation populates
// one of those, so small lookup collections stay unflagged.
export const cleanCodePayloadRules = {
  plugins: { 'clean-code': cleanCodePlugin },
  rules: { 'clean-code/require-query-select': 'error' },
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

// CSS Modules only, and only where the project has installed `@eslint/css` and
// wired its `css/css` language on the stylesheets, because ESLint parses no CSS
// on its own — see the clean-code-lint skill for the wiring. All three land as
// 'warn': each reads a shape and not an intent (which text a reader needs, which
// element a finger can reach), and an existing stylesheet carries dozens of the
// hover one, so blocking on day one would only buy an `eslint-disable` sweep. A
// project with a clean sheet raises the ones that fire nowhere to 'error'.
export const cleanCodeStylesheetRules = {
  plugins: { 'clean-code': cleanCodePlugin },
  rules: {
    'clean-code/no-unclamped-overlay-heading': 'warn',
    'clean-code/no-off-ladder-text-alpha': 'warn',
    'clean-code/require-hover-media-query': 'warn',
  },
}
