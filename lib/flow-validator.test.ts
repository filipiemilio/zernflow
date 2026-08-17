import { describe, expect, it } from "vitest";
import { validateFlowForPublication } from "./flow-validator";

const trigger = { id: "t", type: "trigger", data: {} };
const message = (id: string, url?: string) => ({
  id,
  type: "sendMessage",
  data: {
    messages: [{ text: id, buttons: url ? [{ type: "url", url }] : [] }],
  },
});

describe("validateFlowForPublication", () => {
  it("rejects cycles that could amplify messages indefinitely", () => {
    const errors = validateFlowForPublication(
      [trigger, message("m")],
      [
        { source: "t", target: "m" },
        { source: "m", target: "t" },
      ],
    );
    expect(errors.join(" ")).toContain("cycle");
  });

  it("rejects dangling edges and oversized flows", () => {
    expect(
      validateFlowForPublication([trigger], [{ source: "t", target: "missing" }]).join(" "),
    ).toContain("missing");
    const nodes = Array.from({ length: 101 }, (_, index) => ({
      id: String(index),
      type: "sendMessage",
      data: {},
    }));
    expect(validateFlowForPublication(nodes, []).join(" ")).toContain("100");
  });

  it("rejects follower-gated URLs that are withheld on the false branch", () => {
    const condition = {
      id: "c",
      type: "condition",
      data: { conditionType: "instagram_follower" },
    };
    const errors = validateFlowForPublication(
      [trigger, condition, message("yes", "https://example.com"), message("no")],
      [
        { source: "t", target: "c" },
        { source: "c", target: "yes", sourceHandle: "yes" },
        { source: "c", target: "no", sourceHandle: "no" },
      ],
    );
    expect(errors.join(" ")).toContain("Follower-gated");
  });

  it("accepts policy-safe personalization that delivers the URL on both branches", () => {
    const condition = {
      id: "c",
      type: "condition",
      data: { conditionType: "instagram_follower" },
    };
    expect(
      validateFlowForPublication(
        [
          trigger,
          condition,
          message("yes", "https://example.com"),
          message("no", "https://example.com"),
        ],
        [
          { source: "t", target: "c" },
          { source: "c", target: "yes", sourceHandle: "true" },
          { source: "c", target: "no", sourceHandle: "false" },
        ],
      ),
    ).toEqual([]);
  });

  it("allows a follower-gated URL only with an explicit owner risk acknowledgement", () => {
    const condition = {
      id: "c",
      type: "condition",
      data: {
        conditionType: "instagram_follower",
        allowFollowerGatedContent: true,
      },
    };

    expect(
      validateFlowForPublication(
        [trigger, condition, message("yes", "https://example.com"), message("no")],
        [
          { source: "t", target: "c" },
          { source: "c", target: "yes", sourceHandle: "true" },
          { source: "c", target: "no", sourceHandle: "false" },
        ],
      ),
    ).toEqual([]);
  });
});
