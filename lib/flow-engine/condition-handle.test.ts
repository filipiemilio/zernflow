import { describe, expect, it } from "vitest";
import { normalizeConditionHandle } from "./condition-handle";

describe("normalizeConditionHandle", () => {
  it("maps editor yes/no handles to the engine true/false contract", () => {
    expect(normalizeConditionHandle("yes")).toBe("true");
    expect(normalizeConditionHandle("no")).toBe("false");
  });

  it("preserves canonical and unrelated handles", () => {
    expect(normalizeConditionHandle("true")).toBe("true");
    expect(normalizeConditionHandle("false")).toBe("false");
    expect(normalizeConditionHandle("variant-a")).toBe("variant-a");
    expect(normalizeConditionHandle(undefined)).toBeUndefined();
  });
});
