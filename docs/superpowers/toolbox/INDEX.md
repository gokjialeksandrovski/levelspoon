# Toolbox

Every file, script, or document an agent produces gets one entry here, plus
a line appended to each downstream playbook's `## Toolbox` block.

Entry carries three things: path, what it is, RULE. RULE is binding on every
later playbook. Agent that ignores a RULE and rewrites an existing tool has
failed its task even if tests pass.

Appending here is a numbered step in every playbook's final task. Not
optional, not "if time permits".

## Format

```markdown
### <name>
`<path>`
<one line: what it is>
RULE: <what later work must do, imperative>
Added by: <playbook filename>
```

---

## Entries

### portions.ts
`app/src/lib/measures/portions.ts`
Gram figures for household portions, keyed by portion class.
RULE: every new portion figure goes in this file. Never inline a gram number
at a call site, never move these into the database. Each figure carries a
comment naming its source. Figures are edible portion, never shell or
packaging weight.
Added by: 2026-09-18-01-portion-engine.md

### MeasureContext.portions
`app/src/lib/measures/resolve-grams.ts`
Required field carrying the portions a given user should see for a product.
RULE: resolve portions server-side and pass them in. Never import
`portions.ts` from a client component - the table must not reach the browser
bundle. Never make this field optional.
Added by: 2026-09-18-01-portion-engine.md
