import { validateOutboundHttpUrl } from "./automation-safety";
import { normalizeConditionHandle } from "./flow-engine/condition-handle";

interface PublishNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

interface PublishEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
}

function outboundUrls(node: PublishNode): string[] {
  if (node.type !== "sendMessage") return [];
  const messages = Array.isArray(node.data?.messages) ? node.data.messages : [];
  const urls: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const buttons = Array.isArray((message as Record<string, unknown>).buttons)
      ? ((message as Record<string, unknown>).buttons as unknown[])
      : [];
    for (const button of buttons) {
      if (!button || typeof button !== "object") continue;
      const url = (button as Record<string, unknown>).url;
      if (typeof url === "string" && url) urls.push(url);
    }
  }
  return urls;
}

/** Instagram rejects button and quick-reply labels longer than this. */
const MAX_TITLE_LENGTH = 20;

/**
 * Labels the platform will refuse at send time. A rejected send aborts the
 * session mid-conversation, so these have to be caught before publishing.
 */
function overlongTitles(node: PublishNode): string[] {
  if (node.type !== "sendMessage") return [];
  const messages = Array.isArray(node.data?.messages) ? node.data.messages : [];
  const titles: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    for (const key of ["buttons", "quickReplies"]) {
      const items = Array.isArray(record[key]) ? (record[key] as unknown[]) : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const title = (item as Record<string, unknown>).title;
        if (typeof title === "string" && title.length > MAX_TITLE_LENGTH) {
          titles.push(title);
        }
      }
    }
  }
  return titles;
}

export function validateFlowForPublication(
  nodes: PublishNode[],
  edges: PublishEdge[],
): string[] {
  const errors: string[] = [];
  if (nodes.length > 100) errors.push("A flow may contain at most 100 nodes.");
  if (edges.length > 200) errors.push("A flow may contain at most 200 edges.");
  if (nodes.filter((node) => node.type === "sendMessage").length > 20) {
    errors.push("A flow may contain at most 20 send-message nodes.");
  }

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!node.id || nodeIds.has(node.id)) errors.push(`Duplicate or empty node id: ${node.id || "(empty)"}.`);
    nodeIds.add(node.id);
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge source ${edge.source} is missing.`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge target ${edge.target} is missing.`);
  }

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    if (adjacency.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const detectCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (detectCycle(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (nodes.some((node) => detectCycle(node.id))) {
    errors.push("Flow contains a cycle; cycles are blocked to prevent message amplification.");
  }

  for (const node of nodes) {
    if (node.type !== "httpRequest") continue;
    const configuredUrl = node.data?.url;
    if (typeof configuredUrl !== "string" || !configuredUrl) {
      errors.push(`HTTP node ${node.id} has no URL.`);
      continue;
    }
    const originPart = configuredUrl.split("/", 3).join("/");
    if (originPart.includes("{{")) {
      errors.push(`HTTP node ${node.id} may not interpolate variables into the URL origin.`);
      continue;
    }
    try {
      validateOutboundHttpUrl(configuredUrl.replace(/\{\{\w+\}\}/g, "safe"));
    } catch (error) {
      errors.push(`HTTP node ${node.id}: ${error instanceof Error ? error.message : "unsafe URL"}`);
    }
  }

  for (const node of nodes) {
    for (const title of overlongTitles(node)) {
      errors.push(
        `Node ${node.id}: label "${title}" is ${title.length} characters; Instagram rejects anything over ${MAX_TITLE_LENGTH} and the session stops mid-flow.`,
      );
    }
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const urlsReachableFrom = (start: string): Set<string> => {
    const urls = new Set<string>();
    const queue = [start];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const current = byId.get(id);
      if (current) outboundUrls(current).forEach((url) => urls.add(url));
      (adjacency.get(id) ?? []).forEach((next) => queue.push(next));
    }
    return urls;
  };

  for (const node of nodes) {
    if (node.type !== "condition" || node.data?.conditionType !== "instagram_follower") continue;
    if (node.data.allowFollowerGatedContent === true) continue;
    const trueTarget = edges.find(
      (edge) =>
        edge.source === node.id &&
        normalizeConditionHandle(edge.sourceHandle) === "true",
    )?.target;
    const falseTarget = edges.find(
      (edge) =>
        edge.source === node.id &&
        normalizeConditionHandle(edge.sourceHandle) === "false",
    )?.target;
    if (!trueTarget || !falseTarget) continue;
    const trueUrls = urlsReachableFrom(trueTarget);
    const falseUrls = urlsReachableFrom(falseTarget);
    if ([...trueUrls].some((url) => !falseUrls.has(url))) {
      errors.push(
        "Follower-gated promised URLs are blocked by policy safety; deliver the same URL on both branches and use follower status only for personalization.",
      );
    }
  }

  return [...new Set(errors)];
}
