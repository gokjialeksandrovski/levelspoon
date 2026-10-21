"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowLineDownIcon } from "@phosphor-icons/react";

import { Sheet } from "@/components/ui/sheet";
import { ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

// Not in lib.dom: Chromium-only, so TypeScript ships no type for it.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

// "share-sheet": iOS has no install prompt API, only Share > Add to Home Screen.
type InstallRoute = "none" | "prompt" | "share-sheet";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((onChange) => onChange());

// Module scope, not an effect: Chrome fires beforeinstallprompt once, often
// before the header has mounted, and a missed event never comes back.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

const subscribeToInstallRoute = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

const isRunningInstalled = (): boolean => window.matchMedia("(display-mode: standalone)").matches;

// navigator.standalone exists only on iOS WebKit.
const isIosBrowser = (): boolean => "standalone" in navigator;

const getInstallRoute = (): InstallRoute => {
  if (isRunningInstalled()) return "none";
  if (deferredPrompt) return "prompt";
  if (isIosBrowser()) return "share-sheet";
  return "none";
};

const getServerInstallRoute = (): InstallRoute => "none";

// A prompt event can be shown only once; Chrome fires a fresh one if the
// user dismisses it, which brings the button back.
const showInstallPrompt = async (): Promise<void> => {
  const event = deferredPrompt;
  deferredPrompt = null;
  notify();
  await event?.prompt();
};

export const InstallAppButton = () => {
  const route = useSyncExternalStore(subscribeToInstallRoute, getInstallRoute, getServerInstallRoute);
  const [helpOpen, setHelpOpen] = useState(false);

  if (route === "none") return null;

  const handleClick = route === "prompt" ? () => void showInstallPrompt() : () => setHelpOpen(true);

  return (
    <>
      <button type="button" onClick={handleClick} aria-label="Add to home screen" className={ICON_TAP_TARGET_CLASS}>
        <ArrowLineDownIcon />
      </button>
      {route === "share-sheet" && (
        <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="Add to home screen">
          <p className="text-text">Tap Share, then Add to Home Screen.</p>
        </Sheet>
      )}
    </>
  );
};
