import { describe, expect, it } from "vitest";

import { toSearchText } from "./search-text";

describe("toSearchText", () => {
  it("romanizes Cyrillic, including the digraph letters", () => {
    expect(toSearchText("Сирење")).toBe("sirenje");
    expect(toSearchText("Жёлтый")).toBe("zheltyy");
  });

  it("romanizes other scripts too", () => {
    expect(toSearchText("Ελληνικά")).toBe("ellinika");
    expect(toSearchText("蕎麦")).toBe("qiaomai");
  });

  it("folds diacritics onto their base letters", () => {
    expect(toSearchText("Käse")).toBe("kase");
    expect(toSearchText("Ćevapi")).toBe("cevapi");
  });

  it("leaves plain ASCII names as they were, lowercased", () => {
    expect(toSearchText("Olympus Greek Yogurt 2% Fat")).toBe("olympus greek yogurt 2% fat");
  });
});
