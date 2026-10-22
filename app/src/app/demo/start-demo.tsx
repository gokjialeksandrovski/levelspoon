"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { DEMO_GUESTS_PER_IP_PER_DAY } from "@/lib/demo/limits";

// Matches DemoFullError's code in auth.ts.
const DEMO_FULL_CODE = "demo_full";

const DEMO_FULL_MESSAGE = `This network has started ${DEMO_GUESTS_PER_IP_PER_DAY} demos today. Try again tomorrow, or make an account.`;
const START_FAILED_MESSAGE = "Couldn't start the demo. Check your connection and try again.";

const startDemo = async (router: ReturnType<typeof useRouter>, setError: (message: string | null) => void): Promise<void> => {
  const result = await signIn("guest", { redirect: false });
  if (result?.error) {
    setError(result.code === DEMO_FULL_CODE ? DEMO_FULL_MESSAGE : START_FAILED_MESSAGE);
    return;
  }
  router.push("/");
  router.refresh();
};

export const StartDemo = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleStart = () => {
    setError(null);
    setPending(true);
    void startDemo(router, setError)
      .catch(() => setError(START_FAILED_MESSAGE))
      .finally(() => setPending(false));
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button pending={pending} onClick={handleStart}>
        Start the demo
      </Button>
    </div>
  );
};
