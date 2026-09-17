// Postgres LIKE/ILIKE treats % and _ as wildcards and \ as the default
// escape. A product name like "2,8% m.m" is typed verbatim by users, so
// every metacharacter in a query token has to survive as a literal.
// Backslash first: escaping it after % would double-escape the escapes.
const escapeLikeMetacharacters = (token: string): string =>
  token.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

export const toLikeTokens = (query: string): string[] =>
  query
    .split(/\s+/)
    .filter((token) => token !== "")
    .map(escapeLikeMetacharacters);
