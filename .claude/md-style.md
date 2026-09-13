# Markdown writing style (project rule)

Applies whenever you write or edit a `.md` file in this repo — notes, docs,
`CLAUDE.md`, and markdown produced by any skill (`superpowers:writing-plans`,
`superpowers:writing-skills`, etc.).

Write markdown prose in caveman-compress style: fewer tokens, same information,
same structure.

## Strip

- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "I'd recommend", "of course", "happy to", "feel free to"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Connective fluff: however, furthermore, additionally, in addition
- Redundant phrasing: "in order to" -> "to", "make sure to" -> "ensure",
  "the reason is because" -> "because"

## Compress

- Short synonyms: "use" not "utilize", "fix" not "implement a solution for",
  "big" not "extensive"
- Fragments are fine: "Run tests before commit", not "You should always run the
  test suite before committing"
- Drop "you should" / "remember to" / "note that" — state the action
- Merge bullets that say the same thing; keep one example per pattern

## Preserve exactly — never alter

- Heading text (compress the body under it, not the heading itself)
- Bullet and numbered-list nesting depth
- Tables: structure and cell content
- Fenced ` ``` ` code blocks and 4-space-indented code blocks
- Inline `code`
- URLs and markdown links
- File paths, shell commands, environment variables
- YAML frontmatter

## Never

- Add words to sound terse — compression only, never grow the text
- Compress anything inside backticks or fenced blocks
- Touch `.py` / `.js` / `.ts` / `.json` / `.yaml` / `.toml` / `.env` or other
  non-prose files

For a bulk pass over existing files, use `/caveman-compress <path>` instead —
it validates the structure invariants above and keeps a backup.
