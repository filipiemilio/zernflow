import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { simulateFlow } from "./simulator";

describe("simulateFlow comment keyword trigger", () => {
  it("matches a comment keyword and traverses to the message node", () => {
    const nodes: Node[] = [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          label: "Claude nos comentarios",
          triggerType: "comment_keyword",
          keywords: [{ value: "claude", matchType: "contains" }],
        },
      },
      {
        id: "message",
        type: "sendMessage",
        position: { x: 0, y: 100 },
        data: {
          label: "Send Message",
          messages: [{ type: "text", text: "Olá, já vou enviar seu link" }],
        },
      },
    ];
    const edges: Edge[] = [{ id: "edge", source: "trigger", target: "message" }];

    const result = simulateFlow(nodes, edges, { incomingMessage: "Quero saber sobre CLAUDE" });

    expect(result.completed).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.steps.map((step) => step.nodeType)).toEqual([
      "trigger",
      "sendMessage",
      "end",
    ]);
    expect(result.steps[0].result).toMatchObject({ type: "trigger", matched: true });
  });
});
