import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export interface FunnelStage {
  key: "entered" | "dmDelivered" | "engaged" | "completed";
  label: string;
  count: number;
  /** Percentage of the first stage's count; the first stage is always 100. */
  pct: number;
}

export interface FlowFunnel {
  flowId: string;
  flowName: string;
  since: string;
  until: string;
  stages: FunnelStage[];
  /**
   * Sessions confirmed as a follower at completion, or null when the flow has
   * no instagram_follower condition node — most flows never gate on this, and
   * a 0 would misreport "nobody followed" instead of "not tracked here".
   */
  followersConfirmed: number | null;
  /**
   * Completions across the flow's whole history, ignoring the selected period.
   * Pairs with the post's lifetime view count, which the platform only exposes
   * as a since-publication total: dividing a windowed numerator by an
   * unwindowed denominator would produce a meaningless ratio.
   */
  lifetimeCompleted: number;
  /** Instagram post ids the trigger watches; empty when it listens to all posts. */
  monitoredPostIds: string[];
}

interface SessionRow {
  status: string;
  variables: Record<string, unknown> | null;
}

const STAGE_LABELS: Record<FunnelStage["key"], string> = {
  entered: "Comentou a keyword",
  dmDelivered: "DM entregue",
  engaged: "Respondeu no Direct",
  completed: "Completou o fluxo",
};

/**
 * Pure funnel math, kept separate from the Supabase fetch so it is testable
 * without a database. Each stage counts sessions carrying evidence of that
 * step; "DM delivered" and "engaged" read variables the engine already
 * writes for every comment-triggered flow, not anything this feature had
 * to instrument.
 *
 * "engaged" cannot just check that variables.message is set: engine.ts sets
 * `variables.message ??= incomingMessage.text` on the very first node of
 * every session, so a contact who never replied still carries the original
 * comment's text there. Verified against production data (texto whisper):
 * with that naive check, "replied" came out higher than "DM delivered" —
 * impossible, since you cannot reply to a DM you were never sent. Comparing
 * against comment_text (only present on comment-triggered sessions) filters
 * that default out; sessions without it fall back to presence, since there
 * is nothing to compare against.
 */
export function computeFunnelStages(sessions: SessionRow[]): FunnelStage[] {
  const entered = sessions.length;
  const dmDelivered = sessions.filter(
    (s) => s.variables?.private_reply_sent === "true",
  ).length;
  const engaged = sessions.filter((s) => {
    const message = s.variables?.message;
    if (typeof message !== "string" || message.trim().length === 0) return false;
    const commentText = s.variables?.comment_text;
    if (typeof commentText === "string") return message !== commentText;
    return true;
  }).length;
  const completed = sessions.filter((s) => s.status === "completed").length;

  const counts: Record<FunnelStage["key"], number> = {
    entered,
    dmDelivered,
    engaged,
    completed,
  };

  return (Object.keys(counts) as FunnelStage["key"][]).map((key) => ({
    key,
    label: STAGE_LABELS[key],
    count: counts[key],
    pct: entered > 0 ? Math.round((counts[key] / entered) * 100) : 0,
  }));
}

function hasFollowerGateNode(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => {
    const data = (node as { data?: Record<string, unknown> })?.data;
    return data?.conditionType === "instagram_follower";
  });
}

/** Post ids a comment trigger watches; empty when scoped to every post. */
export function monitoredPostIds(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  const ids = new Set<string>();
  for (const node of nodes) {
    const data = (node as { data?: Record<string, unknown> })?.data;
    if (data?.triggerType !== "comment_keyword") continue;
    if (data.postScope !== "specific") continue;
    const postIds = data.postIds;
    if (!Array.isArray(postIds)) continue;
    for (const id of postIds) if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

export async function getFlowFunnel(
  supabase: SupabaseClient<Database>,
  params: { workspaceId: string; flowId: string; since: string; until: string },
): Promise<FlowFunnel | null> {
  const { workspaceId, flowId, since, until } = params;

  const { data: flow } = await supabase
    .from("flows")
    .select("id, name, nodes")
    .eq("id", flowId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!flow) return null;

  // Fetched unfiltered and split in memory: the period funnel and the lifetime
  // completion count come from the same rows, so this avoids a second query
  // just to total the history.
  const { data: sessions } = await supabase
    .from("flow_sessions")
    .select("status, variables, created_at")
    .eq("flow_id", flowId);

  const all = (sessions ?? []) as Array<SessionRow & { created_at: string }>;
  const inPeriod = all.filter((s) => s.created_at >= since && s.created_at <= until);

  const followersConfirmed = hasFollowerGateNode(flow.nodes)
    ? inPeriod.filter(
        (s) => s.status === "completed" && s.variables?.instagram_follower === "true",
      ).length
    : null;

  return {
    flowId: flow.id,
    flowName: flow.name,
    since,
    until,
    stages: computeFunnelStages(inPeriod),
    followersConfirmed,
    lifetimeCompleted: all.filter((s) => s.status === "completed").length,
    monitoredPostIds: monitoredPostIds(flow.nodes),
  };
}
