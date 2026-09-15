type Tone = "error" | "warning" | "success";

const TONE_CLASS: Record<Tone, string> = {
  error: "text-danger",
  warning: "text-flag",
  success: "text-text",
};

export const InlineMessage = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
  <p className={`text-sm ${TONE_CLASS[tone]}`} role={tone === "error" ? "alert" : undefined}>
    {children}
  </p>
);
