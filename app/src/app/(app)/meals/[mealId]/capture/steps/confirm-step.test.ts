import { afterEach, describe, expect, it, vi } from "vitest";

// confirm-step.tsx's production imports (createProduct, validateNutrition)
// transitively pull in @/auth's real next-auth setup, which this Vitest/Node
// setup can't resolve (next-auth/lib/env.js's "next/server" import) - same
// shim products.test.ts and barcode.test.ts use to avoid loading it.
const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

vi.mock("@/features/products/actions/barcode", () => ({ checkBarcodeBinding: vi.fn() }));

import { checkBarcodeBinding } from "@/features/products/actions/barcode";

import { resolveBarcodeBinding } from "./confirm-step";

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveBarcodeBinding", () => {
  it("calls onAvailable with the canonical barcode when nothing else claims it", async () => {
    vi.mocked(checkBarcodeBinding).mockResolvedValue({ kind: "available", barcode: "5901234123457" });
    const callbacks = { onAvailable: vi.fn(), onConflict: vi.fn(), onRejected: vi.fn(), onError: vi.fn() };

    await resolveBarcodeBinding("5901234123457", callbacks);

    expect(callbacks.onAvailable).toHaveBeenCalledWith("5901234123457");
  });

  it("calls onConflict with the other product when the code is already bound", async () => {
    const product = { id: "product-2", name: "Other Product" };
    vi.mocked(checkBarcodeBinding).mockResolvedValue({ kind: "already_linked_elsewhere", product: product as never });
    const callbacks = { onAvailable: vi.fn(), onConflict: vi.fn(), onRejected: vi.fn(), onError: vi.fn() };

    await resolveBarcodeBinding("5901234123457", callbacks);

    expect(callbacks.onConflict).toHaveBeenCalledWith(product);
  });

  it("calls onRejected for a code that fails normalization", async () => {
    vi.mocked(checkBarcodeBinding).mockResolvedValue({ kind: "rejected" });
    const callbacks = { onAvailable: vi.fn(), onConflict: vi.fn(), onRejected: vi.fn(), onError: vi.fn() };

    await resolveBarcodeBinding("bad-code", callbacks);

    expect(callbacks.onRejected).toHaveBeenCalledTimes(1);
  });

  it("calls onError when the check throws", async () => {
    vi.mocked(checkBarcodeBinding).mockRejectedValue(new Error("db down"));
    const callbacks = { onAvailable: vi.fn(), onConflict: vi.fn(), onRejected: vi.fn(), onError: vi.fn() };

    await resolveBarcodeBinding("5901234123457", callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith("Could not check this barcode. Please try again.");
  });
});
