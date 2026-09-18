import anyAscii from "any-ascii";

/**
 * The single alphabet a stored product name and a typed query are compared in.
 *
 * A name is written in whatever script its packaging uses, but it gets typed on
 * whatever keyboard is to hand: "сирење" is searched for as "sirenje", or as
 * "sirene" by someone who never thinks about the њ. Folding both sides to
 * lowercase ASCII puts them in one alphabet, and pg_trgm absorbs the spelling
 * drift left over - similarity('sirenje', 'sirene') is 0.5, far above any
 * search floor here.
 *
 * any-ascii rather than a hand-written table: the promise is every alphabet,
 * not the two we happened to think of.
 */
export const toSearchText = (name: string): string => anyAscii(name).toLowerCase();
