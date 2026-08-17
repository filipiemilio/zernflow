interface WaitingSessionRef {
  id: string;
  current_node_id: string | null;
  variables: unknown;
}

interface WaitingNodeRef {
  id: string;
  data?: Record<string, unknown>;
}

interface IncomingSessionInput {
  text?: string;
  postbackPayload?: string;
  quickReplyPayload?: string;
  callbackData?: string;
}

function asVariables(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item)]),
  );
}

function interpolate(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (token, name: string) => variables[name] ?? token);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "");
}

/**
 * Correlates an inbound reply to the exact smart-delay node and session. A
 * payload-bound wait is never consumed by arbitrary text; explicitly listed
 * text fallbacks remain available for Instagram Web clients without buttons.
 */
export function matchesWaitingSessionInput(
  session: WaitingSessionRef,
  nodes: WaitingNodeRef[],
  incoming: IncomingSessionInput,
): boolean {
  const node = nodes.find((candidate) => candidate.id === session.current_node_id);
  if (!node?.data) return false;

  const variables = { ...asVariables(session.variables), session_id: session.id };
  const expected =
    typeof node.data.expectedPayload === "string"
      ? interpolate(node.data.expectedPayload, variables)
      : null;
  const actualPayload =
    incoming.postbackPayload || incoming.quickReplyPayload || incoming.callbackData;

  if (expected && actualPayload === expected) return true;

  const acceptedText = Array.isArray(node.data.acceptedText)
    ? node.data.acceptedText.filter((item): item is string => typeof item === "string")
    : [];
  if (incoming.text && acceptedText.length > 0) {
    const normalized = normalizeText(incoming.text);
    return acceptedText.some((item) => normalizeText(item) === normalized);
  }

  // Generic waits without an expected payload explicitly accept any inbound
  // interaction. Payload-bound waits fail closed when neither payload nor an
  // allowed text fallback matches.
  return !expected && Boolean(actualPayload || incoming.text?.trim());
}
