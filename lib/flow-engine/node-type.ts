interface ExecutableNodeLike {
  type: string;
  data?: unknown;
}

export function resolveExecutableNodeType(node: ExecutableNodeLike): string {
  if (node.type !== "action") return node.type;
  const data = node.data as Record<string, unknown> | undefined;
  const actionType = data?.actionType;
  return typeof actionType === "string" && actionType ? actionType : "action";
}
