import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { duplicateConfiguredNode } from "./duplicate-node";

describe("duplicateConfiguredNode", () => {
  it("copies configured node data deeply with a new id and visible offset", () => {
    const original: Node = {
      id: "message-1",
      type: "sendMessage",
      position: { x: 120, y: 240 },
      selected: false,
      data: {
        label: "Configured message",
        messages: [
          {
            text: "Hello {{name}}",
            buttons: [{ type: "url", title: "Open", url: "https://example.com" }],
          },
        ],
      },
    };

    const copy = duplicateConfiguredNode(original, "message-2");

    expect(copy).toMatchObject({
      id: "message-2",
      type: "sendMessage",
      position: { x: 160, y: 280 },
      selected: true,
      data: original.data,
    });
    expect(copy.data).not.toBe(original.data);
    expect((copy.data.messages as unknown[])[0]).not.toBe(
      (original.data.messages as unknown[])[0],
    );
  });
});
