"use client";

import { useState } from "react";

import { BarcodeScanner } from "@/components/ui/barcode-scanner";

// Test-only mount point for BarcodeScanner (spec T2). Nothing in the real
// product yet renders this component - that's T3's wizard-integration plan.
// Exercised by tests/e2e/barcode-scanner.spec.ts; not linked from any nav.
export const BarcodeScannerHarness = () => {
  const [detected, setDetected] = useState<string | null>(null);

  return (
    <main id="main-content" tabIndex={-1} className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Barcode scanner (test harness)</h1>
      {detected ? <p data-testid="detected-barcode">{detected}</p> : <BarcodeScanner onDetect={setDetected} />}
    </main>
  );
};
