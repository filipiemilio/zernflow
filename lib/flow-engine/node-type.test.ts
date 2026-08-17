import { describe, expect, it } from "vitest";
import { resolveExecutableNodeType } from "./node-type";

describe("resolveExecutableNodeType", () => {
  it("uses actionType for generic action nodes", () => {
    expect(resolveExecutableNodeType({ type: "action", data: { actionType: "commentReply" } })).toBe(
      "commentReply"
    );
  });

  it("preserves dedicated node types", () => {
    expect(resolveExecutableNodeType({ type: "sendMessage", data: {} })).toBe("sendMessage");
  });
});
