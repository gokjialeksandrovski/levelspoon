import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { decideDuplicate } from "./products";

const FIGURES = {
  energyKcal: 484,
  fatG: 24.1,
  saturatesG: 9,
  carbohydrateG: 59.8,
  sugarsG: 48.6,
  proteinG: 7.9,
  saltG: 0.6,
  fibreG: null,
};

const GRAM_BASIS = { basisUnit: "g", basisQuantity: 100 };
const SIMILAR_NAME = 0.72;
const UNLIKE_NAME = 0.04;

beforeEach(() => {
  mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });
});

describe("decideDuplicate", () => {
  it("inserts when nothing comparable exists", async () => {
    const verdict = await decideDuplicate(
      { nutrition: FIGURES, ...GRAM_BASIS, nameSimilarity: 0 },
      null,
    );
    expect(verdict).toEqual({ kind: "insert" });
  });

  it("calls it the same product when the figures and the name both match", async () => {
    const verdict = await decideDuplicate(
      { nutrition: FIGURES, ...GRAM_BASIS, nameSimilarity: SIMILAR_NAME },
      { nutrition: FIGURES, ...GRAM_BASIS },
    );
    expect(verdict).toEqual({ kind: "same-product" });
  });

  it("calls it same figures only when the name is unlike", async () => {
    const verdict = await decideDuplicate(
      { nutrition: FIGURES, ...GRAM_BASIS, nameSimilarity: UNLIKE_NAME },
      { nutrition: FIGURES, ...GRAM_BASIS },
    );
    expect(verdict).toEqual({ kind: "same-figures" });
  });

  it("inserts when a single figure differs", async () => {
    const verdict = await decideDuplicate(
      { nutrition: { ...FIGURES, saltG: 0.7 }, ...GRAM_BASIS, nameSimilarity: SIMILAR_NAME },
      { nutrition: FIGURES, ...GRAM_BASIS },
    );
    expect(verdict).toEqual({ kind: "insert" });
  });

  it("inserts when the figures are stated per a different basis", async () => {
    const verdict = await decideDuplicate(
      { nutrition: FIGURES, basisUnit: "bar", basisQuantity: 1, nameSimilarity: SIMILAR_NAME },
      { nutrition: FIGURES, ...GRAM_BASIS },
    );
    expect(verdict).toEqual({ kind: "insert" });
  });

  it("treats two rows differing only in fibre as the same figures", async () => {
    // The gate compares the seven mandatory figures. A nullable eighth would
    // let a real duplicate through whenever one side's label omitted fibre.
    const verdict = await decideDuplicate(
      { nutrition: { ...FIGURES, fibreG: 3 }, ...GRAM_BASIS, nameSimilarity: UNLIKE_NAME },
      { nutrition: { ...FIGURES, fibreG: null }, ...GRAM_BASIS },
    );
    expect(verdict).toEqual({ kind: "same-figures" });
  });

  it("treats the ambiguous floor itself as a name match", async () => {
    const verdict = await decideDuplicate(
      { nutrition: FIGURES, ...GRAM_BASIS, nameSimilarity: 0.35 },
      { nutrition: FIGURES, ...GRAM_BASIS },
    );
    expect(verdict).toEqual({ kind: "same-product" });
  });
});
