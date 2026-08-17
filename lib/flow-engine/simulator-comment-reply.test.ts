import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { simulateFlow } from "./simulator";

describe("simulateFlow public comment reply", () => {
  it("previews commentReply stored as a generic action node", () => {
    const nodes: Node[] = [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          triggerType: "comment_keyword",
          keywords: [{ value: "claude", matchType: "contains" }],
        },
      },
      {
        id: "reply",
        type: "action",
        position: { x: 0, y: 100 },
        data: {
          actionType: "commentReply",
          text: "Pronto, {{commenter_name}}!",
        },
      },
    ];
    const edges: Edge[] = [{ id: "e1", source: "trigger", target: "reply" }];

    const result = simulateFlow(nodes, edges, { incomingMessage: "claude" });

    expect(result.steps[1]?.result).toEqual({
      type: "comment_reply",
      text: "Pronto, {{commenter_name}}!",
    });
  });
});
