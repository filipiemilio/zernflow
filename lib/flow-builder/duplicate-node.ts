import type { Node } from "@xyflow/react";

const DUPLICATE_OFFSET = 40;

/**
 * Copies a node's complete JSON-safe configuration without sharing nested
 * references. Edges are intentionally not copied: the duplicate starts
 * disconnected so duplicating an action cannot create accidental fan-out.
 */
export function duplicateConfiguredNode(node: Node, id: string): Node {
  return {
    ...node,
    id,
    position: {
      x: node.position.x + DUPLICATE_OFFSET,
      y: node.position.y + DUPLICATE_OFFSET,
    },
    data: structuredClone(node.data),
    selected: true,
    dragging: false,
  };
}
