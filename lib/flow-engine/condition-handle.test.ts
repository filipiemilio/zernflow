import { describe, expect, it } from "vitest";
import {
  matchesConditionHandle,
  normalizeConditionHandle,
} from "./condition-handle";

describe("normalizeConditionHandle", () => {
  it("maps editor yes/no handles to the engine true/false contract", () => {
    expect(normalizeConditionHandle("yes")).toBe("true");
    expect(normalizeConditionHandle("no")).toBe("false");
  });

  it("matches legacy editor handles against the runtime true/false result", () => {
    expect(matchesConditionHandle("yes", "true")).toBe(true);
    expect(matchesConditionHandle("no", "false")).toBe(true);
    expect(matchesConditionHandle("yes", "false")).toBe(false);
  });

  it("preserves canonical and unrelated handles", () => {
    expect(normalizeConditionHandle("true")).toBe("true");
    expect(normalizeConditionHandle("false")).toBe("false");
    expect(normalizeConditionHandle("variant-a")).toBe("variant-a");
    expect(normalizeConditionHandle(undefined)).toBeUndefined();
  });
});
