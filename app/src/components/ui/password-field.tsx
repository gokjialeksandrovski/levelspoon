"use client";

import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Field } from "./field";
import { ICON_TAP_TARGET_CLASS } from "./tap-target";

interface PasswordFieldProps {
  label: string;
  name: string;
  autoComplete: string;
  minLength?: number;
  helperText?: string;
  required?: boolean;
}

// Icon-only control: the documented Rule 16 exception, no Button variant
// covers a 44px glyph sitting inside another control's box.
const RevealToggle = ({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    // The label carries the state, so no aria-pressed: the two together
    // announce as a contradiction ("Hide password, pressed").
    aria-label={revealed ? "Hide password" : "Show password"}
    className={ICON_TAP_TARGET_CLASS}
  >
    {revealed ? <EyeSlashIcon /> : <EyeIcon />}
  </button>
);

// Typing a password one-handed on a phone keyboard with nothing on screen to
// check against is the app's most likely sign-in failure. Swapping the input
// type keeps the browser's own password manager behaviour intact.
export const PasswordField = ({ label, name, autoComplete, minLength, helperText, required = false }: PasswordFieldProps) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <Field
      label={label}
      name={name}
      type={revealed ? "text" : "password"}
      autoComplete={autoComplete}
      minLength={minLength}
      helperText={helperText}
      required={required}
      trailing={<RevealToggle revealed={revealed} onToggle={() => setRevealed((shown) => !shown)} />}
    />
  );
};
