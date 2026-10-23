interface ChangeRowProps {
  label: string;
  from: string;
  to: string;
}

// Struck-through old value, not a colour: the four accents each carry one
// semantic role (CLAUDE.md design system) and none of them means "was".
// Screen readers drop the strike and read the arrow as "right arrow", so the
// words ride along in sr-only text instead.
export const ChangeRow = ({ label, from, to }: ChangeRowProps) => (
  <li className="flex items-baseline justify-between gap-3">
    <span className="shrink-0 text-text-muted">{label}</span>
    <span className="text-right tabular-nums text-text">
      <span className="sr-only">was </span>
      <s className="text-text-muted">{from}</s>
      <span aria-hidden="true"> → </span>
      <span className="sr-only">, now </span>
      {to}
    </span>
  </li>
);
